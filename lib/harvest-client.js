const HARVEST_API_URL = 'https://api.harvestapp.com/v2';

function cleanEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function harvestConfig() {
  const accessToken = cleanEnv(
    process.env.HARVEST_ACCESS_TOKEN
      || process.env.HARVEST_PAT
      || process.env.HARVEST_TOKEN
  );
  const accountId = cleanEnv(
    process.env.HARVEST_ACCOUNT_ID
      || process.env.HARVEST_ACCOUNTID
      || process.env.HARVEST_ACCOUNT
  );
  return {
    accessToken,
    accountId,
    userAgent: cleanEnv(process.env.HARVEST_USER_AGENT) || 'PMO Dashboard (pmo@azumo.co)',
    missing: [
      accountId ? '' : 'HARVEST_ACCOUNT_ID',
      accessToken ? '' : 'HARVEST_ACCESS_TOKEN'
    ].filter(Boolean)
  };
}

function hasHarvestConfig() {
  const config = harvestConfig();
  return Boolean(config.accessToken && config.accountId);
}

function harvestConfigStatus() {
  const config = harvestConfig();
  return {
    configured: hasHarvestConfig(),
    missing: config.missing,
    accepted_env_names: {
      account_id: ['HARVEST_ACCOUNT_ID', 'HARVEST_ACCOUNTID', 'HARVEST_ACCOUNT'],
      access_token: ['HARVEST_ACCESS_TOKEN', 'HARVEST_PAT', 'HARVEST_TOKEN'],
      user_agent: ['HARVEST_USER_AGENT']
    },
    readonly: true,
    source: 'Harvest API v2'
  };
}

function harvestHeaders() {
  const config = harvestConfig();
  return {
    Authorization: `Bearer ${config.accessToken}`,
    'Harvest-Account-Id': config.accountId,
    'User-Agent': config.userAgent
  };
}

