const {
  exportReport,
  exportEmbeddedReport,
  fetchBenchByMonthReport,
  fetchUtilizationBillingRateReport,
  hasEazyBIConfig,
  summarizeEazyBIReport
} = require('../lib/eazybi-client');
const { fetchHarvestSnapshot, hasHarvestConfig, harvestConfigStatus } = require('../lib/harvest-client');
const { getAccountCoverageIssues, getIssues, countIssues } = require('../lib/jira-client');
const { canRefresh, getSessionUser } = require('../lib/auth');
const { getDashboardData, saveSnapshot } = require('../lib/data-store');
const {
  buildSnapshot,
  enrichParsedWithSnapshot,
  issuesFromJiraResponse,
  parseAccountCoverageIssues,
  parseJiraIssues
} = require('../lib/pmo-transform');

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

async function isAuthorized(req) {
  const token = process.env.PMO_REFRESH_TOKEN;
  if (token && (req.headers['x-pmo-token'] === token || req.headers.authorization === `Bearer ${token}`)) {
    return true;
  }

  const user = await getSessionUser(req);
  if (canRefresh(user)) return true;

  return !token;
}

async function runRefresh(body = {}) {
  let overrides = body.overrides || {};
  const explicitOverrideKeys = new Set(Object.keys(overrides));
  const authoritativeMetricKeys = new Set();
  const warnings = [];
  let harvestSynced = false;
  const existing = await getDashboardData();
  const previousSnapshot = (existing.snapshots || []).at(-1);
  const previousMetrics = previousSnapshot?.metrics || {};

  if (hasEazyBIConfig() && body.useEazyBI !== false && (body.eazybiReportId || process.env.EAZYBI_REPORT_ID)) {
    try {
      const eazybiEmbedToken = process.env.EAZYBI_UTILIZATION_BILLING_TOKEN;
      const eazybiReportId = body.eazybiReportId || process.env.EAZYBI_UTILIZATION_BILLING_REPORT_ID || process.env.EAZYBI_REPORT_ID;
      const eazybiAccountId = body.eazybiAccountId || process.env.EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID || process.env.EAZYBI_ACCOUNT_ID;
      const eazybiReport = eazybiEmbedToken
        ? await exportEmbeddedReport(eazybiReportId, eazybiAccountId, eazybiEmbedToken)
        : await exportReport(body.eazybiReportId, body.eazybiAccountId);
      const eazybiMetrics = summarizeEazyBIReport(eazybiReport);
      const hasUsefulEazyBIMetrics = [
        eazybiMetrics.utilization_assignment,
        eazybiMetrics.utilization_billing,
        eazybiMetrics.unassigned_capacity,
        eazybiMetrics.headcount_billable,
        eazybiMetrics.headcount_nonbillable,
        eazybiMetrics.headcount_total
      ].some((value) => Number(value || 0) > 0);

      if (!hasUsefulEazyBIMetrics) {
        console.warn('EazyBI refresh returned no useful utilization metrics; preserving previous snapshot metrics.');
      } else {
        Object.keys(eazybiMetrics).forEach((key) => authoritativeMetricKeys.add(key));
      }

      const eazybiMetricOverrides = { ...eazybiMetrics };

      overrides = {
        ...(hasUsefulEazyBIMetrics ? eazybiMetricOverrides : {}),
        ...overrides
      };
    } catch (error) {
      console.warn('EazyBI refresh skipped:', error.message);
      warnings.push(`EazyBI metrics refresh skipped: ${error.message}`);
    }
  }

  // Headcount Billable / Non-Billable from an auditable Jira filter (active billable
  // Epics, excluding freelancers) takes precedence over the EazyBI aggregate column,
  // which could include freelancers/inactive Epics. Enable by configuring
  // JIRA_HEADCOUNT_BILLABLE_JQL / JIRA_HEADCOUNT_NONBILLABLE_JQL. Explicit body
  // overrides still win; on error the refresh continues and keeps the EazyBI value.
  const billableJql = body.headcountBillableJql || process.env.JIRA_HEADCOUNT_BILLABLE_JQL;
  const nonBillableJql = body.headcountNonBillableJql || process.env.JIRA_HEADCOUNT_NONBILLABLE_JQL;
  if (billableJql && nonBillableJql) {
    try {
      const [hb, hnb] = await Promise.all([countIssues(billableJql), countIssues(nonBillableJql)]);
      const jqlHeadcount = {};
      if (!explicitOverrideKeys.has('headcount_billable')) jqlHeadcount.headcount_billable = hb;
      if (!explicitOverrideKeys.has('headcount_nonbillable')) jqlHeadcount.headcount_nonbillable = hnb;
      if (!explicitOverrideKeys.has('headcount_total')) jqlHeadcount.headcount_total = hb + hnb;
      ['headcount_billable', 'headcount_nonbillable', 'headcount_total'].forEach((key) => authoritativeMetricKeys.add(key));
      overrides = { ...overrides, ...jqlHeadcount };
    } catch (error) {
      console.warn('Jira headcount JQL skipped:', error.message);
      warnings.push(`Jira headcount JQL skipped: ${error.message}`);
    }
  }

  const jiraResponse = await getIssues(body.jql);
  let parsed = parseJiraIssues(issuesFromJiraResponse(jiraResponse));
  try {
    const coverageIssues = await getAccountCoverageIssues(body.accountCoverageJql);
    parsed.account_coverage = parseAccountCoverageIssues(coverageIssues);
    parsed.account_coverage_source = 'Jira PSA Epic Account Coverage';
  } catch (error) {
    console.warn('Account Coverage refresh skipped:', error.message);
    parsed.account_coverage = previousSnapshot?.account_coverage || [];
    parsed.account_coverage_source = previousSnapshot?.account_coverage_source || '';
  }

  // Preserve non-position enrichment from the latest snapshot. Visible Position
  // remains sourced only from the AA parent Epic "Position - Assignee".
  parsed = enrichParsedWithSnapshot(parsed, previousSnapshot);

  if (hasEazyBIConfig() && body.useEazyBI !== false) {
    try {
      const report = await fetchBenchByMonthReport(
        body.benchByMonthReportId || process.env.EAZYBI_BENCH_BY_MONTH_REPORT_ID,
        body.eazybiAccountId
      );
      if (report) parsed.bench_by_month = report;
    } catch (error) {
      console.warn('EazyBI Bench by Month report skipped:', error.message);
      warnings.push(`EazyBI Bench by Month report skipped: ${error.message}`);
    }

    try {
      const report = await fetchUtilizationBillingRateReport(
        body.utilizationBillingReportId || process.env.EAZYBI_UTILIZATION_BILLING_REPORT_ID,
        body.eazybiAccountId
      );
      if (report) parsed.utilization_billing_rate = report;
    } catch (error) {
      console.warn('EazyBI Utilization Billing Rate report skipped:', error.message);
      warnings.push(`EazyBI Utilization Billing Rate report skipped: ${error.message}`);
    }

  }

  if (hasHarvestConfig() && body.useHarvest !== false) {
    try {
      parsed.harvest = await fetchHarvestSnapshot();
    } catch (error) {
      console.warn('Harvest refresh skipped:', error.message);
      warnings.push(`Harvest refresh skipped: ${error.message}`);
      parsed.harvest = previousSnapshot?.harvest || {};
    }
  } else {
    const missing = harvestConfigStatus().missing || [];
    if (body.useHarvest !== false && missing.length) {
      warnings.push(`Harvest refresh skipped: missing ${missing.join(', ')}.`);
    }
    parsed.harvest = previousSnapshot?.harvest || {};
  }
  harvestSynced = Boolean(parsed.harvest?.fetched_at && parsed.harvest?.fetched_at !== previousSnapshot?.harvest?.fetched_at);

  const snapshot = buildSnapshot(parsed, overrides);
  preservePreviousMetricFallbacks(snapshot, previousMetrics, explicitOverrideKeys, authoritativeMetricKeys);
  const refreshedAt = new Date().toISOString();
  const data = await saveSnapshot(snapshot, {
    cloudId: body.cloudId || process.env.JIRA_CLOUD_ID || '',
    project: body.project || 'AA',
    last_refresh: snapshot.date,
    last_refresh_at: refreshedAt
  });

  return {
    snapshot,
    snapshots: data.snapshots.length,
    last_refresh: data.last_refresh,
    last_refresh_at: data.last_refresh_at,
    harvest_synced: harvestSynced,
    harvest_status: harvestConfigStatus(),
    warnings
  };
}

function preservePreviousMetricFallbacks(
  snapshot,
  previousMetrics = {},
  explicitOverrideKeys = new Set(),
  authoritativeMetricKeys = new Set()
) {
  const guardedFields = [
    'utilization_assignment',
    'utilization_billing',
    'headcount_billable',
    'headcount_nonbillable',
    'headcount_total',
    'unassigned_capacity'
  ];
  snapshot.metrics = snapshot.metrics || {};
  for (const field of guardedFields) {
    if (explicitOverrideKeys.has(field)) continue;
    const current = Number(snapshot.metrics[field] || 0);
    const previous = Number(previousMetrics[field] || 0);
    if (previous > 0 && (!authoritativeMetricKeys.has(field) || current === 0)) {
      snapshot.metrics[field] = previous;
    }
  }
}

async function refreshHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await isAuthorized(req))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const body = await readJson(req);
    res.status(200).json(await runRefresh(body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = refreshHandler;
module.exports.runRefresh = runRefresh;
module.exports.isAuthorized = isAuthorized;
