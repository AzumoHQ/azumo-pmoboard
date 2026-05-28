const EAZYBI_URL = process.env.EAZYBI_URL;
const EAZYBI_ACCOUNT_ID = process.env.EAZYBI_ACCOUNT_ID;
const EAZYBI_EMAIL = process.env.EAZYBI_EMAIL || process.env.JIRA_EMAIL;
const EAZYBI_TOKEN = process.env.EAZYBI_TOKEN;
const EAZYBI_REPORT_ID = process.env.EAZYBI_REPORT_ID;

function hasEazyBIConfig() {
  return Boolean(EAZYBI_URL && EAZYBI_ACCOUNT_ID && EAZYBI_EMAIL && EAZYBI_TOKEN && EAZYBI_REPORT_ID);
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function eazybiRequest(endpoint) {
  if (!EAZYBI_URL || !EAZYBI_EMAIL || !EAZYBI_TOKEN) {
    throw new Error('Missing EazyBI credentials. Set EAZYBI_URL, EAZYBI_EMAIL, and EAZYBI_TOKEN.');
  }

  const auth = Buffer.from(`${EAZYBI_EMAIL}:${EAZYBI_TOKEN}`).toString('base64');
  const response = await fetch(`${normalizeBaseUrl(EAZYBI_URL)}${endpoint}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    throw new Error(`EazyBI API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function exportReport(reportId = EAZYBI_REPORT_ID) {
  if (!EAZYBI_ACCOUNT_ID || !reportId) {
    throw new Error('Missing EAZYBI_ACCOUNT_ID or EAZYBI_REPORT_ID');
  }

  return eazybiRequest(`/accounts/${EAZYBI_ACCOUNT_ID}/export/report/${reportId}.json`);
}

function summarizeEazyBIReport(report) {
  const rows = report?.data?.rows || report?.rows || [];
  if (!Array.isArray(rows) || !rows.length) return {};

  const normalizedRows = rows
    .map((row) => (Array.isArray(row) ? row : Object.values(row)))
    .filter((row) => row.some((value) => typeof value === 'number'));

  const numericValues = normalizedRows.flat().filter((value) => typeof value === 'number');
  if (!numericValues.length) return {};

  return {
    utilization_assignment: Number(numericValues[0] || 0),
    utilization_billing: Number(numericValues[1] || 0),
    unassigned_capacity: Number(numericValues[2] || 0)
  };
}

module.exports = {
  exportReport,
  hasEazyBIConfig,
  summarizeEazyBIReport
};