function endpointUrl(pathname, params = {}) {
  const url = pathname.startsWith('http')
    ? new URL(pathname)
    : new URL(`${HARVEST_API_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

async function harvestFetch(pathname, params = {}) {
  if (!hasHarvestConfig()) throw new Error(`Harvest config missing: ${harvestConfig().missing.join(', ')} required.`);
  const url = endpointUrl(pathname, params);
  const response = await fetch(url, { headers: harvestHeaders() });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body.message || body.error || text || response.statusText;
    throw new Error(`Harvest ${response.status}: ${message}`);
  }
  return body;
}

async function fetchPaged(pathname, collectionKey, params = {}) {
  const rows = [];
  let page = 1;
  let nextUrl = '';
  do {
    const pageParams = nextUrl ? {} : { per_page: 2000, page, ...params };
    const payload = await harvestFetch(nextUrl || pathname, pageParams);
    rows.push(...(payload[collectionKey] || []));
    nextUrl = payload.links?.next || '';
    if (!nextUrl && payload.next_page) page = payload.next_page;
    else if (!nextUrl) page = null;
  } while (nextUrl || page);
  return rows;
}

function clean(value) {
  return String(value || '').trim();
}

function normalizeProject(project = {}, usersById = new Map()) {
  return {
    id: project.id,
    name: clean(project.name),
    code: clean(project.code),
    client_id: project.client?.id || '',
    client_name: clean(project.client?.name),
    is_active: project.is_active !== false,
    is_billable: project.is_billable !== false,
    updated_at: project.updated_at || ''
  };
}

function normalizeUser(user = {}) {
  const first = clean(user.first_name);
  const last = clean(user.last_name);
  return {
    id: user.id,
    name: clean(user.name) || [first, last].filter(Boolean).join(' '),
    email: clean(user.email),
    is_active: user.is_active !== false,
    is_contractor: Boolean(user.is_contractor),
    updated_at: user.updated_at || ''
  };
}

function normalizeUserAssignment(assignment = {}, usersById = new Map()) {
  const user = usersById.get(assignment.user?.id) || {};
  return {
    id: assignment.id,
    is_active: assignment.is_active !== false,
    is_project_manager: Boolean(assignment.is_project_manager),
    user_id: assignment.user?.id || '',
    user_name: clean(assignment.user?.name) || user.name || '',
    user_email: user.email || '',
    project_id: assignment.project?.id || '',
    project_name: clean(assignment.project?.name),
    project_code: clean(assignment.project?.code),
    updated_at: assignment.updated_at || ''
  };
}

async function fetchHarvestSnapshot() {
  const [projectsRaw, usersRaw, assignmentsRaw] = await Promise.all([
    fetchPaged('/projects', 'projects', { is_active: true }),
    fetchPaged('/users', 'users', { is_active: true }),
    fetchPaged('/user_assignments', 'user_assignments', { is_active: true })
  ]);

  const users = usersRaw.map(normalizeUser);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const projects = projectsRaw.map((project) => normalizeProject(project));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const userAssignments = assignmentsRaw.map((assignment) => {
    const row = normalizeUserAssignment(assignment, usersById);
    const project = projectsById.get(row.project_id) || {};
    return {
      ...row,
      client_id: project.client_id || '',
      client_name: project.client_name || '',
      project_is_active: project.is_active !== false,
      project_is_billable: project.is_billable !== false
    };
  }).filter((row) => row.is_active && row.project_is_active);

  return {
    source: 'Harvest API v2',
    fetched_at: new Date().toISOString(),
    projects,
    users,
    user_assignments: userAssignments,
    counts: {
      active_projects: projects.length,
      active_users: users.length,
      active_user_assignments: userAssignments.length
    }
  };
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

// Hours tie back to a spreadsheet that carries two decimals (205.14, 134.42).
// Rounding to one would make every figure fail to reconcile by sight.
function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

// Glossary, "Internal Projects Logged Hours": Valkyrie, Azumobot, Sales
// Support, Website, Maintenance. Recruiting added per PMO. Both spellings of
// Valkyrie are listed because both occur in the source data.
//
// Anything non-billable NOT on this list is Bench by definition, so a missing
// entry costs precision in the Internal/Bench split -- never a lost hour.
const DEFAULT_INTERNAL_PROJECTS = [
  'valkyrie',
  'valkyre',
  'azumobot',
  'sales',
  'sales support',
  'website',
  'maintenance',
  'recruiting',
  'devops'
];

// Glossary: PTO / UTO / CTO are filed in Harvest through the Jira ticket
// procedure and sit outside both billable and non-billable work.
const DEFAULT_TIME_OFF_PATTERNS = [
  'pto',
  'uto',
  'cto',
  'time off',
  'timeoff',
  'paid time off',
  'unpaid time off',
  'comp time off',
  'vacation',
  'holiday'
];

function envList(name, fallback) {
  const raw = cleanEnv(process.env[name]);
  if (!raw) return fallback;
  const parsed = raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

// Lowercase, strip accents, collapse whitespace, so "Sales " and "sales" are
// not treated as two different projects.
function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function categorizationConfig() {
  const internal = new Set(
    envList('HARVEST_INTERNAL_PROJECTS', DEFAULT_INTERNAL_PROJECTS).map(normalizeName)
  );
  const timeOffWords = envList('HARVEST_TIME_OFF_PATTERNS', DEFAULT_TIME_OFF_PATTERNS);
  // Word boundaries so "PTO" cannot fire on an unrelated substring.
  const timeOffRe = new RegExp(`\\b(${timeOffWords.map(escapeRegex).join('|')})\\b`, 'i');
  return { internal, timeOffRe };
}

// Glossary splits time off three ways. "PTO for freelancer" is defined as
// unpaid PTO, so a contractor resolves to UTO. The contractor flag comes from
// the /users join -- time entries only carry {id, name} for the user.
function timeOffType(text, isContractor) {
  if (/\b(uto|unpaid)\b/i.test(text)) return 'uto';
  if (/\b(cto|comp)\b/i.test(text)) return 'cto';
  if (isContractor) return 'uto';
  return 'pto';
}

// Order matters, and billable comes first on purpose. Testing time-off words
// ahead of it would let a client project named "Holiday Campaign" silently
// leave revenue and turn into PTO. Bench is last because the glossary defines
// it as the residual: whatever the three named categories did not take.
function categorizeHarvestEntry(entry = {}, config = categorizationConfig(), user = null) {
  const project = clean(entry.project?.name);
  const task = clean(entry.task?.name);
  const haystack = `${project} ${task}`;

  if (entry.billable === true) {
    return { bucket: 'client_logged', subcategory: '' };
  }

  if (config.timeOffRe.test(haystack)) {
    return { bucket: 'time_off', subcategory: timeOffType(haystack, user?.is_contractor) };
  }

  if (config.internal.has(normalizeName(project))) {
    return { bucket: 'internal_projects', subcategory: project };
  }

  return { bucket: 'bench', subcategory: project || 'Unspecified' };
}

// Glossary rate formulas. Billable Capacity Hours = Headcount * Hours in Day *
// Days, where headcount excludes mid-week starters and Days excludes holidays
// -- neither is in Harvest, so capacity is supplied by the caller. Returns
// null when it cannot be computed, rather than a misleading zero.
//
// Note: the glossary defines Bench Rate as "Internal Projects Logged Hours /
// Billable Capacity Hours", which is a copy-paste slip; the Summary tab
// computes Bench Hours / Capacity (205.14/3944 = 0.05201318458). The sheet's
// own arithmetic is what is implemented here.
function computeUtilizationRates(metrics = {}, capacity = {}) {
  const headcount = Number(capacity.headcount || 0);
  const availableTeamDays = Number(capacity.available_team_days || 0);
  const hoursInDay = Number(capacity.hours_in_day || 8);

  const billableCapacityHours = availableTeamDays > 0
    ? availableTeamDays * hoursInDay
    : headcount * hoursInDay * Number(capacity.days || 0);

  if (!billableCapacityHours) return null;

  const rate = (value) => Math.round((Number(value || 0) / billableCapacityHours) * 1e10) / 1e10;

  return {
    billable_capacity_hours: round2(billableCapacityHours),
    headcount,
    capacity_utilization_rate: rate(metrics.client_logged_hours),
    internal_project_rate: rate(metrics.internal_projects_logged_hours),
    bench_rate: rate(metrics.internal_bench_hours),
    pto_rate: rate(metrics.pto_hours),
    uto_rate: rate(metrics.uto_hours),
    cto_rate: rate(metrics.cto_hours),
    total_off_rate: rate(metrics.total_off_hours),
    // Team Utilization = (Client Logged + Internal Projects) / Capacity
    team_utilization_rate: rate(
      Number(metrics.client_logged_hours || 0) + Number(metrics.internal_projects_logged_hours || 0)
    )
  };
}

function sortedHourMap(map) {
  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => [key, round2(value)])
      .sort((a, b) => b[1] - a[1])
  );
}

/**
 * Weekly Harvest metrics named after the Glossary tab, so the board and the
 * spreadsheet can be read side by side without translating vocabularies.
 *
 * options.roster  Set of lowercased emails for the billable team. The glossary
 *                 scopes Committed Harvest Hours to that team specifically, so
 *                 anyone outside it (PMO, HR, finance, executives) is excluded
 *                 from the totals and reported under `population` instead. When
 *                 no roster is supplied every Harvest user is counted and
 *                 population.roster_applied is false -- expect the totals to
 *                 run above the sheet in that case.
 * options.capacity  { headcount, available_team_days, hours_in_day } for the
 *                 rate block. Omitted -> rates is null.
 */
async function fetchWeeklyHarvestMetrics({ from, to }, options = {}) {
  const roster = options.roster instanceof Set && options.roster.size ? options.roster : null;
  const capacity = options.capacity || null;

  // Time entries carry the user as a minimal {id, name}. The /users join is
  // what supplies email (for roster matching) and is_contractor (for the
  // freelancer-PTO-is-UTO rule).
  const [entries, users] = await Promise.all([
    fetchPaged('/time_entries', 'time_entries', { from, to }),
    fetchPaged('/users', 'users', {})
  ]);

  const usersById = new Map(users.map((user) => [user.id, normalizeUser(user)]));
  const config = categorizationConfig();

  const totals = { client_logged: 0, internal_projects: 0, bench: 0, time_off: 0 };
  const offByType = { pto: 0, uto: 0, cto: 0 };
  const internalByProject = {};
  const benchByProject = {};
  const byPersonMap = new Map();
  const excludedMap = new Map();
  const warnings = [];
  let excludedHours = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours || 0);
    const userId = entry.user?.id || '';
    const user = usersById.get(userId) || null;
    const userName = clean(entry.user?.name) || user?.name || 'Unnamed';
    const email = (user?.email || '').toLowerCase();

    // Out of scope: logs hours in Harvest but is not on the billable roster.
    if (roster && !roster.has(email)) {
      excludedHours += hours;
      const key = userId || userName;
      if (!excludedMap.has(key)) {
        excludedMap.set(key, { user_id: userId, user_name: userName, email, hours: 0 });
      }
      excludedMap.get(key).hours += hours;
      continue;
    }

    const { bucket, subcategory } = categorizeHarvestEntry(entry, config, user);

    // Billable wins over time-off wording, but a billable entry that reads
    // like time off is worth a look rather than a silent reclassification.
    if (bucket === 'client_logged'
      && config.timeOffRe.test(`${clean(entry.project?.name)} ${clean(entry.task?.name)}`)) {
      warnings.push(
        `Billable entry looks like time off: ${userName} — `
        + `${clean(entry.project?.name)} / ${clean(entry.task?.name)} (${round2(hours)} h)`
      );
    }

    totals[bucket] += hours;

    if (bucket === 'internal_projects') {
      internalByProject[subcategory || 'Unspecified'] =
        (internalByProject[subcategory || 'Unspecified'] || 0) + hours;
    } else if (bucket === 'bench') {
      // Visibility into the residual. A real internal initiative showing up
      // here only needs adding to HARVEST_INTERNAL_PROJECTS.
      benchByProject[subcategory || 'Unspecified'] =
        (benchByProject[subcategory || 'Unspecified'] || 0) + hours;
    } else if (bucket === 'time_off') {
      offByType[subcategory] = (offByType[subcategory] || 0) + hours;
    }

    const personKey = userId || userName;
    if (!byPersonMap.has(personKey)) {
      byPersonMap.set(personKey, {
        user_id: userId,
        user_name: userName,
        email,
        is_contractor: Boolean(user?.is_contractor),
        client_logged: 0,
        internal_projects: 0,
        bench: 0,
        time_off: 0
      });
    }
    byPersonMap.get(personKey)[bucket] += hours;
  }

  const byPerson = Array.from(byPersonMap.values())
    .map((row) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      email: row.email,
      is_contractor: row.is_contractor,
      client_logged_hours: round2(row.client_logged),
      internal_projects_hours: round2(row.internal_projects),
      bench_hours: round2(row.bench),
      total_off_hours: round2(row.time_off),
      non_billable_hours: round2(row.internal_projects + row.bench),
      committed_harvest_hours: round2(
        row.client_logged + row.internal_projects + row.bench + row.time_off
      )
    }))
    .sort((a, b) => a.user_name.localeCompare(b.user_name));

  const committed =
    totals.client_logged + totals.internal_projects + totals.bench + totals.time_off;

  const excluded = Array.from(excludedMap.values())
    .map((row) => ({ ...row, hours: round2(row.hours) }))
    .sort((a, b) => b.hours - a.hours);

  if (!roster) {
    warnings.push(
      'No billable-team roster supplied: totals cover every Harvest user, '
      + 'so they will run above the COO sheet, which counts the billable team only.'
    );
  }

  const metrics = {
    source: 'Harvest API v2',
    fetched_at: new Date().toISOString(),
    range: { from, to },
    entry_count: entries.length,

    // Glossary quantities, billable team only when a roster is supplied
    committed_harvest_hours: round2(committed),
    client_logged_hours: round2(totals.client_logged),
    internal_projects_logged_hours: round2(totals.internal_projects),
    internal_bench_hours: round2(totals.bench),
    non_billable_hours: round2(totals.internal_projects + totals.bench),
    total_off_hours: round2(totals.time_off),
    pto_hours: round2(offByType.pto),
    uto_hours: round2(offByType.uto),
    cto_hours: round2(offByType.cto),

    internal_projects_by_project: sortedHourMap(internalByProject),
    bench_by_project: sortedHourMap(benchByProject),
    by_person: byPerson,

    population: {
      roster_applied: Boolean(roster),
      roster_size: roster ? roster.size : 0,
      people_counted: byPerson.length,
      people_excluded: excluded.length,
      excluded_hours: round2(excludedHours),
      excluded_people: excluded.slice(0, 40)
    },

    warnings
  };

  metrics.rates = capacity ? computeUtilizationRates(metrics, capacity) : null;

  return metrics;
}

module.exports = {
  fetchHarvestSnapshot,
  hasHarvestConfig,
  harvestConfigStatus,
  fetchWeeklyHarvestMetrics,
  categorizeHarvestEntry,
  categorizationConfig,
  computeUtilizationRates
};
