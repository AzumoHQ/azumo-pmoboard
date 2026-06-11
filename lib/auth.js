const crypto = require('node:crypto');
const { ensureSchema, getSql } = require('./data-store');

const SESSION_COOKIE = 'pmo_session';
const OAUTH_STATE_COOKIE = 'pmo_oauth_state';
const SESSION_DAYS = Number(process.env.PMO_SESSION_DAYS || 7);
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const PASSWORD_MIN_LENGTH = 10;
const ROLE_ALIASES = new Map([
  ['admin', 'PMO'],
  ['pmo', 'PMO'],
  ['executive', 'Executive'],
  ['viewer', 'Executive'],
  ['c-level', 'Executive'],
  ['clevel', 'Executive'],
  ['csm', 'CSM'],
  ['pm', 'PM'],
  ['tl', 'TL'],
  ['hr', 'HR'],
  ['assignee', 'Assignee']
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function authSecret() {
  const secret = String(process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for authentication.');
  return secret;
}

function normalizeRoleKey(role) {
  return String(role || '').trim().toLowerCase();
}

function canonicalRole(role, fallback = 'Executive') {
  return ROLE_ALIASES.get(normalizeRoleKey(role)) || fallback;
}

function isPmoRole(role) {
  return canonicalRole(role, '') === 'PMO' || normalizeRoleKey(role) === 'admin';
}

function splitDisplayName(name, email = '') {
  const fallback = String(email || '').split('@')[0] || '';
  const cleaned = String(name || fallback)
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' ')
  };
}

function composeDisplayName(firstName, lastName, fallback = '') {
  const fullName = [firstName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return fullName || String(fallback || '').trim();
}

function parseCookies(header = '') {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, eq).trim());
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Number(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function signValue(value) {
  const payload = String(value || '');
  const signature = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySignedValue(value) {
  const raw = String(value || '');
  const split = raw.lastIndexOf('.');
  if (split <= 0) return '';
  const payload = raw.slice(0, split);
  const signature = raw.slice(split + 1);
  const expected = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!providedBuffer.length || providedBuffer.length !== expectedBuffer.length) return '';
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return '';
  return payload;
}

function readSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return '';
  return verifySignedValue(raw) || raw;
}

function oauthStateCookie(value, maxAge = OAUTH_STATE_MAX_AGE_SECONDS) {
  return serializeCookie(OAUTH_STATE_COOKIE, signValue(value), {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    sameSite: 'Lax',
    path: '/',
    maxAge
  });
}

function clearOauthStateCookie() {
  return serializeCookie(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

function readOauthState(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const raw = cookies[OAUTH_STATE_COOKIE];
  if (!raw) return null;
  const payload = verifySignedValue(raw);
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  return serializeCookie(SESSION_COOKIE, signValue(token), {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    sameSite: 'Lax',
    path: '/',
    maxAge
  });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash = '') {
  const [algorithm, salt, hash] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const attempted = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (attempted.length !== expected.length) return false;
  return crypto.timingSafeEqual(attempted, expected);
}

function assertPassword(password) {
  if (!password || String(password).length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

function safeUser(row) {
  if (!row) return null;
  const name = composeDisplayName(row.first_name, row.last_name, row.name || row.email || '');
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    name,
    role: canonicalRole(row.role),
    azumo_id: row.azumo_id ?? null,
    active: row.active !== false && row.is_active !== false,
    last_login_at: row.last_login_at || null
  };
}

async function syncUserProfile(sql, { email, name, role, active = true, azumoId = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  const { firstName, lastName } = splitDisplayName(name, normalizedEmail);
  await sql`
    INSERT INTO users (email, azumo_id, first_name, last_name, role, is_active, updated_at)
    VALUES (
      ${normalizedEmail},
      ${azumoId ?? null},
      ${firstName || null},
      ${lastName || null},
      ${canonicalRole(role)},
      ${Boolean(active)},
      now()
    )
    ON CONFLICT (email) DO UPDATE SET
      azumo_id = COALESCE(EXCLUDED.azumo_id, users.azumo_id),
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), users.first_name),
      last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), users.last_name),
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      updated_at = now()
  `;
}

async function sqlRequired() {
  const sql = getSql({ required: true });
  if (!sql) throw new Error('DATABASE_URL is required for users.');
  await ensureSchema(sql);
  return sql;
}

async function getUserByEmail(email) {
  const sql = await sqlRequired();
  const rows = await sql`
    SELECT
      p.id AS auth_id,
      COALESCE(u.id::text, p.id) AS id,
      COALESCE(u.email, p.email) AS email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.name) AS name,
      u.first_name,
      u.last_name,
      u.azumo_id,
      COALESCE(u.role, p.role) AS role,
      COALESCE(u.is_active, p.active) AS active,
      p.password_hash,
      p.last_login_at
    FROM pmo_users p
    LEFT JOIN users u ON u.email = p.email
    WHERE p.email = ${normalizeEmail(email)}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getAuthorizedUserByEmail(email) {
  const sql = await sqlRequired();
  const rows = await sql`
    SELECT
      id::text AS id,
      email,
      first_name,
      last_name,
      azumo_id,
      role,
      is_active,
      created_at,
      updated_at
    FROM users
    WHERE email = ${normalizeEmail(email)}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function ensureAuthRecordForUser(sql, user) {
  const email = normalizeEmail(user.email);
  const displayName = composeDisplayName(user.first_name, user.last_name, email);
  const rows = await sql`
    INSERT INTO pmo_users (id, email, name, role, password_hash, active)
    VALUES (${crypto.randomUUID()}, ${email}, ${displayName}, ${canonicalRole(user.role)}, ${'oauth$$'}, ${Boolean(user.is_active !== false)})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      active = EXCLUDED.active,
      updated_at = now()
    RETURNING id
  `;
  return rows[0]?.id || '';
}

async function issueSession(sql, authUserId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await sql`DELETE FROM pmo_sessions WHERE expires_at < now()`;
  await sql`
    INSERT INTO pmo_sessions (id, user_id, token_hash, expires_at)
    VALUES (${sessionId}, ${authUserId}, ${hash}, ${expiresAt.toISOString()})
  `;
  return token;
}

async function upsertUser({ email, name, role = 'Executive', password, active = true, azumoId = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error('Email is required.');
  assertPassword(password);
  const sql = await sqlRequired();
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const displayName = String(name || normalizedEmail).trim();
  const normalizedRole = canonicalRole(role);

  await sql`
    INSERT INTO pmo_users (id, email, name, role, password_hash, active)
    VALUES (${id}, ${normalizedEmail}, ${displayName}, ${normalizedRole}, ${passwordHash}, ${Boolean(active)})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      active = EXCLUDED.active,
      updated_at = now()
  `;
  await syncUserProfile(sql, { email: normalizedEmail, name: displayName, role: normalizedRole, active, azumoId });
  return safeUser(await getUserByEmail(normalizedEmail));
}

async function login(email, password) {
  const sql = await sqlRequired();
  const user = await getUserByEmail(email);
  if (!user || user.active === false || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  const authUserId = user.auth_id || user.id;
  const token = await issueSession(sql, authUserId);
  await sql`UPDATE pmo_users SET last_login_at = now(), updated_at = now() WHERE id = ${authUserId}`;
  await syncUserProfile(sql, user);

  return { token, user: safeUser({ ...user, last_login_at: new Date().toISOString() }) };
}

async function loginWithGoogle(email) {
  const sql = await sqlRequired();
  const user = await getAuthorizedUserByEmail(email);
  if (!user || user.is_active === false) {
    return null;
  }

  const authUserId = await ensureAuthRecordForUser(sql, user);
  const token = await issueSession(sql, authUserId);
  await sql`UPDATE pmo_users SET last_login_at = now(), updated_at = now() WHERE id = ${authUserId}`;

  return {
    token,
    user: safeUser({
      ...user,
      active: user.is_active,
      last_login_at: new Date().toISOString()
    })
  };
}

async function getSessionUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;

  const sql = getSql();
  if (!sql) return null;
  await ensureSchema(sql);
  const hash = tokenHash(token);
  const rows = await sql`
    SELECT
      p.id AS auth_id,
      COALESCE(u.id::text, p.id) AS id,
      COALESCE(u.email, p.email) AS email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.name) AS name,
      u.first_name,
      u.last_name,
      u.azumo_id,
      COALESCE(u.role, p.role) AS role,
      COALESCE(u.is_active, p.active) AS active,
      p.last_login_at
    FROM pmo_sessions s
    JOIN pmo_users p ON p.id = s.user_id
    LEFT JOIN users u ON u.email = p.email
    WHERE s.token_hash = ${hash}
      AND s.expires_at > now()
      AND COALESCE(u.is_active, p.active) = true
    LIMIT 1
  `;
  return safeUser(rows[0] || null);
}

async function logout(req) {
  const token = readSessionToken(req);
  if (!token) return;
  const sql = getSql();
  if (!sql) return;
  await ensureSchema(sql);
  await sql`DELETE FROM pmo_sessions WHERE token_hash = ${tokenHash(token)}`;
}

async function changePassword(req, currentPassword, newPassword) {
  assertPassword(newPassword);
  const token = readSessionToken(req);
  if (!token) throw new Error('Not signed in.');

  const sql = await sqlRequired();
  const hash = tokenHash(token);
  const rows = await sql`
    SELECT
      p.id AS auth_id,
      COALESCE(u.id::text, p.id) AS id,
      COALESCE(u.email, p.email) AS email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.name) AS name,
      u.first_name,
      u.last_name,
      u.azumo_id,
      COALESCE(u.role, p.role) AS role,
      COALESCE(u.is_active, p.active) AS active,
      p.password_hash,
      p.last_login_at
    FROM pmo_sessions s
    JOIN pmo_users p ON p.id = s.user_id
    LEFT JOIN users u ON u.email = p.email
    WHERE s.token_hash = ${hash}
      AND s.expires_at > now()
      AND COALESCE(u.is_active, p.active) = true
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new Error('Not signed in.');
  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new Error('Current password is incorrect.');
  }

  await sql`
    UPDATE pmo_users
    SET password_hash = ${hashPassword(newPassword)}, updated_at = now()
    WHERE id = ${user.auth_id || user.id}
  `;
  // Keep the current browser signed in; remove all other sessions for safety.
  await sql`DELETE FROM pmo_sessions WHERE user_id = ${user.auth_id || user.id} AND token_hash <> ${hash}`;
  return safeUser(user);
}

async function listUsers() {
  const sql = await sqlRequired();
  const rows = await sql`
    SELECT
      COALESCE(u.id::text, p.id) AS id,
      COALESCE(u.email, p.email) AS email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.name) AS name,
      u.first_name,
      u.last_name,
      u.azumo_id,
      COALESCE(u.role, p.role) AS role,
      COALESCE(u.is_active, p.active) AS active,
      p.last_login_at
    FROM users u
    FULL OUTER JOIN pmo_users p ON p.email = u.email
    ORDER BY COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.name, COALESCE(u.email, p.email)) ASC
  `;
  return rows.map(safeUser);
}

function canRefresh(user) {
  return Boolean(user && user.active !== false && isPmoRole(user.role));
}

function canAdmin(user) {
  return Boolean(user && user.active !== false && isPmoRole(user.role));
}

module.exports = {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  PASSWORD_MIN_LENGTH,
  canAdmin,
  canRefresh,
  changePassword,
  clearOauthStateCookie,
  clearSessionCookie,
  getSessionUser,
  getAuthorizedUserByEmail,
  listUsers,
  login,
  loginWithGoogle,
  logout,
  oauthStateCookie,
  readOauthState,
  sessionCookie,
  upsertUser
};
