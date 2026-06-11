const CF_START_DATE = 'customfield_10800';
const CF_CLIENT = 'customfield_11391';
const CF_POSITION = 'customfield_11525';
const CF_PCT = 'customfield_11528';
const CF_PROJECT_MANAGER = 'customfield_10828';
const CF_EPIC_BILLING = 'customfield_11754';
const CF_FREELANCE = 'customfield_13480';
const CF_BILLING_TYPE = 'customfield_12711';
const CF_COVERAGE_PM = 'customfield_12678';
const CF_COVERAGE_CSM = 'customfield_11425';
const CF_COVERAGE_TL = 'customfield_11622';
const CF_COVERAGE_TL_FALLBACK = 'customfield_11490';
const BENCH_ALLOWED_PROJECT_STATUSES = new Set(['active', 'new hires', 'new hire']);

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.name || value.displayName || '';
}

function percentValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (Number.isNaN(number)) return '';
  return Math.round(number * 100) / 100;
}

function assignmentPercentValue(assignment = {}) {
  return percentValue(assignment.assignment_pct ?? assignment.pct ?? 0);
}

function childIssueBillingClass(assignment = {}) {
  const status = String(assignment.status || '').trim();
  const client = String(assignment.client || '').trim();
  if (status !== 'In Progress') return '';
  if (client === 'Azumo' || client === 'Bench') return 'Non-Billable';
  return client ? 'Billable' : '';
}

function isInternalCapacityClient(client) {
  return client === 'Bench' || client === 'Azumo';
}

function isBenchClient(client) {
  return String(client || '').trim() === 'Bench';
}

function normalizeInternalCapacity(assignment = {}) {
  if (!isInternalCapacityClient(assignment.client)) return assignment;
  const assignmentPct = percentValue(assignment.assignment_pct ?? assignment.pct);
  const normalizedPct = assignmentPct === '' ? '' : assignmentPct;
  return {
    ...assignment,
    pct: normalizedPct,
    assignment_pct: normalizedPct,
    billing_pct: 0,
    availability_pct: assignment.client === 'Bench' ? (assignment.availability_pct === '' || assignment.availability_pct === null || assignment.availability_pct === undefined ? normalizedPct : assignment.availability_pct) : Math.max(0, 100 - Number(normalizedPct || 0)),
    bench_pct: assignment.client === 'Bench' ? (assignment.bench_pct === '' || assignment.bench_pct === null || assignment.bench_pct === undefined ? normalizedPct : assignment.bench_pct) : assignment.bench_pct,
    billing_class: childIssueBillingClass({ ...assignment, assignment_pct: normalizedPct }),
    epic_billing: 0
  };
}

function directChildIssueHeadcount(assignments = []) {
  const totals = { billable: 0, nonbillable: 0 };
  for (const assignment of assignments || []) {
    const klass = childIssueBillingClass(assignment);
    if (!klass) continue;
    const pct = assignmentPercentValue(assignment);
    if (klass === 'Non-Billable') totals.nonbillable += pct;
    else totals.billable += pct;
  }
  return {
    billable: Math.round((totals.billable / 100) * 100) / 100,
    nonbillable: Math.round((totals.nonbillable / 100) * 100) / 100
  };
}

function isNonBillableBillingType(value) {
  return /non[-\s]?billable/i.test(String(value || ''));
}

function normalizedProjectStatus(row = {}) {
  return String(row.project_status || row.aa_project_status || row.resource_status || row.epic_status || '').trim().toLowerCase();
}

function hasAllowedBenchProjectStatus(row = {}) {
  return BENCH_ALLOWED_PROJECT_STATUSES.has(normalizedProjectStatus(row));
}

function snapshotUsesFilteredBench(snapshot = {}) {
  return String(snapshot.bench_source || '').toLowerCase().includes('active/new hires')
    || (snapshot.bench_list || []).some((row) => normalizedProjectStatus(row));
}

