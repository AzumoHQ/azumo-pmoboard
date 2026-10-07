const { getPsaProjectReports, getPsaStatusReportMeta, createPsaStatusReport, getPsaEpic, getPsaReportDetails } = require('../lib/jira-client');
const { getSessionUser } = require('../lib/auth');

const STALE_DAYS_THRESHOLD = 30;
const ALLOWED_ROLES = ['Executive', 'PMO', 'PM'];
const CLOSED_STATUSES = ['Done', 'Closed', 'Cancelled'];

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return null;
  const diffMs = Date.now() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

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

const PSA_REPORT_TEXT_KEYS = [
  'projectIssues', 'projectActionPlan',
  'teamIssues', 'teamActionPlan',
  'clientIssues', 'clientActionPlan',
  'budgetActionPlan', 'comments'
];

// POST /api/psa-reports → creates a "Project Status" ticket in Jira PSA
async function handleCreateReport(req, res, user) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  let meta;
  try {
    meta = await getPsaStatusReportMeta();
  } catch (error) {
    console.error('psa-reports meta failed:', error.message);
    res.status(502).json({ error: 'Could not read the PSA form options from Jira' });
    return;
  }
  const opts = meta.options || {};
  const pick = (key) => String(body[key] || '').trim();
  const errors = [];

  const epic = await getPsaEpic(body.epicKey);
  if (!epic) errors.push('Project (PSA epic) is required');
  if (epic && user.role === 'PM' && epic.pmEmail !== normalizeEmail(user.email)) {
    res.status(403).json({ error: 'You can only report on projects where you are the PM assigned' });
    return;
  }

  const report = {
    epicKey: epic?.key,
    epicName: epic?.name,
    summary: pick('summary'),
    date: pick('date'),
    reportType: pick('reportType'),
    projectStatus: pick('projectStatus'),
    teamStatus: pick('teamStatus'),
    clientStatus: pick('clientStatus'),
    budgetStatus: pick('budgetStatus'),
    budgetReportUrl: pick('budgetReportUrl'),
    projectNames: (Array.isArray(body.projectNames) ? body.projectNames : []).map((v) => String(v || '').trim()).filter(Boolean)
  };
  PSA_REPORT_TEXT_KEYS.forEach((key) => { report[key] = String(body[key] || '').slice(0, 30000); });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.date)) errors.push('Date is required');
  const oneOf = (key, label) => {
    if (!(opts[key] || []).includes(report[key])) errors.push(`${label} is required`);
  };
  oneOf('reportType', 'Report type');
  oneOf('projectStatus', 'Project status');
  oneOf('teamStatus', 'Team status');
  oneOf('clientStatus', 'Client status');
  oneOf('budgetStatus', 'Budget status');
  if (!report.projectNames.length) errors.push('At least one Project name is required');
  const unknownNames = report.projectNames.filter((name) => !(opts.projectNames || []).includes(name));
  if (unknownNames.length) errors.push(`Unknown Project name: ${unknownNames.join(', ')}`);
  if (report.budgetReportUrl && !/^https?:\/\//i.test(report.budgetReportUrl)) errors.push('Budget report link must start with http(s)://');

  if (errors.length) {
    res.status(400).json({ error: errors.join(' · ') });
    return;
  }

  try {
    const ticket = await createPsaStatusReport(report, { email: user.email, name: user.name });
    res.status(201).json({ ok: true, ticket });
  } catch (error) {
    console.error('psa-reports create failed:', error.message);
    res.status(502).json({ error: `Jira rejected the report: ${error.message.slice(0, 400)}` });
  }
}

module.exports = async function psaReportsHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
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
    res.status(403).json({ error: 'Not authorized to view project reports' });
    return;
  }

  if (req.method === 'POST') {
    await handleCreateReport(req, res, user);
    return;
  }

  if (req.query && req.query.meta) {
    try {
      res.status(200).json(await getPsaStatusReportMeta());
    } catch (error) {
      console.error('psa-reports meta failed:', error.message);
      res.status(502).json({ error: 'Could not read the PSA form options from Jira' });
    }
    return;
  }

  // GET /api/psa-reports?details=PSA-1234 → comments of one report (loaded when it is expanded)
  if (req.query && req.query.details) {
    const key = String(req.query.details).trim().toUpperCase();
    if (!/^PSA-\d+$/.test(key)) {
      res.status(400).json({ error: 'Invalid report key' });
      return;
    }
    try {
      const result = await getPsaReportDetails(key);
      if (!result) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }
      if (user.role === 'PM') {
        // PMs only read reports of their own projects (legacy reports without a parent epic are PMO / Executive only)
        const epic = result.parentKey ? await getPsaEpic(result.parentKey) : null;
        if (!epic || epic.pmEmail !== normalizeEmail(user.email)) {
          res.status(403).json({ error: 'Not authorized to read this report' });
          return;
        }
      }
      res.status(200).json({ key: result.key, details: result.details });
    } catch (error) {
      console.error('psa-reports details failed:', error.message);
      res.status(502).json({ error: 'Could not read the report from Jira' });
    }
    return;
  }

  try {
    const projects = await getPsaProjectReports();

    const enriched = projects.map((project) => {
      const isClosed = CLOSED_STATUSES.includes(project.status);
      const days = daysSince(project.lastReport?.date);
      return {
        ...project,
        daysSinceLastReport: days,
        isClosed,
        stale: !isClosed && (days === null || days >= STALE_DAYS_THRESHOLD)
      };
    });

    const scoped = user.role === 'PM'
      ? enriched.filter((project) => normalizeEmail(project.pmAssigned?.email) === normalizeEmail(user.email))
      : enriched;

    scoped.sort((a, b) => {
      if (a.daysSinceLastReport === null) return -1;
      if (b.daysSinceLastReport === null) return 1;
      return b.daysSinceLastReport - a.daysSinceLastReport;
    });

    res.status(200).json({ projects: scoped });
  } catch (error) {
    console.error('psa-reports failed:', error.message);
    res.status(500).json({ error: 'Failed to load project reports' });
  }
};
