const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_FILE = path.join(__dirname, '..', 'pmo-data.json');

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function isoDateValue(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function latestSnapshotDate(snapshots) {
  return (snapshots || [])
    .map((snapshot) => snapshot.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function getFileDashboardData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      cloudId: '',
      project: 'AA',
      last_refresh: '',
      snapshots: []
    };
  }
}

const DB_SCHEMA = process.env.DB_SCHEMA || 'pmo';

// Postgres identifiers can't be passed as query parameters, so the schema name is
// interpolated directly into DDL. Reject anything that isn't a plain identifier to
// avoid SQL injection via a malformed DB_SCHEMA value.
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(DB_SCHEMA)) {
  throw new Error(`Invalid DB_SCHEMA "${DB_SCHEMA}": must be a valid SQL identifier`);
}

// Point the connection's search_path at DB_SCHEMA so all unqualified table names
// resolve into that schema. Set via the connection-string `options` param because the
// Neon HTTP driver runs each query as an independent request, so a `SET search_path`
// statement would not persist across queries. Falls back to the raw URL if it can't be
// parsed. See ALTER ROLE note in .env.example for the guaranteed server-side fallback.
function withSearchPath(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('options')) {
      u.searchParams.set('options', `-c search_path=${DB_SCHEMA},public`);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Build a schema-qualified table identifier for embedding in a tagged-template query,
// e.g. sql`SELECT * FROM ${qualified(sql, 'pmo_users')}`. Safe because DB_SCHEMA is
// validated as a plain identifier above; required because the Neon HTTP transport
// ignores the connection-string search_path, so unqualified names resolve to `public`.
function qualified(sql, name) {
  return sql.unsafe(`${DB_SCHEMA}.${name}`);
}

function getSql(options = {}) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { neon } = require('@neondatabase/serverless');
    return neon(withSearchPath(process.env.DATABASE_URL));
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && options.required) {
      throw new Error('Missing @neondatabase/serverless. Run npm install before writing to Neon.');
    }
    if (error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function ensureSchema(sql) {
  // All table names are schema-qualified with `${DB_SCHEMA}.` (via sql.unsafe, safe
  // because DB_SCHEMA is validated as a plain identifier above). We cannot rely on the
  // connection's search_path: the Neon HTTP transport ignores the connection-string
  // `options` param, so unqualified names would resolve to `public`.
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);

  // Create the target schema first so the qualified CREATE TABLEs below have somewhere to land.
  await sql.query(`CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA}`);

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_meta')} (
      key text PRIMARY KEY,
      value text NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_snapshots')} (
      snapshot_date date PRIMARY KEY,
      label text NOT NULL,
      metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      expiring_60d jsonb NOT NULL DEFAULT '[]'::jsonb,
      active_clients jsonb NOT NULL DEFAULT '[]'::jsonb,
      forecast jsonb NOT NULL DEFAULT '{}'::jsonb,
      forecast_total integer,
      forecast_source text,
      bench_source text,
      account_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
      account_coverage_source text,
      non_billable_epic_assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
      bench_by_month jsonb NOT NULL DEFAULT '{}'::jsonb,
      utilization_billing_rate jsonb NOT NULL DEFAULT '{}'::jsonb,
      harvest jsonb NOT NULL DEFAULT '{}'::jsonb,
      data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
      data_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
      assignment_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
      bench_list jsonb NOT NULL DEFAULT '[]'::jsonb,
      pending_list jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS forecast_total integer`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS forecast_source text`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS bench_source text`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS account_coverage jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS account_coverage_source text`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS non_billable_epic_assignments jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS bench_by_month jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS utilization_billing_rate jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS activity_log jsonb DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS harvest jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS data_quality jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS data_lineage jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE ${q('pmo_snapshots')} ADD COLUMN IF NOT EXISTS assignment_rows jsonb NOT NULL DEFAULT '[]'::jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_notes')} (
      id text PRIMARY KEY,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_users')} (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      name text NOT NULL,
      role text NOT NULL DEFAULT 'viewer',
      password_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )
  `;


  await sql`
    CREATE TABLE IF NOT EXISTS ${q('users')} (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      azumo_id INTEGER,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(50) NOT NULL CHECK (role IN ('PMO', 'Executive', 'CSM', 'PM', 'TL', 'HR', 'Assignee')) ,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS azumo_id INTEGER`;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
  await sql`
    UPDATE ${q('users')}
    SET role = CASE lower(trim(role))
      WHEN 'admin' THEN 'PMO'
      WHEN 'pmo' THEN 'PMO'
      WHEN 'executive' THEN 'Executive'
      WHEN 'viewer' THEN 'Executive'
      WHEN 'c-level' THEN 'Executive'
      WHEN 'clevel' THEN 'Executive'
      WHEN 'csm' THEN 'CSM'
      WHEN 'pm' THEN 'PM'
      WHEN 'tl' THEN 'TL'
      WHEN 'hr' THEN 'HR'
      WHEN 'assignee' THEN 'Assignee'
      ELSE role
    END
  `;
  await sql`ALTER TABLE ${q('users')} DROP CONSTRAINT IF EXISTS users_role_check`;
  await sql`
    ALTER TABLE ${q('users')} ADD CONSTRAINT users_role_check
    CHECK (role IN ('PMO', 'Executive', 'CSM', 'PM', 'TL', 'HR', 'Assignee'))
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON ${q('users')}(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_role ON ${q('users')}(role)`;
  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_sessions')} (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES ${q('pmo_users')}(id) ON DELETE CASCADE,
      token_hash text UNIQUE NOT NULL,
      impersonated_user jsonb,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE ${q('pmo_sessions')} ADD COLUMN IF NOT EXISTS impersonated_user jsonb`;

  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_token_hash ON ${q('pmo_sessions')}(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_user_id ON ${q('pmo_sessions')}(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_expires_at ON ${q('pmo_sessions')}(expires_at)`;
}

async function getDashboardData() {
  const sql = getSql();
  if (!sql) return getFileDashboardData();

  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);

  try {
    await ensureSchema(sql);

    const metaRows = await sql`SELECT key, value FROM ${q('pmo_meta')}`;
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
    const snapshotRows = await sql`
      SELECT
        snapshot_date,
        label,
        metrics,
        expiring_60d,
        active_clients,
        forecast,
        forecast_total,
        forecast_source,
        bench_source,
        account_coverage,
        account_coverage_source,
        non_billable_epic_assignments,
        bench_by_month,
        utilization_billing_rate,
        harvest,
        data_quality,
        data_lineage,
        assignment_rows,
        bench_list,
        pending_list
      FROM ${q('pmo_snapshots')}
      ORDER BY snapshot_date ASC
    `;

    if (!snapshotRows.length) return getFileDashboardData();

    return {
      cloudId: meta.cloudId || '',
      project: meta.project || 'AA',
      last_refresh: meta.last_refresh || isoDateValue(snapshotRows.at(-1).snapshot_date),
      last_refresh_at: meta.last_refresh_at || meta.last_refresh || isoDateValue(snapshotRows.at(-1).snapshot_date),
      history_start_date: meta.history_start_date || '',
      snapshots: snapshotRows.map((row) => ({
        date: isoDateValue(row.snapshot_date),
        label: row.label,
        metrics: jsonValue(row.metrics, {}),
        expiring_60d: jsonValue(row.expiring_60d, []),
        active_clients: jsonValue(row.active_clients, []),
        forecast: jsonValue(row.forecast, {}),
        forecast_total: row.forecast_total ?? Object.values(jsonValue(row.forecast, {})).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0),
        forecast_source: row.forecast_source || '',
        bench_source: row.bench_source || '',
        account_coverage: jsonValue(row.account_coverage, []),
        account_coverage_source: row.account_coverage_source || '',
        non_billable_epic_assignments: jsonValue(row.non_billable_epic_assignments, []),
        bench_by_month: jsonValue(row.bench_by_month, {}),
        utilization_billing_rate: jsonValue(row.utilization_billing_rate, {}),
        harvest: jsonValue(row.harvest, {}),
        data_quality: jsonValue(row.data_quality, {}),
        data_lineage: jsonValue(row.data_lineage, {}),
        assignment_rows: jsonValue(row.assignment_rows, []),
        bench_list: jsonValue(row.bench_list, []),
        pending_list: jsonValue(row.pending_list, [])
      }))
    };
  } catch (error) {
    console.warn('Falling back to pmo-data.json:', error.message);
    return getFileDashboardData();
  }
}

async function saveMeta(sql, meta) {
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const entries = Object.entries(meta || {}).filter(([, value]) => value !== undefined && value !== null);
  for (const [key, value] of entries) {
    await sql`
      INSERT INTO ${q('pmo_meta')} (key, value)
      VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
}

async function saveSnapshot(snapshot, meta = {}) {
  const sql = getSql({ required: true });
  if (!sql) {
    throw new Error('DATABASE_URL is required to save snapshots');
  }

  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);

  const date = snapshot.date || new Date().toISOString().slice(0, 10);
  const label = snapshot.label || new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  await sql`
    INSERT INTO ${q('pmo_snapshots')} (
      snapshot_date,
      label,
      metrics,
      expiring_60d,
      active_clients,
      forecast,
      forecast_total,
      forecast_source,
      bench_source,
      account_coverage,
      account_coverage_source,
      non_billable_epic_assignments,
      bench_by_month,
      utilization_billing_rate,
      harvest,
      data_quality,
      data_lineage,
      assignment_rows,
      activity_log,
      bench_list,
      pending_list
    )
    VALUES (
      ${date},
      ${label},
      ${JSON.stringify(snapshot.metrics || {})}::jsonb,
      ${JSON.stringify(snapshot.expiring_60d || [])}::jsonb,
      ${JSON.stringify(snapshot.active_clients || [])}::jsonb,
      ${JSON.stringify(snapshot.forecast || {})}::jsonb,
      ${snapshot.forecast_total ?? Object.values(snapshot.forecast || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0)},
      ${snapshot.forecast_source || ''},
      ${snapshot.bench_source || ''},
      ${JSON.stringify(snapshot.account_coverage || [])}::jsonb,
      ${snapshot.account_coverage_source || ''},
      ${JSON.stringify(snapshot.non_billable_epic_assignments || [])}::jsonb,
      ${JSON.stringify(snapshot.bench_by_month || {})}::jsonb,
      ${JSON.stringify(snapshot.utilization_billing_rate || {})}::jsonb,
      ${JSON.stringify(snapshot.harvest || {})}::jsonb,
      ${JSON.stringify(snapshot.data_quality || {})}::jsonb,
      ${JSON.stringify(snapshot.data_lineage || {})}::jsonb,
      ${JSON.stringify(snapshot.assignment_rows || [])}::jsonb,
      ${JSON.stringify(snapshot.activity_log || [])}::jsonb,
      ${JSON.stringify(snapshot.bench_list || [])}::jsonb,
      ${JSON.stringify(snapshot.pending_list || [])}::jsonb
    )
    ON CONFLICT (snapshot_date) DO UPDATE SET
      label = EXCLUDED.label,
      metrics = EXCLUDED.metrics,
      expiring_60d = EXCLUDED.expiring_60d,
      active_clients = EXCLUDED.active_clients,
      forecast = EXCLUDED.forecast,
      forecast_total = EXCLUDED.forecast_total,
      forecast_source = EXCLUDED.forecast_source,
      bench_source = EXCLUDED.bench_source,
      account_coverage = EXCLUDED.account_coverage,
      account_coverage_source = EXCLUDED.account_coverage_source,
      non_billable_epic_assignments = EXCLUDED.non_billable_epic_assignments,
      bench_by_month = EXCLUDED.bench_by_month,
      utilization_billing_rate = EXCLUDED.utilization_billing_rate,
      harvest = EXCLUDED.harvest,
      data_quality = EXCLUDED.data_quality,
      data_lineage = EXCLUDED.data_lineage,
      assignment_rows = EXCLUDED.assignment_rows,
      bench_list = EXCLUDED.bench_list,
      pending_list = EXCLUDED.pending_list,
      updated_at = now()
  `;

  await saveMeta(sql, {
    project: meta.project || 'AA',
    cloudId: meta.cloudId || '',
    last_refresh: meta.last_refresh || date,
    last_refresh_at: meta.last_refresh_at,
    history_start_date: meta.history_start_date
  });

  return getDashboardData();
}

async function importDashboardData(data) {
  const sql = getSql({ required: true });
  if (!sql) {
    throw new Error('DATABASE_URL is required to import dashboard data');
  }

  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const importedLastRefresh = latestSnapshotDate(data.snapshots) || data.last_refresh || '';

  // Treat pmo-data.json as the source of truth when importing, so resets
  // intentionally remove older historical snapshots from Neon.
  await sql`DELETE FROM ${q('pmo_snapshots')}`;

  await saveMeta(sql, {
    cloudId: data.cloudId || '',
    project: data.project || 'AA',
    last_refresh: importedLastRefresh,
    last_refresh_at: data.last_refresh_at || data.last_refresh || importedLastRefresh,
    history_start_date: data.history_start_date || ''
  });

  for (const snapshot of data.snapshots || []) {
    await saveSnapshot(snapshot, {
      cloudId: data.cloudId || '',
      project: data.project || 'AA',
      last_refresh: snapshot.date || importedLastRefresh
    });
  }

  await saveMeta(sql, {
    cloudId: data.cloudId || '',
    project: data.project || 'AA',
    last_refresh: importedLastRefresh,
    last_refresh_at: data.last_refresh_at || data.last_refresh || importedLastRefresh,
    history_start_date: data.history_start_date || ''
  });

  return getDashboardData();
}

async function getNotes() {
  const sql = getSql();
  if (!sql) return [];

  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const rows = await sql`
    SELECT id, title, body, tags, created_at
    FROM ${q('pmo_notes')}
    ORDER BY created_at ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    tags: jsonValue(row.tags, []),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    date: new Date(row.created_at).toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  }));
}

async function addNote(note) {
  const sql = getSql({ required: true });
  if (!sql) {
    throw new Error('DATABASE_URL is required to save notes');
  }

  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const id = crypto.randomUUID();
  const title = note.title || 'Sin titulo';
  const body = note.body || '';
  const tags = Array.isArray(note.tags) ? note.tags : [];

  await sql`
    INSERT INTO ${q('pmo_notes')} (id, title, body, tags)
    VALUES (${id}, ${title}, ${body}, ${JSON.stringify(tags)}::jsonb)
  `;

  return { id, title, body, tags };
}

async function deleteNote(id) {
  const sql = getSql({ required: true });
  if (!sql) {
    throw new Error('DATABASE_URL is required to delete notes');
  }

  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  await sql`DELETE FROM ${q('pmo_notes')} WHERE id = ${id}`;
}

module.exports = {
  ensureSchema,
  getSql,
  qualified,
  getDashboardData,
  saveSnapshot,
  importDashboardData,
  getNotes,
  addNote,
  deleteNote
};