function parseJiraIssues(rawIssues) {
  const today = new Date();
  const todayIso = isoDate(today);
  const cutoff60 = addDays(today, 60);

  const rawAssignments = rawIssues
    .map((issue) => {
      const fields = issue.fields || {};
      const assignee = fields.assignee || {};
      const parent = fields.parent || {};
      const parentFields = parent.fields || {};
      const billingType = fieldValue(parentFields[CF_BILLING_TYPE]) || fieldValue(fields[CF_BILLING_TYPE]);
      const status = fieldValue(fields.status);
      const client = fieldValue(fields[CF_CLIENT]);
      const epicBillingRaw = parentFields[CF_EPIC_BILLING] ?? fields[CF_EPIC_BILLING];
      const epicBilling = epicBillingRaw === null || epicBillingRaw === undefined || epicBillingRaw === ''
        ? ''
        : Number(epicBillingRaw);
      const assignmentPct = percentValue(fields[CF_PCT]);
      const assignmentPosition = fieldValue(fields[CF_POSITION]);
      const epicPosition = fieldValue(parentFields[CF_POSITION]);

      return {
        key: issue.key,
        assignee: assignee.displayName || '',
        email: assignee.emailAddress || '',
        status,
        client,
        position: epicPosition,
        assignment_position: assignmentPosition,
        epic_position: epicPosition,
        start: fields[CF_START_DATE] || '',
        due: fields.duedate || '',
        epic_due: parentFields.duedate || '',
        pct: Number(fields[CF_PCT] || 0),
        assignment_pct: assignmentPct,
        summary: fields.summary || '',
        project_manager: fieldValue(fields[CF_PROJECT_MANAGER]),
        epic_key: parent.key || '',
        epic_status: parentFields.status?.name || '',
        epic_assignee: parentFields.assignee?.displayName || '',
        freelance: fieldValue(parentFields[CF_FREELANCE]) || fieldValue(fields[CF_FREELANCE]),
        epic_billing: Number.isNaN(epicBilling) ? '' : epicBilling,
        billing_class: childIssueBillingClass({ status, client, assignment_pct: assignmentPct }),
        billing_type: billingType
      };
    })
    .map(normalizeInternalCapacity);

  const nonBillableEpicAssignments = rawAssignments.filter((assignment) => isNonBillableBillingType(assignment.billing_type));
  const assignments = applyResidualBenchPercent(rawAssignments
    .filter((assignment) => !isNonBillableBillingType(assignment.billing_type)));

  const bench = assignments.filter(
    (assignment) => assignment.client === 'Bench' && assignment.status === 'In Progress'
  );
  const pending = assignments.filter((assignment) => assignment.status === 'Assigned');
  const active = assignments.filter(
    (assignment) => assignment.status === 'In Progress' && assignment.client && assignment.client !== 'Bench'
  );

  const activeClients = [...new Set(active.map((assignment) => assignment.client).filter((client) => client !== 'Azumo'))].sort();

  const dueRollups = buildDueDateRollups(assignments, today, cutoff60);

  return {
    todayIso,
    active,
    bench,
    pending,
    non_billable_epic_assignments: nonBillableEpicAssignments,
    active_clients: activeClients,
    expiring_60d: dueRollups.expiring_60d,
    forecast: dueRollups.forecast,
    forecast_total: dueRollups.forecast_total,
    forecast_source: 'Jira In Progress assignment due dates · Bench excluded',
    bench_source: 'Jira Bench In Progress assignments'
  };
}

