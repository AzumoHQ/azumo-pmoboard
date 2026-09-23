// Admin data layer: company roles, people directory (one Jira AA Epic = one employee),
// account coverage edits and the admin audit log. Tables are created in
// lib/data-store.js ensureSchema() like the rest of the board.
const { ensureSchema, getSql, qualified } = require('./data-store');

const COVERAGE_SLOTS = ['PM', 'CSM', 'TL'];

// ensureSchema runs ~70 CREATE/ALTER statements; one admin request calls db() several
// times, so run it once per warm function instance instead of on every call.
let schemaReady = null;
async function db() {
  const sql = getSql({ required: true });
  if (!sql) throw new Error('DATABASE_URL is required for admin data');
  if (!schemaReady) schemaReady = ensureSchema(sql).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
  return { sql, q: (name) => qualified(sql, name) };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fieldText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(', ');
  return String(value.value || value.name || value.displayName || '').trim();
}

function normalizeSlot(slot) {
  const value = String(slot || '').trim().toUpperCase();
  return COVERAGE_SLOTS.includes(value) ? value : null;
}

// First guess only, applied when a role is created from Jira. Editable afterwards in Roles.
function guessCoverageSlot(roleName) {
  const n = normalizeName(roleName);
  if (/\bcsm\b|customer success/.test(n)) return 'CSM';
  if (/\bproject manager\b|^pm$|\bpm\b/.test(n)) return 'PM';
  if (/\btech(nical)? lead\b|^tl$|\btl\b|team lead/.test(n)) return 'TL';
  return null;
}

// ---------- Roles ----------
async function listRoles() {
  const { sql, q } = await db();
  return sql`
    SELECT id, name, coverage_slot, source, created_at, updated_at
    FROM ${q('company_roles')}
    ORDER BY lower(name) ASC
  `;
}

async function upsertRole({ id, name, coverage_slot }) {
  const { sql, q } = await db();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Role name is required.');
  const slot = normalizeSlot(coverage_slot);
  if (id) {
    const rows = await sql`
      UPDATE ${q('company_roles')}
      SET name = ${cleanName}, coverage_slot = ${slot}, updated_at = now()
      WHERE id = ${Number(id)}
      RETURNING id, name, coverage_slot, source
    `;
    if (!rows.length) throw new Error('Role not found.');
    return rows[0];
  }
  const rows = await sql`
    INSERT INTO ${q('company_roles')} (name, coverage_slot, source)
    VALUES (${cleanName}, ${slot}, 'manual')
    ON CONFLICT (name) DO UPDATE SET coverage_slot = EXCLUDED.coverage_slot, updated_at = now()
    RETURNING id, name, coverage_slot, source
  `;
  return rows[0];
}

async function deleteRole(id) {
  const { sql, q } = await db();
  await sql`DELETE FROM ${q('company_roles')} WHERE id = ${Number(id)}`;
}

// ---------- People ----------
async function listPeople() {
  const { sql, q } = await db();
  const [people, roles] = await Promise.all([
    sql`
      SELECT jira_epic_key, name, email, jira_account_id, jira_position, position_field_kind,
        role_id, freelance, start_date, status, synced_at
      FROM ${q('company_people')}
      ORDER BY lower(name) ASC
    `,
    listRoles()
  ]);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const byName = new Map(roles.map((r) => [normalizeName(r.name), r]));
  return people.map((p) => {
    const override = p.role_id ? byId.get(p.role_id) : null;
    const fromJira = p.jira_position ? byName.get(normalizeName(p.jira_position)) : null;
    const role = override || fromJira || null;
    return {
      ...p,
      role_name: role?.name || p.jira_position || '',
      role_effective_id: role?.id || null,
      coverage_slot: role?.coverage_slot || null,
      role_source: override ? 'override' : (fromJira ? 'jira' : 'none'),
      // Overridden and different from Jira = pending until written back.
      differs_from_jira: Boolean(override && normalizeName(override.name) !== normalizeName(p.jira_position))
    };
  });
}

// Pulls every AA Epic (employee), upserts company_people and creates any Position that
// isn't in the role catalog yet. Manual role overrides (role_id) are never touched here.
async function syncPeopleFromJira({ issues = [], positionFieldId, users = [] }) {
  const { sql, q } = await db();
  const usersByName = new Map(users.map((u) => [normalizeName(u.name || `${u.first_name || ''} ${u.last_name || ''}`), u]));
  const positions = new Set();
  let upserted = 0;

  for (const issue of issues) {
    const f = issue.fields || {};
    const name = String(f.summary || '').trim();
    if (!issue.key || !name) continue;
    const rawPosition = f[positionFieldId];
    const position = fieldText(rawPosition);
    const kind = rawPosition && typeof rawPosition === 'object' ? (Array.isArray(rawPosition) ? 'multi' : 'option') : (rawPosition ? 'text' : null);
    const assignee = f.assignee || null;
    const assigneeMatches = assignee && normalizeName(assignee.displayName) === normalizeName(name);
    const email = (assigneeMatches && assignee.emailAddress)
      ? String(assignee.emailAddress).trim().toLowerCase()
      : String(usersByName.get(normalizeName(name))?.email || '').trim().toLowerCase() || null;
    const accountId = assigneeMatches ? (assignee.accountId || null) : null;
    if (position) positions.add(position);

    await sql`
      INSERT INTO ${q('company_people')} AS cp (
        jira_epic_key, name, email, jira_account_id, jira_position, position_field_kind,
        freelance, start_date, status, synced_at, updated_at
      ) VALUES (
        ${issue.key}, ${name}, ${email}, ${accountId}, ${position || null}, ${kind},
        ${fieldText(f.customfield_13480) || null}, ${fieldText(f.customfield_10800) || null},
        ${fieldText(f.status) || null}, now(), now()
      )
      ON CONFLICT (jira_epic_key) DO UPDATE SET
        name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, cp.email),
        jira_account_id = COALESCE(EXCLUDED.jira_account_id, cp.jira_account_id),
        jira_position = EXCLUDED.jira_position,
        position_field_kind = COALESCE(EXCLUDED.position_field_kind, cp.position_field_kind),
        freelance = EXCLUDED.freelance,
        start_date = EXCLUDED.start_date,
        status = EXCLUDED.status,
        synced_at = now(),
        updated_at = now()
    `;
    upserted += 1;
  }

  let rolesCreated = 0;
  for (const position of positions) {
    const rows = await sql`
      INSERT INTO ${q('company_roles')} (name, coverage_slot, source)
      VALUES (${position}, ${guessCoverageSlot(position)}, 'jira')
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `;
    rolesCreated += rows.length;
  }
  return { people: upserted, positions: positions.size, roles_created: rolesCreated };
}

