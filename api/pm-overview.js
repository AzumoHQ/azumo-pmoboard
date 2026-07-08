const { getLatestSnapshot } = require('../lib/data-store');
const { getPsaProjectReports } = require('../lib/jira-client');
const { getSessionUser } = require('../lib/auth');

const ALLOWED_ROLES = ['PM', 'PMO'];

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function pmMatchesRow(row, email) {
  const pm = normalizeEmail(row.project_manager || '');
  if (!pm || !email) return false;
  return pm.includes(email) || email.includes(pm.split('@')[0]);
}

function firstNum() {
  for (var i = 0; i < arguments.length; i++) {
    var n = parseFloat(arguments[i]);
    if (!isNaN(n)) return n;
  }
  return null;
}

module.exports = async function pmOverviewHandler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let user;
  try {
    user = await getSessionUser(req);
  } catch {
    res.status(500).json({ error: 'Failed to resolve session' });
    return;
  }

  if (!user || user.active === false) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  try {
    const snapshot = await getLatestSnapshot();
    const rows = (snapshot && snapshot.assignment_rows) ? snapshot.assignment_rows : [];

    const pmEmail = normalizeEmail(user.email);
    const isPmo = user.role === 'PMO';

    const myRows = isPmo
      ? rows.filter(Boolean)
      : rows.filter(function(row) { return row && pmMatchesRow(row, pmEmail); });

    const byEpic = new Map();
    for (const row of myRows) {
      const key = String(row.epic_key || row.client || 'unknown').trim();
      if (!byEpic.has(key)) {
        byEpic.set(key, {
          epicKey: row.epic_key || null,
          epicName: row.epic_name || row.client || key,
          client: row.client || null,
          status: row.status || null,
          billingPct: firstNum(row.billing_pct, row.epic_billing),
          startDate: row.start_date || null,
          endDate: row.end_date || null,
          assignments: []
        });
      }
      const epic = byEpic.get(key);
      if (!epic.billingPct) epic.billingPct = firstNum(row.billing_pct, row.epic_billing);
      if (!epic.startDate) epic.startDate = row.start_date || null;
      if (!epic.endDate) epic.endDate = row.end_date || null;

      const name = row.name || row.assignee || null;
      if (name) {
        epic.assignments.push({
          name,
          email: row.email || null,
          position: row.position || null,
          assignmentPct: firstNum(row.assignment_pct, row.assign, row.pct),
          startDate: row.start_date || null,
          endDate: row.end_date || null,
          freelance: String(row.freelance || '').toLowerCase() === 'yes',
          status: row.status || null
        });
      }
    }

    let psaMap = new Map();
    try {
      const psaProjects = await getPsaProjectReports();
      for (const p of psaProjects) {
        if (!isPmo && normalizeEmail(p.pmAssigned && p.pmAssigned.email) !== pmEmail) continue;
        psaMap.set(p.epicKey, p);
      }
    } catch (err) {
      console.warn('pm-overview: PSA data unavailable:', err.message);
    }

    const projects = [...byEpic.values()].map(function(epic) {
      const psa = psaMap.get(epic.epicKey) || null;
      return Object.assign({}, epic, {
        lastReport: psa ? psa.lastReport : null,
        psaStatus: psa ? psa.status : null,
        csmAssigned: psa ? psa.csmAssigned : null,
        tlAssigned: psa ? psa.tlAssigned : null
      });
    });

    projects.sort(function(a, b) {
      const aActive = a.status === 'In Progress' ? 0 : 1;
      const bActive = b.status === 'In Progress' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (!a.endDate && !b.endDate) return 0;
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate.localeCompare(b.endDate);
    });

    res.status(200).json({ projects, snapshotDate: snapshot && snapshot.snapshot_date || null });
  } catch (error) {
    console.error('pm-overview failed:', error.message);
    res.status(500).json({ error: 'Failed to load PM overview' });
  }
};
