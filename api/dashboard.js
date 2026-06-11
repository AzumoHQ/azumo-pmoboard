const { getDashboardData } = require('../lib/data-store');
const { clientReportConfig, fetchInternalProjectsReport, fetchNewSearchesTriageReport } = require('../lib/eazybi-client');
const { getSessionUser } = require('../lib/auth');

function sendError(res, status, message) {
  res.status(status).json({ message });
}

module.exports = async function dashboardHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const user = await getSessionUser(req);
    if (!user || user.active === false) {
      sendError(res, 401, 'Sign in required');
      return;
    }

    const data = await getDashboardData();
    if (!data || typeof data !== 'object') {
      sendError(res, 500, 'Dashboard data is unavailable.');
      return;
    }

    if (!Array.isArray(data.snapshots) || !data.snapshots.length) {
      sendError(res, 404, 'No dashboard snapshots are available.');
      return;
    }

    const warnings = [];
    data.eazybi = clientReportConfig();
    const latest = data.snapshots.at(-1);

    try {
      const internalProjects = await fetchInternalProjectsReport();
      if (internalProjects) latest.internal_projects = internalProjects;
    } catch (error) {
      warnings.push(`Internal Projects report failed: ${error.message}`);
      latest.internal_projects = latest.internal_projects || {
        source: 'EazyBI Internal Projects',
        rows: [],
        row_count: 0,
        warning: error.message
      };
    }

    try {
      const newSearchesTriage = await fetchNewSearchesTriageReport();
      if (newSearchesTriage) latest.new_searches_triage = newSearchesTriage;
    } catch (error) {
      warnings.push(`New Searches Triage report failed: ${error.message}`);
      latest.new_searches_triage = latest.new_searches_triage || {
        source: 'EazyBI New Searches Triage',
        rows: [],
        row_count: 0,
        warning: error.message
      };
    }

    if (!latest || (!latest.internal_projects && !latest.new_searches_triage && warnings.length)) {
      sendError(res, 500, 'Dashboard data is unavailable.');
      return;
    }

    if (warnings.length) {
      data.warnings = warnings;
    }

    res.status(200).json(data);
  } catch (error) {
    sendError(res, 500, error.message || 'Dashboard request failed.');
  }
};
