const { exportReport, hasEazyBIConfig, summarizeEazyBIReport } = require('../lib/eazybi-client');
const { getIssues } = require('../lib/jira-client');
const { saveSnapshot } = require('../lib/data-store');
const { buildSnapshot, issuesFromJiraResponse, parseJiraIssues } = require('../lib/pmo-transform');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  const token = process.env.PMO_REFRESH_TOKEN;
  if (!token) return true;
  return req.headers['x-pmo-token'] === token || req.headers.authorization === `Bearer ${token}`;
}

module.exports = async function refreshHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = await readJson(req);
    let overrides = body.overrides || {};

    if (hasEazyBIConfig() && body.useEazyBI !== false) {
      try {
        const eazybiReport = await exportReport(body.eazybiReportId);
        overrides = {
          ...summarizeEazyBIReport(eazybiReport),
          ...overrides
        };
      } catch (error) {
        console.warn('EazyBI refresh skipped:', error.message);
      }
    }

    const jiraResponse = await getIssues(body.jql);
    const parsed = parseJiraIssues(issuesFromJiraResponse(jiraResponse));
    const snapshot = buildSnapshot(parsed, overrides);
    const data = await saveSnapshot(snapshot, {
      cloudId: body.cloudId || process.env.JIRA_CLOUD_ID || '',
      project: body.project || 'AA',
      last_refresh: snapshot.date
    });

    res.status(200).json({
      snapshot,
      snapshots: data.snapshots.length,
      last_refresh: data.last_refresh
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