function normalizeCoverageClient(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function personMatchKey(row = {}) {
  const email = String(row.email || row.user_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = normalizeIdentity(row.assignee || row.name || row.user_name || '');
  return name ? `name:${name}` : '';
}

function isProjectManagerPosition(position = '') {
  return /\b(project\s*manager|pm)\b/i.test(String(position || ''));
}

function isHarvestOtherProject(row = {}) {
  return [
    row.client_name,
    row.project_name,
    row.project_code
  ].some((value) => normalizeCoverageClient(value) === 'other');
}

function harvestProjectKeys(row = {}) {
  return [
    row.client_name,
    row.project_name,
    row.project_code
  ].map(normalizeCoverageClient).filter(Boolean);
}

function isJiraHarvestAuthoritativeRow(row = {}) {
  const epicStatus = String(row.epic_status || '').trim().toLowerCase();
  return row.status === 'In Progress'
    && row.client
    && !isBenchClient(row.client)
    && (!epicStatus || epicStatus === 'active');
}

function activeCapacityPersonKey(row = {}) {
  const email = String(row.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const epicAssignee = normalizeIdentity(row.epic_assignee || row.assignee || '');
  return epicAssignee ? `name:${epicAssignee}` : '';
}

function applyResidualBenchPercent(assignments = []) {
  const consumedByPerson = new Map();
  for (const assignment of assignments || []) {
    if (assignment.status !== 'In Progress') continue;
    if (isBenchClient(assignment.client)) continue;
    const key = activeCapacityPersonKey(assignment);
    if (!key) continue;
    const pct = assignmentPercentValue(assignment);
    consumedByPerson.set(key, (consumedByPerson.get(key) || 0) + Number(pct || 0));
  }

  return assignments.map((assignment) => {
    if (!isBenchClient(assignment.client) || assignment.status !== 'In Progress') return assignment;
    const key = activeCapacityPersonKey(assignment);
    const consumed = Math.min(100, Math.max(0, consumedByPerson.get(key) || 0));
    const expected = Math.round((100 - consumed) * 100) / 100;
    const jiraPct = assignmentPercentValue(assignment);
    const mismatch = jiraPct !== '' && Math.abs(Number(jiraPct) - expected) > 0.01;
    return normalizeInternalCapacity({
      ...assignment,
      jira_bench_pct: jiraPct,
      pct: expected,
      assignment_pct: expected,
      availability_pct: expected,
      bench_pct: expected,
      bench_expected_pct: expected,
      bench_consumed_pct: Math.round(consumed * 100) / 100,
      bench_pct_mismatch: mismatch
    });
  });
}

function coverageRowFromIssue(issue) {
  const fields = issue.fields || {};
  const pm = fieldValue(fields[CF_COVERAGE_PM]) || fieldValue(fields[CF_PROJECT_MANAGER]);
  const csm = fieldValue(fields[CF_COVERAGE_CSM]);
  const tl = fieldValue(fields[CF_COVERAGE_TL]) || fieldValue(fields[CF_COVERAGE_TL_FALLBACK]);
  const missing = [
    ['PM', pm],
    ['CSM', csm],
    ['TL', tl]
  ].filter(([, value]) => !value).map(([label]) => label);

  return {
    key: issue.key || '',
    client: String(fields.summary || '').trim(),
    client_key: normalizeCoverageClient(fields.summary || ''),
    status: fieldValue(fields.status),
    pm_assigned: pm || '',
    csm_assigned: csm || '',
    tl_assigned: tl || '',
    missing,
    complete: missing.length === 0,
    source: 'Jira PSA Epic Account Coverage'
  };
}

function parseAccountCoverageIssues(rawIssues = []) {
  const byClient = new Map();
  for (const issue of rawIssues || []) {
    const row = coverageRowFromIssue(issue);
    if (!row.client_key) continue;
    const existing = byClient.get(row.client_key);
    if (!existing) {
      byClient.set(row.client_key, row);
      continue;
    }

    byClient.set(row.client_key, {
      ...existing,
      pm_assigned: existing.pm_assigned || row.pm_assigned,
      csm_assigned: existing.csm_assigned || row.csm_assigned,
      tl_assigned: existing.tl_assigned || row.tl_assigned
    });
    const merged = byClient.get(row.client_key);
    merged.missing = [
      ['PM', merged.pm_assigned],
      ['CSM', merged.csm_assigned],
      ['TL', merged.tl_assigned]
    ].filter(([, value]) => !value).map(([label]) => label);
    merged.complete = merged.missing.length === 0;
  }

  return [...byClient.values()].sort((a, b) => a.client.localeCompare(b.client));
}

function dueRow(assignment) {
  return {
    key: assignment.key || '',
    assignee: assignment.assignee || '',
    client: assignment.client || '',
    position: assignment.position || '',
    due: assignment.due || '',
    sow: assignment.summary || '',
    status: assignment.status || '',
    technology: assignment.technology || '',
    frameworks: assignment.frameworks || '',
    project_manager: assignment.project_manager || '',
    csm: assignment.csm || assignment.csm_assigned || '',
    source: assignment.source || 'Jira'
  };
}

function buildDueDateRollups(assignments, today = new Date(), cutoff60 = addDays(today, 60)) {
  const forecast = {};
  const expiring60d = [];

  assignments
    .filter((assignment) => assignment.status === 'In Progress')
    .filter((assignment) => !isBenchClient(assignment.client))
    .filter((assignment) => assignment.due && parseDate(assignment.due))
    .slice()
    .sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.key).localeCompare(String(b.key)))
    .forEach((assignment) => {
      const dueDate = parseDate(assignment.due);
      const month = assignment.due.slice(0, 7);
      const row = dueRow(assignment);
      forecast[month] = forecast[month] || [];
      forecast[month].push(row);

      // Keep overdue rows visible as urgent until Jira/EazyBI is corrected.
      if (dueDate <= cutoff60) {
        expiring60d.push({
          key: row.key,
          assignee: row.assignee,
          client: row.client,
          position: row.position,
          due: row.due,
          sow: row.sow,
          project_manager: row.project_manager,
          csm: row.csm
        });
      }
    });

  const sortedForecast = Object.fromEntries(Object.entries(forecast).sort(([a], [b]) => a.localeCompare(b)));
  return {
    expiring_60d: expiring60d,
    forecast: sortedForecast,
    forecast_total: Object.values(sortedForecast).reduce((sum, rows) => sum + rows.length, 0)
  };
}

function buildEnrichmentMap(snapshot = {}) {
  const map = new Map();
  (snapshot.assignment_rows || []).forEach((row) => {
    if (row?.key) map.set(row.key, row);
  });
  Object.values(snapshot.forecast || {}).flat().forEach((row) => {
    if (row?.key) map.set(row.key, { ...(map.get(row.key) || {}), ...row });
  });
  (snapshot.bench_list || []).forEach((row) => {
    if (row?.key) map.set(row.key, { ...(map.get(row.key) || {}), ...row });
  });
  return map;
}

function applyEnrichment(assignment, enrichment) {
  const row = enrichment.get(assignment.key);
  if (!row) return assignment;
  const enriched = { ...assignment };
  // Never overwrite the current Jira assignee with historical snapshot data.
  // This is especially important for Bench rows: when a Bench issue is
  // reassigned, stale enrichment can otherwise keep showing the previous
  // person while the email/account belongs to the new assignee.
  if (!enriched.assignee && row.assignee) enriched.assignee = row.assignee;
  if (!enriched.client && row.client) enriched.client = row.client;
  if (!enriched.due && row.due) enriched.due = row.due;
  if (row.sow || row.summary) enriched.summary = row.sow || row.summary;
  if (row.project_status) enriched.project_status = row.project_status;
  if (row.epic_status) enriched.epic_status = row.epic_status;
  if (row.potential_next_assignment) enriched.potential_next_assignment = row.potential_next_assignment;
  if (row.technology) enriched.technology = row.technology;
  if (row.frameworks) enriched.frameworks = row.frameworks;
  if (row.project_manager) enriched.project_manager = row.project_manager;
  if (row.freelance) enriched.freelance = row.freelance;
  if (row.epic_billing !== undefined && row.epic_billing !== '') enriched.epic_billing = row.epic_billing;
  if (row.billing_class) enriched.billing_class = row.billing_class;
  if (row.csm) enriched.csm = row.csm;
  if (row.csm_assigned) enriched.csm_assigned = row.csm_assigned;
  if (row.availability_pct !== undefined && row.availability_pct !== '') enriched.availability_pct = row.availability_pct;
  if ((enriched.assignment_pct === undefined || enriched.assignment_pct === '') && row.assignment_pct !== undefined && row.assignment_pct !== '') {
    enriched.assignment_pct = row.assignment_pct;
  }
  if (row.billing_pct !== undefined && row.billing_pct !== '') enriched.billing_pct = row.billing_pct;
  if (row.bench_pct !== undefined && row.bench_pct !== '') enriched.bench_pct = row.bench_pct;
  return normalizeInternalCapacity({
    ...enriched,
    billing_class: childIssueBillingClass(enriched)
  });
}

function enrichParsedWithSnapshot(parsed, snapshot) {
  const enrichment = buildEnrichmentMap(snapshot);
  if (!enrichment.size) return parsed;

  const next = { ...parsed };
  next.active = (parsed.active || []).map((assignment) => applyEnrichment(assignment, enrichment));
  next.bench = (parsed.bench || []).map((assignment) => applyEnrichment(assignment, enrichment));
  next.pending = (parsed.pending || []).map((assignment) => applyEnrichment(assignment, enrichment));
  const residualRows = applyResidualBenchPercent([...next.active, ...next.bench, ...next.pending]);
  next.active = residualRows.filter((assignment) => assignment.status === 'In Progress' && assignment.client && assignment.client !== 'Bench');
  next.bench = residualRows.filter((assignment) => assignment.status === 'In Progress' && assignment.client === 'Bench');
  next.pending = residualRows.filter((assignment) => assignment.status === 'Assigned');
  if (snapshotUsesFilteredBench(snapshot)) {
    next.bench = next.bench.filter(hasAllowedBenchProjectStatus);
    next.bench_source = snapshot.bench_source || 'EazyBI Bench report · Active/New Hires only';
  }

  const today = parseDate(parsed.todayIso) || new Date();
  const dueRollups = buildDueDateRollups([...next.active, ...next.bench, ...next.pending], today, addDays(today, 60));
  next.expiring_60d = dueRollups.expiring_60d;
  next.forecast = dueRollups.forecast;
  next.forecast_total = dueRollups.forecast_total;
  next.forecast_source = parsed.forecast_source || 'Jira In Progress assignment due dates · Bench excluded';
  next.bench_source = next.bench_source || parsed.bench_source || 'Jira Bench In Progress assignments';
  next.account_coverage = (parsed.account_coverage && parsed.account_coverage.length)
    ? parsed.account_coverage
    : (snapshot?.account_coverage || []);
  next.account_coverage_source = parsed.account_coverage_source || snapshot?.account_coverage_source || '';
  next.non_billable_epic_assignments = (parsed.non_billable_epic_assignments && parsed.non_billable_epic_assignments.length)
    ? parsed.non_billable_epic_assignments
    : (snapshot?.non_billable_epic_assignments || []);
  next.bench_by_month = (parsed.bench_by_month && Object.keys(parsed.bench_by_month).length)
    ? parsed.bench_by_month
    : (snapshot?.bench_by_month || {});
  next.utilization_billing_rate = (parsed.utilization_billing_rate && Object.keys(parsed.utilization_billing_rate).length)
    ? parsed.utilization_billing_rate
    : (snapshot?.utilization_billing_rate || {});
  next.harvest = (parsed.harvest && Object.keys(parsed.harvest).length)
    ? parsed.harvest
    : (snapshot?.harvest || {});
  return next;
}

function assignmentRow(assignment) {
  const normalized = normalizeInternalCapacity(assignment);
  return {
    key: normalized.key || '',
    assignee: normalized.assignee || '',
    email: normalized.email || '',
    status: normalized.status || '',
    client: normalized.client || '',
    position: normalized.position || '',
    assignment_position: normalized.assignment_position || '',
    epic_position: normalized.epic_position || '',
    start: normalized.start || '',
    due: normalized.due || '',
    epic_due: normalized.epic_due || '',
    pct: normalized.pct ?? '',
    assignment_pct: normalized.assignment_pct ?? '',
    billing_pct: normalized.billing_pct ?? '',
    availability_pct: normalized.availability_pct ?? '',
    bench_pct: normalized.bench_pct ?? '',
    technology: normalized.technology || '',
    frameworks: normalized.frameworks || '',
    potential_next_assignment: normalized.potential_next_assignment || '',
    project_manager: normalized.project_manager || '',
    epic_status: normalized.epic_status || '',
    csm: normalized.csm || normalized.csm_assigned || '',
    summary: normalized.summary || '',
    epic_key: normalized.epic_key || '',
    epic_assignee: normalized.epic_assignee || '',
    freelance: normalized.freelance || '',
    epic_billing: normalized.epic_billing ?? '',
    billing_class: normalized.billing_class || '',
    billing_type: normalized.billing_type || '',
    jira_bench_pct: normalized.jira_bench_pct ?? '',
    bench_expected_pct: normalized.bench_expected_pct ?? '',
    bench_consumed_pct: normalized.bench_consumed_pct ?? '',
    bench_pct_mismatch: Boolean(normalized.bench_pct_mismatch)
  };
}

function reportPercentValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.round((Math.abs(number) <= 1.5 ? number * 100 : number) * 100) / 100;
}

