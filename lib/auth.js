const crypto = require('node:crypto');
const { ensureSchema, getSql } = require('./data-store');

const SESSION_COOKIE = 'pmo_session';
const SESSION_DAYS = Number(process.env.PMO_SESSION_DAYS || 7);
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const PASSWORD_MIN_LENGTH = 10;
const REFRESH_ROLES = new Set(['admin', 'pmo']);
const ADMIN_ROLES = new Set(['admin']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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

function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  return serializeCookie(SESSION_COOKIE, token, {
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
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active !== false,
    last_login_at: row.last_login_at || null
  };
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
    SELECT id, email, name, role, active, password_hash, last_login_at
    FROM pmo_users
    WHERE email = ${normalizeEmail(email)}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function upsertUser({ email, name, role = 'viewer', password, active = true }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error('Email is required.');
  assertPassword(password);
  const sql = await sqlRequired();
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const displayName = String(name || normalizedEmail).trim();
  const normalizedRole = String(role || 'viewer').trim().toLowerCase();

  const rows = await sql`
    INSERT INTO pmo_users (id, email, name, role, password_hash, active)
    VALUES (${id}, ${normalizedEmail}, ${displayName}, ${normalizedRole}, ${passwordHash}, ${Boolean(active)})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      active = EXCLUDED.active,
      updated_at = now()
    RETURNING id, email, name, role, active, last_login_at
  `;
  return safeUser(rows[0]);
}

async function login(email, password) {
  const sql = await sqlRequired();
  const user = await getUserByEmail(email);
  if (!user || user.active === false || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid email or password.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await sql`DELETE FROM pmo_sessions WHERE expires_at < now()`;
  await sql`
    INSERT INTO pmo_sessions (id, user_id, token_hash, expires_at)
    VALUES (${sessionId}, ${user.id}, ${hash}, ${expiresAt.toISOString()})
  `;
  await sql`UPDATE pmo_users SET last_login_at = now(), updated_at = now() WHERE id = ${user.id}`;

  return { token, user: safeUser({ ...user, last_login_at: new Date().toISOString() }) };
}

async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const sql = getSql();
  if (!sql) return null;
  await ensureSchema(sql);
  const hash = tokenHash(token);
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role, u.active, u.last_login_at
    FROM pmo_sessions s
    JOIN pmo_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash}
      AND s.expires_at > now()
      AND u.active = true
    LIMIT 1
  `;
  return safeUser(rows[0] || null);
}

async function logout(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return;
  const sql = getSql();
  if (!sql) return;
  await ensureSchema(sql);
  await sql`DELETE FROM pmo_sessions WHERE token_hash = ${tokenHash(token)}`;
}

async function changePassword(req, currentPassword, newPassword) {
  assertPassword(newPassword);
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) throw new Error('Not signed in.');

  const sql = await sqlRequired();
  const hash = tokenHash(token);
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role, u.active, u.password_hash, u.last_login_at
    FROM pmo_sessions s
    JOIN pmo_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash}
      AND s.expires_at > now()
      AND u.active = true
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
    WHERE id = ${user.id}
  `;
  // Keep the current browser signed in; remove all other sessions for safety.
  await sql`DELETE FROM pmo_sessions WHERE user_id = ${user.id} AND token_hash <> ${hash}`;
  return safeUser(user);
}

async function listUsers() {
  const sql = await sqlRequired();
  const rows = await sql`
    SELECT id, email, name, role, active, last_login_at
    FROM pmo_users
    ORDER BY name ASC, email ASC
  `;
  return rows.map(safeUser);
}

function canRefresh(user) {
  return Boolean(user && user.active !== false && REFRESH_ROLES.has(String(user.role || '').toLowerCase()));
}

function canAdmin(user) {
  return Boolean(user && user.active !== false && ADMIN_ROLES.has(String(user.role || '').toLowerCase()));
}

module.exports = {
  SESSION_COOKIE,
  PASSWORD_MIN_LENGTH,
  canAdmin,
  canRefresh,
  changePassword,
  clearSessionCookie,
  getSessionUser,
  listUsers,
  login,
  logout,
  sessionCookie,
  upsertUser
};
