const { getPsaProjectReports } = require('../lib/jira-client');
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

module.exports = async function psaReportsHandler(req, res) {
  if (req.method !== 'GET') {
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
