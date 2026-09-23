// harvest-digest.js
// Genera el mensaje de Harvest incompletos que el PMO postea en #azumo-billing-hub,
// sin que nadie tenga que abrir el board.
//
// La logica de abajo es un port server-side de lo que index.html ya hace en
// runHarvestHoursReport() + harvestHoursBillingHubNames(). Si alguna vez cambia
// el criterio de "completo" en index.html, hay que cambiarlo aca tambien.
// Para verificar que no divergieron: correr el endpoint y comparar contra el
// boton "Copy for Slack" del modulo Harvest Hours Control para el mismo rango.

const { getDashboardData } = require('./data-store');

const HARVEST_API_URL = 'https://api.harvestapp.com/v2';
const BOARD_URL = 'https://pmoboard.it.azumo.com';

// ── helpers portados de index.html (mismos nombres, mismo comportamiento) ──

function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function displayName(p = {}) {
  return p.name || p.assignee || (p.key ? `Unassigned (${p.key})` : 'Unassigned');
}

function rowStatus(row = {}) {
  const client = String(row.client || '').trim();
  const status = String(row.status || '').trim();
  if (client === 'Bench' || status === 'On Hold') return 'Bench';
  if (client === 'Azumo') return 'Azumo';
  if (status === 'Assigned') return 'Pending';
  if (status === 'In Progress' && client) return 'Active';
  return status || 'Unknown';
}

function isActiveCapacityRow(row = {}) {
  const status = String(row.status || '').trim();
  return status === 'In Progress' || ['Active', 'Azumo', 'Bench'].includes(rowStatus(row));
}

function isExternalInProgress(row = {}) {
  return String(row.status || '').trim() === 'In Progress'
    && Boolean(row.client)
    && !['Bench', 'Azumo'].includes(String(row.client || '').trim());
}

function allAssignmentRows(latest = {}) {
  const direct = (latest.assignment_rows || []).filter(Boolean);
  if (direct.length) return direct;
  return [
    ...Object.values(latest.forecast || {}).flat(),
    ...(latest.bench_list || []),
    ...(latest.pending_list || [])
  ].filter(Boolean);
}

function hhParseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function hhFormatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hhBusinessDaysBetween(fromValue, toValue) {
  const from = hhParseIsoDate(fromValue);
  const to = hhParseIsoDate(toValue);
  if (!from || !to || from > to) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function hhExpectedForSelectedRange(weeklyExpected, from, to) {
  const businessDays = hhBusinessDaysBetween(from, to);
  const dailyExpected = Number(weeklyExpected || 0) / 5;
  const expected = businessDays ? Math.round(dailyExpected * businessDays * 10) / 10 : Number(weeklyExpected || 0);
  return { businessDays, dailyExpected, expected };
}

// ── rangos de fecha ──
// Todo se calcula en hora de Argentina (UTC-3) para que un cron que corre en UTC
// no se pase de semana.

function argentinaNow(reference) {
  const base = reference ? new Date(reference) : new Date();
  return new Date(base.getTime() - 3 * 60 * 60 * 1000);
}

function mondayOfWeek(date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday;
}

// Viernes: lunes a jueves de ESTA semana (el mensaje dice que no incluye las horas de hoy).
// Con includeToday=true toma lunes a viernes, igual que el default del board.
function fridayRange(reference, includeToday = false) {
  const monday = mondayOfWeek(argentinaNow(reference));
  const end = new Date(monday);
  end.setDate(monday.getDate() + (includeToday ? 4 : 3));
  return { from: hhFormatIsoDate(monday), to: hhFormatIsoDate(end) };
}

// Lunes: lunes a viernes de la semana PASADA.
function mondayRange(reference) {
  const monday = mondayOfWeek(argentinaNow(reference));
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  const lastFriday = new Date(lastMonday);
  lastFriday.setDate(lastMonday.getDate() + 4);
  return { from: hhFormatIsoDate(lastMonday), to: hhFormatIsoDate(lastFriday) };
}

// ── Harvest ──

function cleanEnv(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function harvestConfig() {
  const accessToken = cleanEnv(process.env.HARVEST_ACCESS_TOKEN || process.env.HARVEST_PAT || process.env.HARVEST_TOKEN);
  const accountId = cleanEnv(process.env.HARVEST_ACCOUNT_ID || process.env.HARVEST_ACCOUNTID || process.env.HARVEST_ACCOUNT);
  return {
    accessToken,
    accountId,
    userAgent: cleanEnv(process.env.HARVEST_USER_AGENT) || 'PMO Dashboard Harvest Digest (pmo@azumo.co)',
    missing: [accountId ? '' : 'HARVEST_ACCOUNT_ID', accessToken ? '' : 'HARVEST_ACCESS_TOKEN'].filter(Boolean)
  };
}

function endpointUrl(pathname, params = {}) {
  const url = pathname.startsWith('http') ? new URL(pathname) : new URL(`${HARVEST_API_URL}${pathname}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

async function harvestFetch(pathname, params = {}) {
  const config = harvestConfig();
  if (!config.accessToken || !config.accountId) {
    throw new Error(`Harvest config missing: ${config.missing.join(', ')} required.`);
  }
  const response = await fetch(endpointUrl(pathname, params), {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Harvest-Account-Id': config.accountId,
      'User-Agent': config.userAgent,
      'Content-Type': 'application/json'
    }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(body.message || body.error || text || `Harvest ${response.status}`);
  return body;
}

async function fetchPaged(pathname, collectionKey, params = {}) {
  const rows = [];
  let page = 1;
  let nextUrl = '';
  do {
    const payload = await harvestFetch(nextUrl || pathname, nextUrl ? {} : { per_page: 2000, page, ...params });
    rows.push(...(payload[collectionKey] || []));
    nextUrl = payload.links?.next || '';
    if (!nextUrl && payload.next_page) page = payload.next_page;
    else if (!nextUrl) page = null;
  } while (nextUrl || page);
  return rows;
}

// ── roster de Jira (port de harvestHoursClientMap, rama sin restriccion de rol:
//    el digest corre como PMO, que ve a todos) ──

function buildJiraClientMap(latest = {}) {
  const map = {};
  allAssignmentRows(latest).forEach(row => {
    const client = String(row.client || '').trim();
    const isCapacity = ['Bench', 'Azumo'].includes(client) && isActiveCapacityRow(row);
    if (!isExternalInProgress(row) && !isCapacity) return;
    const rawName = String(row.name || row.assignee || '').trim();
    if (!rawName) return; // filas de new-hire sin nombre real
    const person = normalizeIdentity(displayName(row));
    if (!person || !client) return;
    if (!map[person]) map[person] = { clients: new Set(), email: '' };
    map[person].clients.add(client);
    const rowEmail = String(row.email || '').trim().toLowerCase();
    if (rowEmail && !map[person].email) map[person].email = rowEmail;
  });
  (latest.non_billable_epic_assignments || []).forEach(row => {
    if (String(row.status || '').trim().toLowerCase() === 'inactive') return;
    const person = normalizeIdentity(displayName(row));
    if (!person) return;
    if (!map[person]) map[person] = { clients: new Set(), email: '' };
    const rowEmail = String(row.email || '').trim().toLowerCase();
    if (rowEmail && !map[person].email) map[person].email = rowEmail;
  });
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, {
    clients: [...v.clients].sort(),
    email: v.email
  }]));
}

// ── filas ──

function buildRows({ latest, users, entries, from, to, weeklyExpected = 40, threshold = 0.9 }) {
  const rangeTarget = hhExpectedForSelectedRange(weeklyExpected, from, to);
  const expected = rangeTarget.expected || weeklyExpected;

  const nameById = {};
  const emailById = {};
  (users || []).forEach(u => {
    const nm = u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || '';
    if (u.id) {
      nameById[u.id] = nm;
      if (u.email) emailById[u.id] = String(u.email).trim().toLowerCase();
    }
  });

  const hoursByUser = {};
  const daysByUser = {};
  const missingDescriptionByUser = {};
  const clientsByUser = {};
  (entries || []).forEach(entry => {
    const id = entry.user?.id;
    if (!id) return;
    const hours = Number(entry.hours || 0);
    hoursByUser[id] = (hoursByUser[id] || 0) + hours;
    if (hours > 0 && entry.spent_date) {
      if (!daysByUser[id]) daysByUser[id] = new Set();
      daysByUser[id].add(entry.spent_date);
    }
    if (hours > 0 && !String(entry.notes || '').trim()) missingDescriptionByUser[id] = true;
    const clientName = entry.client?.name || '';
    if (clientName && hours > 0) {
      if (!clientsByUser[id]) clientsByUser[id] = new Set();
      clientsByUser[id].add(clientName);
    }
  });

  const harvestByNorm = {};
  (users || []).forEach(u => {
    const nm = nameById[u.id] || '';
    const norm = normalizeIdentity(nm);
    if (!norm) return;
    harvestByNorm[norm] = {
      id: u.id,
      name: nm,
      email: emailById[u.id] || '',
      isActive: u.is_active !== false,
      hours: Math.round(Number(hoursByUser[u.id] || 0) * 10) / 10,
      daysFilled: daysByUser[u.id]?.size || 0,
      missingDescription: Boolean(missingDescriptionByUser[u.id]),
      harvestClients: [...(clientsByUser[u.id] || new Set())].sort()
    };
  });
  const harvestByEmail = {};
  Object.values(harvestByNorm).forEach(h => { if (h.email) harvestByEmail[h.email.toLowerCase()] = h; });

  const makeRow = (name, jiraInfo, harv) => {
    const hours = harv ? harv.hours : 0;
    const ratio = expected ? (hours / expected) : 0;
    const jiraClients = jiraInfo?.clients || [];
    return {
      name,
      hours,
      daysFilled: harv ? harv.daysFilled : 0,
      missingDescription: harv ? harv.missingDescription : false,
      expected,
      pct: Math.round(ratio * 100),
      complete: ratio >= threshold,
      clients: jiraClients.length ? jiraClients : (harv?.harvestClients || [])
    };
  };

  const jiraClientsByPerson = buildJiraClientMap(latest);
  const seenNorm = new Set();
  const rows = [];

  // 1) Todos los asignados en Jira (fuente de verdad del roster)
  Object.entries(jiraClientsByPerson).forEach(([norm, jiraInfo]) => {
    seenNorm.add(norm);
    let harv = harvestByNorm[norm];
    if (!harv && jiraInfo.email) {
      harv = harvestByEmail[jiraInfo.email.toLowerCase()];
      if (harv) seenNorm.add(normalizeIdentity(harv.name));
    }
    rows.push(makeRow(harv?.name || norm, jiraInfo, harv));
  });

  // 2) Gente con horas en Harvest que no esta en el roster de Jira
  Object.entries(harvestByNorm).forEach(([norm, harv]) => {
    if (seenNorm.has(norm)) return;
    if (harv.isActive === false) return;
    if (!harv.name || /^unassigned\s*\(/i.test(harv.name)) return;
    rows.push(makeRow(harv.name, null, harv));
  });

  rows.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  return { rows, expected, businessDays: rangeTarget.businessDays };
}

// ── render (port exacto de harvestHoursBillingHubNames) ──

function billingHubNames(incomplete, noDescriptionRows = []) {
  const grouped = new Map();
  (incomplete || []).forEach(row => {
    const name = String(row.name || '').trim();
    if (!name) return;
    const clients = (row.clients && row.clients.length) ? row.clients : ['No client'];
    clients.forEach(clientName => {
      const client = String(clientName || 'No client').trim() || 'No client';
      if (!grouped.has(client)) grouped.set(client, new Set());
      grouped.get(client).add(name);
    });
  });
  const sections = [];
  if (grouped.size) {
    sections.push([...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([client, names]) => `${client}\n${[...names].sort((a, b) => a.localeCompare(b)).map(n => `• ${n}`).join('\n')}`)
      .join('\n\n'));
  }
  const noDescriptionNames = [...new Set((noDescriptionRows || []).map(r => r.name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  if (noDescriptionNames.length) {
    sections.push(`Empty\n${noDescriptionNames.map(n => `• ${n}`).join('\n')}`);
  }
  if (!sections.length) return 'All active users are complete in Harvest and all descriptions are filled.';
  return sections.join('\n\n');
}

const TEMPLATES = {
  friday: list => [
    'Happy Friday! :rocket:',
    "Here's the list of people with incomplete Harvest entries — today's hours aren't included.",
    "Please make sure everything is up to date by Monday. I'll send an update then.",
    'Thanks!',
    '',
    list,
    '',
    `Source: PMO Board — ${BOARD_URL}`
  ].join('\n'),
  monday: list => [
    'Good Monday! :wave:',
    'Reminder: the following people still have incomplete Harvest entries from last week.',
    'Please make sure their hours are completed as soon as possible.',
    'Thanks!',
    '',
    list,
    '',
    `Source: PMO Board — ${BOARD_URL}`
  ].join('\n')
};

// ── Slack ──

async function postToSlack(webhookUrl, { context, body }) {
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'No webhook URL configured' };
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: context,
      blocks: [
        { type: 'context', elements: [{ type: 'mrkdwn', text: context }] },
        { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } }
      ],
      unfurl_links: false
    })
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, response: text.slice(0, 300) };
}

// ── entrada principal ──

async function buildHarvestDigest({ kind = 'friday', from, to, includeToday = false, reference, weeklyExpected, threshold } = {}) {
  const range = (from && to)
    ? { from, to }
    : (kind === 'monday' ? mondayRange(reference) : fridayRange(reference, includeToday));

  const latest = await getDashboardData();
  const [users, entries] = await Promise.all([
    fetchPaged('/users', 'users', { is_active: true }),
    fetchPaged('/time_entries', 'time_entries', { from: range.from, to: range.to })
  ]);

  const { rows, expected, businessDays } = buildRows({
    latest,
    users,
    entries: entries.map(e => ({
      hours: Number(e.hours || 0),
      spent_date: e.spent_date || '',
      user: { id: e.user?.id || '' },
      client: { name: e.client?.name || '' },
      notes: e.notes || e.description || ''
    })),
    from: range.from,
    to: range.to,
    weeklyExpected: Number(weeklyExpected || process.env.PMO_DIGEST_WEEKLY_HOURS || 40) || 40,
    threshold: Number(threshold || process.env.PMO_DIGEST_THRESHOLD || 0.9) || 0.9
  });

  const incomplete = rows.filter(r => !r.complete);
  const noDescription = rows.filter(r => r.missingDescription);
  const list = billingHubNames(incomplete, noDescription);
  const render = TEMPLATES[kind] || TEMPLATES.friday;

  return {
    kind,
    range,
    expected,
    businessDays,
    counts: { reviewed: rows.length, incomplete: incomplete.length, no_description: noDescription.length },
    body: render(list)
  };
}

module.exports = {
  buildHarvestDigest,
  buildRows,
  buildJiraClientMap,
  billingHubNames,
  fridayRange,
  mondayRange,
  postToSlack,
  TEMPLATES
};
