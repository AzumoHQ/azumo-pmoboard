// Weekly Harvest sheets — one row per Monday–Sunday week, the in-app replacement for the
// tabs Federica used to add by hand to "Azumo - Capacity and Utilization Rates by Week".
//
// Lifecycle of a week:
//   1. The daily refresh (cron or "Load week") computes Harvest metrics for a full Mon–Sun
//      week and calls upsertWeekFromHarvest(): the week is created the first time and its
//      Harvest numbers are refreshed on every later sync while it is still "open".
//   2. PMO presses "Close week": the Jira Billing % (Monday / Sunday) computed in the
//      browser is frozen into the rows and the week stops changing ("closed").
//   3. "Reopen" puts it back to "open" so the next sync refreshes it again.
// Weeks imported from the Excel history (data/harvest-weeks-seed.json) start "closed".
const { ensureSchema, getSql, qualified } = require('./data-store');

const TABLE = 'pmo_harvest_weeks';
let schemaReady = null;

async function db() {
  const sql = getSql({ required: true });
  if (!sql) throw new Error('DATABASE_URL is required for weekly Harvest sheets');
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureSchema(sql);
      const q = (name) => qualified(sql, name);
      await sql`
        CREATE TABLE IF NOT EXISTS ${q(TABLE)} (
          week_start date PRIMARY KEY,
          week_end date NOT NULL,
          status text NOT NULL DEFAULT 'open',
          source text NOT NULL DEFAULT 'harvest',
          sheet jsonb NOT NULL DEFAULT '{}'::jsonb,
          totals jsonb NOT NULL DEFAULT '{}'::jsonb,
          summary_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
          closed_at timestamptz,
          closed_by text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
    })().catch((error) => { schemaReady = null; throw error; });
  }
  await schemaReady;
  return { sql, q: (name) => qualified(sql, name) };
}

const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Only full Monday→Sunday ranges become a weekly sheet (custom ranges loaded in the
// Report tab, e.g. 3 days, are ignored).
function isFullWeek(range) {
  if (!range || !isIsoDate(range.from) || !isIsoDate(range.to)) return false;
  const from = new Date(`${range.from}T00:00:00Z`);
  return from.getUTCDay() === 1 && addDays(range.from, 6) === range.to;
}

function detailRows(person, hoursKey, detailKey) {
  const total = Number(person[hoursKey] || 0);
  if (!(total > 0)) return [];
  const detail = person[detailKey] || {};
  const entries = Object.entries(detail).filter(([, h]) => Number(h) > 0);
  if (!entries.length) return [{ name: person.user_name, hours: round2(total), project: '' }];
  return entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([project, hours]) => ({ name: person.user_name, hours: round2(hours), project }));
}

// Weekdays (Mon–Fri) in [from, to] that are not company holidays.
function workdaysBetween(from, to, holidays = []) {
  const skip = new Set(holidays);
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5 && !skip.has(d)) n += 1;
  }
  return n;
}

// Proportional capacity: someone who starts mid-week only counts the workdays from
// their start date (Jira People epic start date, synced in Admin → People).
function personDays(range, holidays, startDate) {
  const start = isIsoDate(String(startDate || '').slice(0, 10)) ? String(startDate).slice(0, 10) : '';
  if (!start || start <= range.from) return workdaysBetween(range.from, range.to, holidays);
  if (start > range.to) return 0;
  return workdaysBetween(start, range.to, holidays);
}

async function startDatesByEmail() {
  try {
    const { sql, q } = await db();
    const rows = await sql`
      SELECT lower(email) AS email, start_date FROM ${q('company_people')}
      WHERE email IS NOT NULL AND start_date IS NOT NULL AND start_date <> ''
    `;
    return new Map(rows.map((r) => [r.email, r.start_date]));
  } catch (error) {
    console.warn('Weekly sheet: start dates unavailable:', error.message);
    return new Map();
  }
}

// Same columns as the Excel weekly tab. Billing % stays null until the week is closed;
// while open, the browser fills it live from the Monday / Sunday snapshots.
// `days` = workdays the person counts this week (holidays and late start excluded):
// their expected hours are 8 × days instead of a fixed 40.
function sheetFromHarvest(metrics, startDates = new Map()) {
  const people = Array.isArray(metrics.by_person) ? metrics.by_person : [];
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const holidays = Array.isArray(metrics.holiday_dates) ? metrics.holiday_dates : [];
  const range = metrics.range || {};
  return {
    rows: people.map((p) => {
      const start = startDates.get(String(p.email || '').toLowerCase()) || '';
      const days = range.from ? personDays(range, holidays, start) : 5;
      return {
      name: p.user_name,
      email: p.email || '',
      days,
      start_date: start && String(start).slice(0, 10) > range.from ? String(start).slice(0, 10) : '',
      holiday: round2(p.holiday_hours),
      billing_start: null,
      billing_end: null,
      total: round2(p.committed_harvest_hours),
      client: round2(p.client_logged_hours),
      pto: round2(p.total_off_hours),
      nb: round2(p.non_billable_hours)
      };
    }).sort(byName),
    bench: people.flatMap((p) => detailRows(p, 'bench_hours', 'bench_detail')).sort(byName),
    internal: people.flatMap((p) => detailRows(p, 'internal_projects_hours', 'internal_projects_detail')).sort(byName)
  };
}

function totalsFromHarvest(metrics) {
  const holidays = Array.isArray(metrics.holiday_dates) ? metrics.holiday_dates : [];
  const hb = metrics.holiday_by_type || {};
  return {
    workdays: metrics.range ? workdaysBetween(metrics.range.from, metrics.range.to, holidays) : 5,
    holiday_dates: holidays,
    holiday_hours: round2(metrics.holiday_hours),
    holiday_by_type: { pto: round2(hb.pto), uto: round2(hb.uto), cto: round2(hb.cto) },
    fetched_at: metrics.fetched_at || new Date().toISOString(),
    entry_count: metrics.entry_count || 0,
    pto_hours: round2(metrics.pto_hours),
    uto_hours: round2(metrics.uto_hours),
    cto_hours: round2(metrics.cto_hours)
  };
}

async function upsertWeekFromHarvest(metrics) {
  if (!metrics || !isFullWeek(metrics.range)) return { skipped: 'not a full Mon–Sun week' };
  if (!Array.isArray(metrics.by_person) || !metrics.by_person.length) return { skipped: 'no Harvest rows' };
  const { sql, q } = await db();
  const sheet = sheetFromHarvest(metrics, await startDatesByEmail());
  const totals = totalsFromHarvest(metrics);
  // Closed weeks are frozen: the WHERE on the DO UPDATE leaves them untouched.
  const rows = await sql`
    INSERT INTO ${q(TABLE)} (week_start, week_end, status, source, sheet, totals)
    VALUES (${metrics.range.from}, ${metrics.range.to}, 'open', 'harvest',
            ${JSON.stringify(sheet)}::jsonb, ${JSON.stringify(totals)}::jsonb)
    ON CONFLICT (week_start) DO UPDATE SET
      sheet = EXCLUDED.sheet,
      totals = EXCLUDED.totals,
      updated_at = now()
    WHERE ${q(TABLE)}.status = 'open'
    RETURNING week_start
  `;
  return { week_start: metrics.range.from, updated: rows.length > 0 };
}

// One-time import of the Excel history. ON CONFLICT DO NOTHING keeps it idempotent and
// never overwrites a week the app already generated.
async function seedFromExcelIfNeeded() {
  const { sql, q } = await db();
  const existing = await sql`SELECT count(*)::int AS n FROM ${q(TABLE)} WHERE source = 'excel-import'`;
  if (existing[0] && existing[0].n > 0) return 0;
  let seed;
  try { seed = require('../data/harvest-weeks-seed.json'); }
  catch { return 0; }
  let inserted = 0;
  for (const w of (seed.weeks || [])) {
    const res = await sql`
      INSERT INTO ${q(TABLE)} (week_start, week_end, status, source, sheet, totals, summary_inputs, closed_at, closed_by)
      VALUES (${w.week_start}, ${w.week_end}, 'closed', 'excel-import',
              ${JSON.stringify(w.sheet || {})}::jsonb,
              ${JSON.stringify({ source_sheet: w.source_sheet || '' })}::jsonb,
              ${JSON.stringify(w.summary_inputs || {})}::jsonb,
              now(), 'Excel import')
      ON CONFLICT (week_start) DO NOTHING
      RETURNING week_start
    `;
    inserted += res.length;
  }
  return inserted;
}

async function listWeeks() {
  const { sql, q } = await db();
  await seedFromExcelIfNeeded();
  const rows = await sql`
    SELECT week_start::text AS week_start, week_end::text AS week_end, status, source,
           sheet, totals, summary_inputs, closed_at, closed_by, updated_at
    FROM ${q(TABLE)}
    ORDER BY week_start DESC
  `;
  return rows;
}

function cleanBillingMap(map) {
  const out = {};
  Object.entries(map || {}).forEach(([name, pct]) => {
    const n = Number(pct);
    if (name && Number.isFinite(n)) out[String(name)] = Math.max(0, Math.min(100, n));
  });
  return out;
}

// Freeze: write the browser-computed Billing % into each row, then lock the week.
async function closeWeek(weekStart, { billingStart = {}, billingEnd = {}, actor = '' } = {}) {
  if (!isIsoDate(weekStart)) throw new Error('Valid week_start is required.');
  const { sql, q } = await db();
  const found = await sql`SELECT sheet, status FROM ${q(TABLE)} WHERE week_start = ${weekStart}`;
  if (!found.length) throw new Error('Week not found.');
  if (found[0].status === 'closed') throw new Error('Week is already closed.');
  const start = cleanBillingMap(billingStart);
  const end = cleanBillingMap(billingEnd);
  const sheet = found[0].sheet || {};
  sheet.rows = (sheet.rows || []).map((row) => ({
    ...row,
    billing_start: start[row.name] != null ? start[row.name] : null,
    billing_end: end[row.name] != null ? end[row.name] : null
  }));
  await sql`
    UPDATE ${q(TABLE)}
    SET sheet = ${JSON.stringify(sheet)}::jsonb, status = 'closed',
        closed_at = now(), closed_by = ${actor}, updated_at = now()
    WHERE week_start = ${weekStart}
  `;
  return { week_start: weekStart, status: 'closed' };
}

async function reopenWeek(weekStart) {
  if (!isIsoDate(weekStart)) throw new Error('Valid week_start is required.');
  const { sql, q } = await db();
  const rows = await sql`
    UPDATE ${q(TABLE)}
    SET status = 'open', closed_at = NULL, closed_by = NULL, updated_at = now()
    WHERE week_start = ${weekStart} AND source = 'harvest'
    RETURNING week_start
  `;
  if (!rows.length) throw new Error('Only weeks generated from Harvest can be reopened.');
  return { week_start: weekStart, status: 'open' };
}

// Manual Summary inputs (the cells the boss typed by hand: headcount, capacity, workdays,
// PTO/UTO/CTO, estimated rate). null clears an override. Allowed on open weeks only.
const SUMMARY_KEYS = ['headcount', 'capacity_hours', 'workdays', 'pto', 'uto', 'cto', 'est_rate'];
async function updateSummaryInputs(weekStart, patch = {}) {
  if (!isIsoDate(weekStart)) throw new Error('Valid week_start is required.');
  const { sql, q } = await db();
  const found = await sql`SELECT summary_inputs, status FROM ${q(TABLE)} WHERE week_start = ${weekStart}`;
  if (!found.length) throw new Error('Week not found.');
  if (found[0].status === 'closed') throw new Error('Reopen the week to edit it.');
  const inputs = { ...(found[0].summary_inputs || {}) };
  SUMMARY_KEYS.forEach((key) => {
    if (!(key in patch)) return;
    const v = patch[key];
    if (v === null || v === '') delete inputs[key];
    else if (Number.isFinite(Number(v))) inputs[key] = Number(v);
  });
  await sql`
    UPDATE ${q(TABLE)} SET summary_inputs = ${JSON.stringify(inputs)}::jsonb, updated_at = now()
    WHERE week_start = ${weekStart}
  `;
  return { week_start: weekStart, summary_inputs: inputs };
}

module.exports = {
  isFullWeek,
  workdaysBetween,
  personDays,
  sheetFromHarvest,
  upsertWeekFromHarvest,
  seedFromExcelIfNeeded,
  listWeeks,
  closeWeek,
  reopenWeek,
  updateSummaryInputs
};
