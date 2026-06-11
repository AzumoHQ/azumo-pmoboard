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

function getSql(options = {}) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { neon } = require('@neondatabase/serverless');
    return neon(process.env.DATABASE_URL);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && options.required) {
      throw new Error('Missing @neondatabase/serverless. Run npm install before writing to Neon.');
    }
    if (error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS pmo_meta (
      key text PRIMARY KEY,
      value text NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pmo_snapshots (
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

  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS forecast_total integer`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS forecast_source text`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS bench_source text`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS account_coverage jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS account_coverage_source text`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS non_billable_epic_assignments jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS bench_by_month jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS utilization_billing_rate jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS harvest jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS data_quality jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS data_lineage jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE pmo_snapshots ADD COLUMN IF NOT EXISTS assignment_rows jsonb NOT NULL DEFAULT '[]'::jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS pmo_notes (
      id text PRIMARY KEY,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pmo_users (
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
    CREATE TABLE IF NOT EXISTS pmo_sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES pmo_users(id) ON DELETE CASCADE,
      token_hash text UNIQUE NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_token_hash ON pmo_sessions(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_user_id ON pmo_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pmo_sessions_expires_at ON pmo_sessions(expires_at)`;
}

async function getDashboardData() {
  const sql = getSql();
  if (!sql) return getFileDashboardData();

  try {
    await ensureSchema(sql);

    const metaRows = await sql`SELECT key, value FROM pmo_meta`;
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
      FROM pmo_snapshots
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
  const entries = Object.entries(meta || {}).filter(([, value]) => value !== undefined && value !== null);
  for (const [key, value] of entries) {
    await sql`
      INSERT INTO pmo_meta (key, value)
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

  const date = snapshot.date || new Date().toISOString().slice(0, 10);
  const label = snapshot.label || new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  await sql`
    INSERT INTO pmo_snapshots (
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
  const importedLastRefresh = latestSnapshotDate(data.snapshots) || data.last_refresh || '';

  // Treat pmo-data.json as the source of truth when importing, so resets
  // intentionally remove older historical snapshots from Neon.
  await sql`DELETE FROM pmo_snapshots`;

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
  const rows = await sql`
    SELECT id, title, body, tags, created_at
    FROM pmo_notes
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
  const id = crypto.randomUUID();
  const title = note.title || 'Sin titulo';
  const body = note.body || '';
  const tags = Array.isArray(note.tags) ? note.tags : [];

  await sql`
    INSERT INTO pmo_notes (id, title, body, tags)
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
  await sql`DELETE FROM pmo_notes WHERE id = ${id}`;
}

module.exports = {
  ensureSchema,
  getSql,
  getDashboardData,
  saveSnapshot,
  importDashboardData,
  getNotes,
  addNote,
  deleteNote
};
