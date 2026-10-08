const { getAaAssignmentMeta, createAaAssignment, extendAaAssignment } = require('../lib/jira-client');
const { getSessionUser } = require('../lib/auth');

// Same audience that submits Jira form 150 today.
const ALLOWED_ROLES = ['PMO', 'PM', 'Executive'];

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

async function handleCreate(req, res, user) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  let meta;
  try {
    meta = await getAaAssignmentMeta();
  } catch (error) {
    console.error('assignments meta failed:', error.message);
    res.status(502).json({ error: 'Could not read the AA form options from Jira' });
    return;
  }

  const pick = (key) => String(body[key] || '').trim();
  const people = meta.people || [];
  const person = people.find((p) => p.epicKey === pick('epicKey'));
  const accountIds = new Set(people.map((p) => p.accountId));
  const errors = [];

  const allocation = Number(body.allocation);
  const rateRaw = String(body.rate ?? '').trim();
  const rate = rateRaw === '' ? null : Number(rateRaw);

  const a = {
    epicKey: person?.epicKey,
    assigneeAccountId: person?.accountId,
    summary: pick('summary'),
    client: pick('client'),
    harvestRole: pick('harvestRole'),
    pmAccountId: pick('pmAccountId'),
    csmAccountId: pick('csmAccountId'),
    startDate: pick('startDate'),
    dueDate: pick('dueDate'),
    allocation,
    rate,
    comment: String(body.comment || '').slice(0, 30000)
  };

  if (!person) errors.push('Person is required');
  if (!a.summary) errors.push('Assignment title is required');
  if (!(meta.options?.client || []).includes(a.client)) errors.push('Client is required');
  if (!(meta.options?.harvestRole || []).includes(a.harvestRole)) errors.push('Harvest role is required');
  if (!accountIds.has(a.pmAccountId)) errors.push('Project Manager is required');
  if (a.csmAccountId && !accountIds.has(a.csmAccountId)) errors.push('Unknown CSM');
  if (!isIsoDate(a.startDate)) errors.push('Start date is required');
  if (!isIsoDate(a.dueDate)) errors.push('Due date is required');
  if (isIsoDate(a.startDate) && isIsoDate(a.dueDate) && a.dueDate < a.startDate) errors.push('Due date must be on or after the start date');
  if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100) errors.push('Assignment % must be between 1 and 100');
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) errors.push('Rate must be a positive number');

  if (errors.length) {
    res.status(400).json({ error: errors.join(' · ') });
    return;
  }

  try {
    const ticket = await createAaAssignment(a, { email: user.email, name: user.name });
    res.status(201).json({ ok: true, ticket });
  } catch (error) {
    console.error('assignments create failed:', error.message);
    res.status(502).json({ error: `Jira rejected the assignment: ${error.message.slice(0, 400)}` });
  }
}

// PATCH: extend an existing assignment (new due date). Body: { key: 'AA-123', dueDate: 'YYYY-MM-DD', reason?: string }
async function handleExtend(req, res, user) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const key = String(body.key || '').trim().toUpperCase();
  const dueDate = String(body.dueDate || '').trim();
  if (!/^AA-\d+$/.test(key)) { res.status(400).json({ error: 'Assignment key is required' }); return; }
  if (!isIsoDate(dueDate)) { res.status(400).json({ error: 'New end date is required' }); return; }
  try {
    const result = await extendAaAssignment(key, dueDate, { email: user.email, name: user.name }, String(body.reason || ''));
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('assignments extend failed:', error.message);
    const disabled = /write-back is disabled/i.test(error.message);
    const own = /^(Invalid|The new end date|The end date|AA-\d+ is not)/.test(error.message);
    res.status(disabled ? 503 : own ? 400 : 502).json({ error: disabled ? error.message : own ? error.message : `Jira rejected the change: ${error.message.slice(0, 400)}` });
  }
}

module.exports = async function assignmentsHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let user;
  try {
    user = await getSessionUser(req);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve session' });
    return;
  }
  if (!user || user.active === false) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!ALLOWED_ROLES.includes(user.role)) {
    res.status(403).json({ error: 'Not authorized to create assignments' });
    return;
  }

  if (req.method === 'POST') {
    await handleCreate(req, res, user);
    return;
  }
  if (req.method === 'PATCH') {
    await handleExtend(req, res, user);
    return;
  }

  try {
    res.status(200).json(await getAaAssignmentMeta());
  } catch (error) {
    console.error('assignments meta failed:', error.message);
    res.status(502).json({ error: 'Could not read the AA form options from Jira' });
  }
};