async function getPerson(epicKey) {
  const { sql, q } = await db();
  const rows = await sql`SELECT * FROM ${q('company_people')} WHERE jira_epic_key = ${epicKey} LIMIT 1`;
  return rows[0] || null;
}

async function findPersonByEmail(email) {
  const { sql, q } = await db();
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  const rows = await sql`SELECT * FROM ${q('company_people')} WHERE lower(email) = ${target} LIMIT 1`;
  return rows[0] || null;
}

// Users that have no AA Epic (e.g. a board user who isn't in Jira yet) get a local-only
// people row keyed "manual:<email>", so they can still hold a company role.
async function ensureManualPerson({ email, name }) {
  const { sql, q } = await db();
  const key = `manual:${String(email).trim().toLowerCase()}`;
  await sql`
    INSERT INTO ${q('company_people')} (jira_epic_key, name, email, updated_at)
    VALUES (${key}, ${name || email}, ${String(email).trim().toLowerCase()}, now())
    ON CONFLICT (jira_epic_key) DO NOTHING
  `;
  return getPerson(key);
}

async function setPersonRole(epicKey, roleId) {
  const { sql, q } = await db();
  await sql`
    UPDATE ${q('company_people')}
    SET role_id = ${roleId ? Number(roleId) : null}, updated_at = now()
    WHERE jira_epic_key = ${epicKey}
  `;
}

async function setPersonJiraPosition(epicKey, position) {
  const { sql, q } = await db();
  await sql`
    UPDATE ${q('company_people')}
    SET jira_position = ${position || null}, updated_at = now()
    WHERE jira_epic_key = ${epicKey}
  `;
}

async function setPersonAccountId(epicKey, accountId) {
  const { sql, q } = await db();
  await sql`UPDATE ${q('company_people')} SET jira_account_id = ${accountId} WHERE jira_epic_key = ${epicKey}`;
}

// ---------- Accounts (latest snapshot's account_coverage) ----------
async function getLatestAccountCoverage() {
  const { sql, q } = await db();
  const rows = await sql`
    SELECT snapshot_date, account_coverage
    FROM ${q('pmo_snapshots')}
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;
  if (!rows.length) return { snapshot_date: null, accounts: [] };
  const raw = rows[0].account_coverage;
  const accounts = Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : []);
  return { snapshot_date: rows[0].snapshot_date, accounts };
}

// After a successful Jira write, patch the same row in the latest snapshot so the board
// shows the change right away instead of waiting for the next sync.
async function patchLatestAccountCoverageRow(key, patch) {
  const { sql, q } = await db();
  const { snapshot_date: date, accounts } = await getLatestAccountCoverage();
  if (!date) return null;
  const next = accounts.map((row) => {
    if (row.key !== key) return row;
    const merged = { ...row, ...patch };
    merged.missing = [['PM', merged.pm_assigned], ['CSM', merged.csm_assigned], ['TL', merged.tl_assigned]]
      .filter(([, v]) => !v).map(([label]) => label);
    merged.complete = merged.missing.length === 0;
    return merged;
  });
  await sql`
    UPDATE ${q('pmo_snapshots')}
    SET account_coverage = ${JSON.stringify(next)}::jsonb, updated_at = now()
    WHERE snapshot_date = ${date}
  `;
  return next.find((row) => row.key === key) || null;
}

// ---------- Audit ----------
async function addAudit(entry) {
  const { sql, q } = await db();
  await sql`
    INSERT INTO ${q('admin_audit_log')} (actor_email, entity, entity_key, field, old_value, new_value, jira_status, detail)
    VALUES (
      ${entry.actor_email || null}, ${entry.entity}, ${entry.entity_key || null}, ${entry.field || null},
      ${entry.old_value ?? null}, ${entry.new_value ?? null}, ${entry.jira_status || null}, ${entry.detail || null}
    )
  `;
}

async function listAudit(limit = 150) {
  const { sql, q } = await db();
  return sql`
    SELECT id, at, actor_email, entity, entity_key, field, old_value, new_value, jira_status, detail
    FROM ${q('admin_audit_log')}
    ORDER BY at DESC
    LIMIT ${Number(limit) || 150}
  `;
}

module.exports = {
  COVERAGE_SLOTS,
  normalizeName,
  listRoles,
  upsertRole,
  deleteRole,
  listPeople,
  syncPeopleFromJira,
  getPerson,
  findPersonByEmail,
  ensureManualPerson,
  setPersonRole,
  setPersonJiraPosition,
  setPersonAccountId,
  getLatestAccountCoverage,
  patchLatestAccountCoverageRow,
  addAudit,
  listAudit
};
