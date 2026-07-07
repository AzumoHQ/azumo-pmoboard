const { getSessionUser } = require('../lib/auth');

const HARVEST_API_URL = 'https://api.harvestapp.com/v2';

function cleanEnv(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function harvestConfig() {
  const accessToken = cleanEnv(process.env.HARVEST_ACCESS_TOKEN || process.env.HARVEST_PAT || process.env.HARVEST_TOKEN);
  const accountId = cleanEnv(process.env.HARVEST_ACCOUNT_ID || process.env.HARVEST_ACCOUNTID || process.env.HARVEST_ACCOUNT);
  return {
    accessToken,
    accountId,
    userAgent: cleanEnv(process.env.HARVEST_USER_AGENT) || 'PMO Dashboard Harvest Hours (pmo@azumo.co)',
    missing: [accountId ? '' : 'HARVEST_ACCOUNT_ID', accessToken ? '' : 'HARVEST_ACCESS_TOKEN'].filter(Boolean)
  };
}

function harvestHeaders(config) {
  return {
    Authorization: `Bearer ${config.accessToken}`,
    'Harvest-Account-Id': config.accountId,
    'User-Agent': config.userAgent,
    'Content-Type': 'application/json'
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
  const response = await fetch(endpointUrl(pathname, params), { headers: harvestHeaders(config) });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(body.message || body.error || text || `Harvest ${response.status}`);
  }
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

function normalizeUser(user = {}) {
  return {
    id: user.id,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' '),
    email: user.email || '',
    is_active: user.is_active !== false
  };
}

function normalizeEntry(entry = {}) {
  return {
    id: entry.id,
    hours: Number(entry.hours || 0),
    spent_date: entry.spent_date || '',
    user: {
      id: entry.user?.id || '',
      name: entry.user?.name || ''
    },
    project: {
      id: entry.project?.id || '',
      name: entry.project?.name || ''
    },
    client: {
      id: entry.client?.id || '',
      name: entry.client?.name || ''
    },
    notes: entry.notes || entry.description || ''
  };
}

module.exports = async function harvestHoursHandler(req, res) {

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await getSessionUser(req);
    if (!user || user.active === false) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const from = String(req.query.from || '').slice(0, 10);
    const to = String(req.query.to || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      res.status(400).json({ error: 'Valid from and to dates are required.' });
      return;
    }

    const [users, entries] = await Promise.all([
      fetchPaged('/users', 'users', { is_active: true }),
      fetchPaged('/time_entries', 'time_entries', { from, to })
    ]);

    res.status(200).json({
      source: 'Harvest API v2',
      readonly: true,
      fetched_at: new Date().toISOString(),
      range: { from, to },
      users: users.map(normalizeUser),
      entries: entries.map(normalizeEntry)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
