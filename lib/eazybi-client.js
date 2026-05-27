const EAZYBI_URL = process.env.EAZYBI_URL;
const EAZYBI_TOKEN = process.env.EAZYBI_TOKEN;
const EAZYBI_REPORT_ID = process.env.EAZYBI_REPORT_ID;

function hasEazyBIConfig() {
  return Boolean(EAZYBI_URL && EAZYBI_TOKEN && EAZYBI_REPORT_ID);
}

async function eazybiRequest(endpoint) {
  if (!EAZYBI_URL || !EAZYBI_TOKEN) {
    throw new Error('Missing EazyBI credentials. Set EAZYBI_URL and EAZYBI_TOKEN.');
  }

  const response = await fetch(`${EAZYBI_URL}${endpoint}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Token token="${EAZYBI_TOKEN}"`
    }
  });

  if (!response.ok) {
    throw new Error(`EazyBI API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function exportReport(reportId = EAZYBI_REPORT_ID) {
  if (!reportId) {
    throw new Error('Missing EAZYBI_REPORT_ID');
  }

  return eazybiRequest(`/api/1/reports/${reportId}/data.json`);
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
