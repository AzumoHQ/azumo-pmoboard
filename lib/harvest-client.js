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

module.exports = {
  fetchHarvestSnapshot,
  hasHarvestConfig,
  harvestConfigStatus
};