function normalizeUtilizationBillingRateReport(report = {}) {
  if (!report || typeof report !== 'object') return {};
  const sourceRates = report.rates || {};
  const months = (report.months && report.months.length)
    ? report.months
    : Object.keys(sourceRates);
  const rates = {};
  const totalHeadcount = Number(report.total_headcount || 0);
  months.forEach((month) => {
    rates[month] = reportPercentValue(sourceRates[month]);
  });
  const formula = report.formula || {
    label: 'Utilization Billing Rate',
    calculation: 'Utilization Billing Rate = Billed / utilized billable capacity ÷ Total Headcount',
    numerator: 'Billed / utilized billable capacity from EazyBI',
    denominator: 'Total Headcount from EazyBI',
    note: 'The dashboard stores the EazyBI percentage as the authoritative KPI. When the numerator is not exported by the report, billed headcount is derived as Utilization Billing % × total headcount for review only. Hourly rates are not used.'
  };
  const modeledRows = (report.modeled_rows && report.modeled_rows.length)
    ? report.modeled_rows
    : months.map((month) => {
        const rate = reportPercentValue(rates[month]);
        const estimatedBillableHeadcount = totalHeadcount
          ? Math.round((rate / 100) * totalHeadcount * 100) / 100
          : 0;
        return {
          month,
          utilization_billing_rate: rate,
          total_headcount: totalHeadcount,
          estimated_billable_headcount: estimatedBillableHeadcount,
          formula: totalHeadcount
            ? `${estimatedBillableHeadcount} ÷ ${totalHeadcount} = ${rate}%`
            : `EazyBI exported ${rate}%`
        };
      });
  const rawTable = report.raw_table || {
    columns: ['Month', 'Utilization Billing Rate', 'Total Headcount', 'Estimated billed HC', 'Procedure'],
    rows: modeledRows.map((row) => [
      row.month,
      `${row.utilization_billing_rate}%`,
      row.total_headcount,
      row.estimated_billable_headcount,
      row.formula
    ])
  };
  return {
    ...report,
    months,
    rates,
    total_headcount: totalHeadcount,
    formula,
    modeled_rows: modeledRows,
    raw_table: rawTable
  };
}

