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
      bench_list jsonb NOT NULL DEFAULT '[]'::jsonb,
      pending_list jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pmo_notes (
      id text PRIMARY KEY,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
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
      snapshots: snapshotRows.map((row) => ({
        date: isoDateValue(row.snapshot_date),
        label: row.label,
        metrics: jsonValue(row.metrics, {}),
        expiring_60d: jsonValue(row.expiring_60d, []),
        active_clients: jsonValue(row.active_clients, []),
        forecast: jsonValue(row.forecast, {}),
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
      ${JSON.stringify(snapshot.bench_list || [])}::jsonb,
      ${JSON.stringify(snapshot.pending_list || [])}::jsonb
    )
    ON CONFLICT (snapshot_date) DO UPDATE SET
      label = EXCLUDED.label,
      metrics = EXCLUDED.metrics,
      expiring_60d = EXCLUDED.expiring_60d,
      active_clients = EXCLUDED.active_clients,
      forecast = EXCLUDED.forecast,
      bench_list = EXCLUDED.bench_list,
      pending_list = EXCLUDED.pending_list,
      updated_at = now()
  `;

  await saveMeta(sql, {
    project: meta.project || 'AA',
    cloudId: meta.cloudId || '',
    last_refresh: meta.last_refresh || date
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
  const latestRows = await sql`SELECT max(snapshot_date) AS latest FROM pmo_snapshots`;
  const latestDate = isoDateValue(latestRows[0]?.latest) || importedLastRefresh;

  await saveMeta(sql, {
    cloudId: data.cloudId || '',
    project: data.project || 'AA',
    last_refresh: latestDate
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
    last_refresh: importedLastRefresh
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
  getDashboardData,
  saveSnapshot,
  importDashboardData,
  getNotes,
  addNote,
  deleteNote
};
