// /api/harvest-weeks — weekly Harvest sheets + Summary (Reports → Logged Harvest Hours).
//   GET                         → { weeks: [...] }  (newest first; seeds the Excel history once)
//   POST ?action=close          → body { week_start, billing_start:{name:pct}, billing_end:{name:pct} }
//   POST ?action=reopen         → body { week_start }
//   POST ?action=summary        → body { week_start, inputs:{headcount, capacity_hours, workdays, pto, uto, cto, est_rate} }
// Reading: any role that can open the Logged Harvest Hours report. Writing: PMO / Administrator.
const { getSessionContext } = require('../lib/auth');
const store = require('../lib/harvest-weeks-store');

const READ_ROLES = new Set(['PMO', 'ADMIN', 'ADMINISTRATOR', 'EXECUTIVE', 'HR', 'VIEWER', 'C-LEVEL', 'CLEVEL']);
const WRITE_ROLES = new Set(['PMO', 'ADMIN', 'ADMINISTRATOR']);

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

const roleOf = (user) => String((user && user.role) || '').trim().toUpperCase();

module.exports = async function harvestWeeksHandler(req, res) {
  try {
    const { realUser } = await getSessionContext(req);
    if (!realUser || realUser.active === false) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    const role = roleOf(realUser);
    if (!READ_ROLES.has(role)) {
      res.status(403).json({ error: 'Not allowed for this role' });
      return;
    }

    if (req.method === 'GET') {
      res.status(200).json({ weeks: await store.listWeeks(), can_edit: WRITE_ROLES.has(role) });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    if (!WRITE_ROLES.has(role)) {
      res.status(403).json({ error: 'PMO access required' });
      return;
    }

    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const action = url.searchParams.get('action') || '';
    const body = await readJson(req);
    const weekStart = String(body.week_start || '').slice(0, 10);

    if (action === 'close') {
      res.status(200).json(await store.closeWeek(weekStart, {
        billingStart: body.billing_start,
        billingEnd: body.billing_end,
        actor: realUser.email || realUser.name || ''
      }));
      return;
    }
    if (action === 'reopen') {
      res.status(200).json(await store.reopenWeek(weekStart));
      return;
    }
    if (action === 'summary') {
      res.status(200).json(await store.updateSummaryInputs(weekStart, body.inputs || {}));
      return;
    }
    res.status(400).json({ error: `Unknown action "${action}"` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