function snapshotRowSummary(row = {}) {
  return {
    key: row.key || '',
    assignee: row.assignee || '',
    client: row.client || '',
    position: row.position || '',
    status: row.status || '',
    due: row.due || '',
    assignment_pct: row.assignment_pct ?? '',
    project_manager: row.project_manager || '',
    epic_status: row.epic_status || '',
    epic_key: row.epic_key || '',
    epic_due: row.epic_due || '',
    max_child_due: row.max_child_due || '',
    child_key: row.child_key || '',
    harvest_project: row.harvest_project || '',
    harvest_client: row.harvest_client || '',
    harvest_user: row.harvest_user || '',
    reason: row.reason || '',
    psa_present: row.psa_present ?? '',
    dashboard_present: row.dashboard_present ?? '',
    psa_status: row.psa_status || '',
    dashboard_status: row.dashboard_status || '',
    jira_bench_pct: row.jira_bench_pct ?? '',
    bench_expected_pct: row.bench_expected_pct ?? '',
    bench_consumed_pct: row.bench_consumed_pct ?? ''
  };
}

function rowAssignmentPct(row = {}) {
  const value = row.assignment_pct ?? row.pct ?? '';
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function rowBillingPct(row = {}) {
  const value = row.billing_pct ?? row.epic_billing ?? '';
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function isExternalInProgress(row = {}) {
  return row.status === 'In Progress'
    && row.client
    && row.client !== 'Bench'
    && row.client !== 'Azumo';
}

function externalZeroBillingRows(rows = []) {
  return (rows || []).filter((row) => isExternalInProgress(row) && rowBillingPct(row) === 0);
}

function buildHarvestQaRows(snapshot = {}) {
  const jiraRows = (snapshot.assignment_rows || []).filter(isJiraHarvestAuthoritativeRow);
  const harvestAssignments = snapshot.harvest?.user_assignments || [];
  const jiraByPerson = new Map();
  const harvestByPerson = new Map();

  for (const row of jiraRows) {
    const key = personMatchKey(row);
    if (!key) continue;
    if (!jiraByPerson.has(key)) {
      jiraByPerson.set(key, {
        person_key: key,
        assignee: row.assignee || '',
        email: row.email || '',
        clients: new Set(),
        positions: new Set(),
        rows: []
      });
    }
    const person = jiraByPerson.get(key);
    person.clients.add(normalizeCoverageClient(row.client));
    if (row.position) person.positions.add(row.position);
    person.rows.push(row);
  }

  for (const assignment of harvestAssignments || []) {
    const key = personMatchKey(assignment);
    if (!key) continue;
    if (!harvestByPerson.has(key)) harvestByPerson.set(key, []);
    harvestByPerson.get(key).push(assignment);
  }

  const missingProjectAccess = [];
  const extraProjectAccess = [];
  const unmatchedHarvestUsers = [];

  for (const [personKey, person] of jiraByPerson.entries()) {
    const harvestRows = harvestByPerson.get(personKey) || [];
    const isPm = [...person.positions].some(isProjectManagerPosition);

    for (const jiraRow of person.rows) {
      const clientKey = normalizeCoverageClient(jiraRow.client);
      const hasClient = harvestRows.some((harvestRow) => harvestProjectKeys(harvestRow).includes(clientKey));
      if (!hasClient) {
        missingProjectAccess.push({
          key: jiraRow.key || '',
          assignee: jiraRow.assignee || '',
          email: jiraRow.email || '',
          client: jiraRow.client || '',
          position: jiraRow.position || '',
          status: jiraRow.status || '',
          due: jiraRow.due || '',
          project_manager: jiraRow.project_manager || '',
          harvest_project: '',
          harvest_client: '',
          harvest_user: harvestRows[0]?.user_name || '',
          reason: 'Active Jira assignment is missing matching Harvest project access.'
        });
      }
    }

    if (!isPm) {
      const allowed = person.clients;
      for (const harvestRow of harvestRows) {
        if (isHarvestOtherProject(harvestRow)) continue;
        const matchesJiraClient = harvestProjectKeys(harvestRow).some((key) => allowed.has(key));
        if (!matchesJiraClient) {
          extraProjectAccess.push({
            key: '',
            assignee: person.assignee || harvestRow.user_name || '',
            email: person.email || harvestRow.user_email || '',
            client: [...person.rows.map((row) => row.client)].filter(Boolean).join(', '),
            position: [...person.positions].filter(Boolean).join(', '),
            status: 'Harvest active',
            due: '',
            project_manager: '',
            harvest_project: harvestRow.project_name || '',
            harvest_client: harvestRow.client_name || '',
            harvest_user: harvestRow.user_name || '',
            reason: 'Non-PM has extra active Harvest project access outside Jira + Other.'
          });
        }
      }
    }
  }

  for (const [personKey, harvestRows] of harvestByPerson.entries()) {
    if (jiraByPerson.has(personKey)) continue;
    const nonOther = harvestRows.filter((row) => !isHarvestOtherProject(row));
    if (!nonOther.length) continue;
    const first = nonOther[0] || {};
    unmatchedHarvestUsers.push({
      key: '',
      assignee: first.user_name || '',
      email: first.user_email || '',
      client: '',
      position: '',
      status: 'Harvest active',
      due: '',
      project_manager: '',
      harvest_project: nonOther.map((row) => row.project_name).filter(Boolean).slice(0, 6).join(', '),
      harvest_client: nonOther.map((row) => row.client_name).filter(Boolean).slice(0, 6).join(', '),
      harvest_user: first.user_name || '',
      reason: 'Harvest user has active project access but no matching active Jira assignment.'
    });
  }

  return {
    missing_project_access: missingProjectAccess,
    extra_project_access: extraProjectAccess,
    unmatched_harvest_users: unmatchedHarvestUsers
  };
}

function missingEpicPositionRows(rows = []) {
  const byEpic = new Map();
  for (const row of rows || []) {
    if (row.status !== 'In Progress') continue;
    if (!row.epic_key) continue;
    if (String(row.epic_position || '').trim()) continue;
    const key = row.epic_key || row.assignee || row.key;
    if (!byEpic.has(key)) {
      byEpic.set(key, {
        ...row,
        key: row.epic_key || row.key,
        due: row.epic_due || row.due,
        position: row.epic_position || ''
      });
    }
  }
  return [...byEpic.values()].sort((a, b) => String(a.assignee || '').localeCompare(String(b.assignee || '')));
}

function buildEpicDueBeforeChildDueRows(rows = []) {
  const byEpic = new Map();
  for (const row of rows || []) {
    if (row.status !== 'In Progress') continue;
    if (isBenchClient(row.client)) continue;
    if (!row.epic_key || !row.epic_due || !row.due) continue;
    if (!byEpic.has(row.epic_key)) {
      byEpic.set(row.epic_key, {
        key: row.epic_key,
        epic_key: row.epic_key,
        assignee: row.epic_assignee || row.assignee || '',
        client: row.client || '',
        position: row.epic_position || '',
        status: row.epic_status || '',
        epic_due: row.epic_due,
        due: row.epic_due,
        max_child_due: row.due,
        child_key: row.key,
        project_manager: row.project_manager || ''
      });
      continue;
    }
    const current = byEpic.get(row.epic_key);
    if (String(row.due) > String(current.max_child_due || '')) {
      current.max_child_due = row.due;
      current.child_key = row.key;
      current.client = row.client || current.client;
      current.project_manager = row.project_manager || current.project_manager;
    }
  }
  return [...byEpic.values()].filter((row) => String(row.epic_due) < String(row.max_child_due));
}

function clientSourceMismatchRows(rows = [], coverage = []) {
  const skipClient = (client) => ['bench', 'azumo'].includes(String(client || '').trim().toLowerCase());
  const dashboardClients = new Map();
  for (const row of rows || []) {
    if (!isExternalInProgress(row) || skipClient(row.client)) continue;
    const key = normalizeCoverageClient(row.client);
    if (key && !dashboardClients.has(key)) dashboardClients.set(key, row);
  }
  const psaClients = new Map();
  for (const row of coverage || []) {
    if (!row.client || skipClient(row.client)) continue;
    const key = row.client_key || normalizeCoverageClient(row.client);
    if (key && !psaClients.has(key)) psaClients.set(key, row);
  }

  const mismatches = [];
  for (const [key, row] of psaClients.entries()) {
    if (!dashboardClients.has(key)) {
      mismatches.push({
        key: row.key || '',
        client: row.client || '',
        status: row.status || '',
        psa_status: row.status || '',
        psa_present: true,
        dashboard_present: false,
        reason: 'Client exists in PSA but is not feeding Operating Views from active AA assignments.'
      });
    }
  }
  for (const [key, row] of dashboardClients.entries()) {
    if (!psaClients.has(key)) {
      mismatches.push({
        key: row.key || row.epic_key || '',
        assignee: row.assignee || '',
        client: row.client || '',
        position: row.position || '',
        status: row.status || '',
        dashboard_status: row.status || '',
        psa_present: false,
        dashboard_present: true,
        project_manager: row.project_manager || '',
        reason: 'Client feeds Operating Views but no matching PSA client Epic was found.'
      });
    }
  }
  return mismatches.sort((a, b) => String(a.client || '').localeCompare(String(b.client || '')));
}

function dataQualityCheck(id, label, severity, rows, description) {
  const count = rows.length;
  return {
    id,
    label,
    severity,
    status: count ? severity : 'ok',
    count,
    description,
    rows: rows.slice(0, 75).map(snapshotRowSummary)
  };
}

function buildDataQuality(snapshot) {
  const rows = snapshot.assignment_rows || [];
  const coverage = snapshot.account_coverage || [];
  const hasHarvestData = Boolean(snapshot.harvest && Array.isArray(snapshot.harvest.user_assignments));
  const harvestQa = hasHarvestData ? buildHarvestQaRows(snapshot) : {
    missing_project_access: [],
    extra_project_access: [],
    unmatched_harvest_users: []
  };
  const checks = [
    dataQualityCheck(
      'missing_assignee',
      'Missing assignee',
      'error',
      rows.filter((row) => !String(row.assignee || '').trim()),
      'Assignment rows should identify the person or be explicitly investigated.'
    ),
    dataQualityCheck(
      'missing_epic_position',
      'Position QA — missing Epic Position - Assignee',
      'warning',
      missingEpicPositionRows(rows),
      'Visible Position comes only from the AA parent Epic field "Position - Assignee"; child Assignment positions are audit-only.'
    ),
    dataQualityCheck(
      'missing_due_date',
      'Missing due date',
      'warning',
      rows.filter((row) => row.status === 'In Progress' && !isBenchClient(row.client) && !String(row.due || '').trim()),
      'Due dates feed Forecast and the 60-day expiration list. Bench due dates are placeholders and are ignored.'
    ),
    dataQualityCheck(
      'missing_project_manager',
      'Missing Project Manager',
      'warning',
      rows.filter((row) => isExternalInProgress(row) && !String(row.project_manager || '').trim()),
      'External client assignments should have a PM for escalation and Slack reminders.'
    ),
    dataQualityCheck(
      'zero_assignment_pct',
      'In-progress rows with 0% assignment',
      'warning',
      rows.filter((row) => row.status === 'In Progress' && row.client && !isBenchClient(row.client) && rowAssignmentPct(row) === 0),
      'Assignment (%) should be populated for active capacity calculations.'
    ),
    dataQualityCheck(
      'external_zero_billing',
      'External assignments with Billing 0',
      'warning',
      externalZeroBillingRows(rows),
      'List people with Billing 0 while assigned to a real client. Bench and Azumo are excluded.'
    ),
    dataQualityCheck(
      'account_coverage_gaps',
      'Account Coverage gaps',
      'warning',
      coverage.filter((row) => row.complete === false || (row.missing || []).length),
      'PSA account coverage should include PM, CSM, and TL where applicable.'
    ),
    dataQualityCheck(
      'client_source_mismatch',
      'PSA clients vs Operating Views',
      'warning',
      clientSourceMismatchRows(rows, coverage),
      'Clients in Jira PSA should match the external active clients feeding Operating Views from AA.'
    ),
    dataQualityCheck(
      'epic_due_before_child_due',
      'Epic due date before child assignment due date',
      'warning',
      buildEpicDueBeforeChildDueRows(rows),
      'The Epic due date should be equal to or later than the furthest In Progress child Assignment due date.'
    ),
    dataQualityCheck(
      'bench_residual_mismatch',
      'Bench assignment percent does not match residual capacity',
      'error',
      rows.filter((row) => isBenchClient(row.client) && row.status === 'In Progress' && row.bench_pct_mismatch),
      'Active Bench should equal 100% minus all active non-Bench assignments for the same person, including Azumo/internal work. Correct Jira if the Bench issue percent differs.'
    )
  ];
  if (hasHarvestData) {
    checks.push(
      dataQualityCheck(
        'harvest_missing_project_access',
        'Harvest missing project access for active Jira assignment',
        'warning',
        harvestQa.missing_project_access,
        'Every active Jira assignment whose parent Epic is Active should have matching active Harvest project access for the assignee.'
      ),
      dataQualityCheck(
        'harvest_extra_project_access',
        'Harvest extra project access for non-PM',
        'warning',
        harvestQa.extra_project_access,
        'Non-PM assignees should only have active Harvest access to Other plus their active Jira client/project. Project Managers are allowed to have broader project access.'
      ),
      dataQualityCheck(
        'harvest_unmatched_active_users',
        'Harvest active users without matching Jira assignment',
        'warning',
        harvestQa.unmatched_harvest_users,
        'Harvest active project access should map back to an active Jira assignment unless the project is Other or the person is covered by PM rules.'
      )
    );
  }
  const issues = checks.reduce((sum, check) => sum + check.count, 0);
  return {
    generated_at: new Date().toISOString(),
    status: issues ? 'needs_review' : 'ok',
    issue_count: issues,
    checks,
    daily_review: [
      'Sync Jira + EazyBI before reviewing the board.',
      'Review Position QA: visible Position must come from AA Epic "Position - Assignee".',
      'Review external assignments with Billing 0, excluding Bench and Azumo.',
      'Review Bench residual capacity: active Bench must equal 100% minus all active non-Bench assignments for the person.',
      'Review assignments whose last day has passed, plus upcoming due dates for planning.',
      'Review Account Coverage gaps so PM, CSM, and TL stay current.',
      'Review Harvest vs Jira access: non-PMs should only see Other plus their active Jira client/project.',
      'Confirm EazyBI Bench by Month and Utilization Billing Rate imports are fresh.'
    ]
  };
}

function buildDataLineage(snapshot) {
  return {
    generated_at: new Date().toISOString(),
    sources: [
      {
        name: 'Jira AA Assignments',
        feeds: ['assignment_rows', 'bench_list', 'forecast', 'expiring_60d'],
        rule: 'Assignment issues in project AA; Forecast uses In Progress assignment due dates, excluding Bench because its due date is a required placeholder. Jira due date wins over stale snapshot/CSV values.'
      },
      {
        name: 'Jira AA parent Epic Position - Assignee',
        feeds: ['assignment_rows.position', 'data_quality.missing_epic_position'],
        rule: 'Visible Position is read only from the AA parent Epic Position - Assignee field; child Assignment position is audit-only.'
      },
      {
        name: 'EazyBI Utilization Billing Rate',
        feeds: ['metrics.utilization_billing', 'utilization_billing_rate'],
        rule: 'Authoritative percentage from EazyBI. Procedure: billed / utilized billable capacity ÷ total headcount. Hourly rates are not used; Harvest rates remain read-only and are not imported yet.'
      },
      {
        name: 'EazyBI headcount metrics',
        feeds: ['metrics.headcount_billable', 'metrics.headcount_nonbillable', 'metrics.headcount_total', 'metrics.unassigned_capacity'],
        rule: 'Headcount Billable, Non-Billable, Total Headcount, and unassigned capacity are taken from source reports, not recalculated from Jira child issues.'
      },
      {
        name: 'Jira PSA Account Coverage',
        feeds: ['account_coverage'],
        rule: 'PSA epics provide PM Assigned, CSM Assigned, and TL Assigned for client coverage checks.'
      },
      {
        name: 'Harvest API v2',
        feeds: ['harvest.projects', 'harvest.user_assignments', 'data_quality.harvest_*'],
        rule: 'Harvest active projects and user assignments are compared against Jira AA active assignments. Non-PM assignees should have access only to Other plus their active Jira client/project; Project Managers are exempt from extra-project access alerts.'
      }
    ]
  };
}

function buildSnapshot(parsed, overrides = {}) {
  const date = parsed.todayIso || isoDate(new Date());
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const snapshot = {
    date,
    label,
    metrics: {
      utilization_assignment: Number(overrides.utilization_assignment || 0),
      utilization_billing: Number(overrides.utilization_billing || 0),
      headcount_billable: Number(overrides.headcount_billable || 0),
      headcount_nonbillable: Number(overrides.headcount_nonbillable || 0),
      headcount_total: Number(overrides.headcount_total || 0) || (Number(overrides.headcount_billable || 0) + Number(overrides.headcount_nonbillable || 0)),
      bench: (parsed.bench || []).length || Number(overrides.bench || 0),
      active_clients: (parsed.active_clients || []).length,
      pending_assignments: (parsed.pending || []).length,
      unassigned_capacity: Number(overrides.unassigned_capacity || 0)
    },
    expiring_60d: parsed.expiring_60d || [],
    active_clients: parsed.active_clients || [],
    forecast: parsed.forecast || {},
    forecast_total: parsed.forecast_total || Object.values(parsed.forecast || {}).reduce((sum, rows) => sum + rows.length, 0),
    forecast_source: parsed.forecast_source || 'Jira In Progress assignment due dates · Bench excluded',
    bench_source: parsed.bench_source || 'Jira Bench In Progress assignments',
    account_coverage: parsed.account_coverage || [],
    account_coverage_source: parsed.account_coverage_source || 'Jira PSA Epic Account Coverage',
    non_billable_epic_assignments: (parsed.non_billable_epic_assignments || []).map(assignmentRow),
    bench_by_month: parsed.bench_by_month || {},
    utilization_billing_rate: normalizeUtilizationBillingRateReport(parsed.utilization_billing_rate || {}),
    harvest: parsed.harvest || {},
    assignment_rows: [
      ...(parsed.active || []),
      ...(parsed.bench || []),
      ...(parsed.pending || [])
    ].map(assignmentRow),
    bench_list: overrides.bench_list || parsed.bench || [],
    pending_list: (parsed.pending || []).map((assignment) => ({
      key: assignment.key,
      assignee: assignment.assignee,
      client: assignment.client,
      position: assignment.position,
      start: assignment.start
    }))
  };
  snapshot.data_quality = buildDataQuality(snapshot);
  snapshot.data_lineage = buildDataLineage(snapshot);
  return snapshot;
}

function issuesFromJiraResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.issues)) return payload.issues;
  return [];
}

module.exports = {
  buildSnapshot,
  enrichParsedWithSnapshot,
  issuesFromJiraResponse,
  parseAccountCoverageIssues,
  parseJiraIssues
};
