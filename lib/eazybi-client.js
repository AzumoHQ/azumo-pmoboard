const EAZYBI_URL = process.env.EAZYBI_URL;
const EAZYBI_PUBLIC_URL = process.env.EAZYBI_PUBLIC_URL || process.env.EAZYBI_URL;
const EAZYBI_ACCOUNT_ID = process.env.EAZYBI_ACCOUNT_ID;
const EAZYBI_EMAIL = process.env.EAZYBI_EMAIL || process.env.JIRA_EMAIL;
const EAZYBI_TOKEN = process.env.EAZYBI_TOKEN;
const EAZYBI_REPORT_ID = process.env.EAZYBI_REPORT_ID;
const EAZYBI_BENCH_BY_MONTH_REPORT_ID = process.env.EAZYBI_BENCH_BY_MONTH_REPORT_ID || '4814039';
const EAZYBI_DEFAULT_ACCOUNT_ID = process.env.EAZYBI_DEFAULT_ACCOUNT_ID || process.env.EAZYBI_ACCOUNT_ID;
const EAZYBI_DEFAULT_REPORT_ID = process.env.EAZYBI_DEFAULT_REPORT_ID || process.env.EAZYBI_REPORT_ID;
const EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID = process.env.EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID || process.env.EAZYBI_ACCOUNT_ID || '232624';
const EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID = process.env.EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID || process.env.EAZYBI_ACCOUNT_ID;
const EAZYBI_UTILIZATION_BILLING_REPORT_ID = process.env.EAZYBI_UTILIZATION_BILLING_REPORT_ID;
const EAZYBI_UTILIZATION_BILLING_TOKEN = process.env.EAZYBI_UTILIZATION_BILLING_TOKEN;
const EAZYBI_BENCH_BY_MONTH_TOKEN = process.env.EAZYBI_BENCH_BY_MONTH_TOKEN;
const EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID = process.env.EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID || '216082';
const EAZYBI_INTERNAL_PROJECTS_REPORT_ID = process.env.EAZYBI_INTERNAL_PROJECTS_REPORT_ID || '5259086';
const EAZYBI_INTERNAL_PROJECTS_TOKEN = process.env.EAZYBI_INTERNAL_PROJECTS_TOKEN;
const EAZYBI_NEW_SEARCHES_ACCOUNT_ID = process.env.EAZYBI_NEW_SEARCHES_ACCOUNT_ID || '232624';
const EAZYBI_NEW_SEARCHES_REPORT_ID = process.env.EAZYBI_NEW_SEARCHES_REPORT_ID || '5434977';
const EAZYBI_NEW_SEARCHES_TOKEN = process.env.EAZYBI_NEW_SEARCHES_TOKEN;

function hasEazyBIConfig() {
  return Boolean(EAZYBI_URL && EAZYBI_EMAIL && EAZYBI_TOKEN);
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function eazybiRequest(endpoint) {
  if (!EAZYBI_URL || !EAZYBI_EMAIL || !EAZYBI_TOKEN) {
    throw new Error('Missing EazyBI credentials. Set EAZYBI_URL, EAZYBI_EMAIL, and EAZYBI_TOKEN.');
  }

  const auth = Buffer.from(`${EAZYBI_EMAIL}:${EAZYBI_TOKEN}`).toString('base64');
  const headers = {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
  };

  const base = normalizeBaseUrl(EAZYBI_URL);
  const candidates = endpoint.startsWith('/eazy/')
    ? [endpoint]
    : [endpoint, `/eazy${endpoint}`];

  let response;
  let text = '';
  for (const candidate of candidates) {
    response = await fetch(`${base}${candidate}`, { headers });
    text = await response.text();
    if (response.ok) {
      return JSON.parse(text);
    }
    if (response.status !== 404) break;
  }

  throw new Error(`EazyBI API error ${response.status}: ${text}`);
}

async function exportReport(reportId = EAZYBI_REPORT_ID || EAZYBI_DEFAULT_REPORT_ID, accountId = EAZYBI_ACCOUNT_ID || EAZYBI_DEFAULT_ACCOUNT_ID) {
  if (!accountId || !reportId) {
    throw new Error('Missing EAZYBI account ID or report ID');
  }

  return eazybiRequest(`/accounts/${accountId}/export/report/${reportId}.json`);
}

async function exportEmbeddedReport(reportId, accountId, embedToken) {
  if (!accountId || !reportId || !embedToken) {
    throw new Error('Missing EazyBI embedded report account, report, or token.');
  }

  const configuredBase = normalizeBaseUrl(EAZYBI_PUBLIC_URL || EAZYBI_URL);
  if (!configuredBase) {
    throw new Error('Missing EazyBI public URL. Set EAZYBI_PUBLIC_URL or EAZYBI_URL.');
  }
  const baseCandidates = [
    configuredBase.replace(/\/eazy$/, ''),
    configuredBase
  ].filter((base, index, all) => base && all.indexOf(base) === index);
  let lastError = '';
  for (const base of baseCandidates) {
    const url = `${base}/accounts/${encodeURIComponent(accountId)}/export/report/${encodeURIComponent(reportId)}.json?embed_token=${encodeURIComponent(embedToken)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    lastError = `EazyBI embedded report error ${response.status}: ${text}`;
    if (response.status !== 404) break;
  }
  throw new Error(lastError || 'EazyBI embedded report export failed.');
}

function percentValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Math.round((Math.abs(number) <= 1.5 ? number * 100 : number) * 100) / 100;
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return Number.isInteger(number) ? number : Math.round(number * 100) / 100;
}

function eazybiColumnNames(columnPositions = []) {
  return columnPositions.map((columnSet) => (
    columnSet.map((column) => column.name || column.full_name || '?').join(' / ')
  ));
}

function columnLeafName(column = '') {
  return String(column || '').split(' / ').at(-1)?.trim() || String(column || '').trim();
}

function columnMatches(column, match) {
  const full = String(column || '').trim();
  const leaf = columnLeafName(full);
  return match(full) || match(leaf);
}

function parseReportRows(report) {
  const queryResults = report?.query_results || {};
  const values = queryResults.values || [];
  const formatted = queryResults.formatted_values || [];
  const columns = eazybiColumnNames(queryResults.column_positions || []);
  return (queryResults.row_positions || []).map((rowPosition, rowIndex) => {
    const label = rowPosition
      .map((column) => column.name || column.full_name || '')
      .filter(Boolean)
      .join(' / ');
    const row = { row_label: label };
    columns.forEach((column, columnIndex) => {
      row[column] = values[rowIndex]?.[columnIndex];
      row[`${column}_formatted`] = formatted[rowIndex]?.[columnIndex];
    });
    return row;
  });
}

function formattedOrRaw(report, rowIndex, columnIndex) {
  const queryResults = report?.query_results || {};
  const formatted = queryResults.formatted_values?.[rowIndex]?.[columnIndex];
  if (formatted !== null && formatted !== undefined && formatted !== '') return formatted;
  const value = queryResults.values?.[rowIndex]?.[columnIndex];
  return value === null || value === undefined ? '' : value;
}

function rawReportTable(report) {
  const queryResults = report?.query_results || {};
  const columns = eazybiColumnNames(queryResults.column_positions || []);
  const rows = (queryResults.row_positions || []).map((rowPosition, rowIndex) => {
    const label = rowPosition
      .map((column) => column.name || column.full_name || '')
      .filter(Boolean)
      .join(' / ');
    return [
      label || `Row ${rowIndex + 1}`,
      ...columns.map((_, columnIndex) => formattedOrRaw(report, rowIndex, columnIndex))
    ];
  });
  return {
    columns: ['Source row', ...columns],
    rows
  };
}

function splitMeasureColumn(column) {
  const parts = String(column || '').split('/').map((part) => part.trim()).filter(Boolean);
  return {
    measure: parts[0] || '',
    month: parts[1] || ''
  };
}

function isTotalHeadcountColumn(column) {
  return /total\s+headcount/i.test(String(column || ''));
}

function parseBenchByMonthReport(report) {
  const rows = parseReportRows(report);
  const columns = eazybiColumnNames(report?.query_results?.column_positions || []);
  const months = [...new Set(columns
    .map(splitMeasureColumn)
    .filter((column) => /^(Availability|Utilization)$/i.test(column.measure) && column.month)
    .map((column) => column.month))];

  const reportRows = [];
  let totals = null;
  for (const row of rows) {
    const assignee = row.row_label || '';
    const parsed = { assignee, availability: {}, utilization: {} };
    for (const column of columns) {
      const { measure, month } = splitMeasureColumn(column);
      if (!month) continue;
      if (/^Availability$/i.test(measure)) parsed.availability[month] = percentValue(row[column]);
      if (/^Utilization$/i.test(measure)) parsed.utilization[month] = percentValue(row[column]);
    }
    if (!assignee) continue;
    if (assignee === 'Assignees') totals = parsed;
    else reportRows.push(parsed);
  }

  return {
    source: report?.report_name || 'EazyBI Bench by Month',
    last_import_at: report?.last_import_at || '',
    months,
    totals,
    rows: reportRows
  };
}

function parseUtilizationBillingRateReport(report) {
  const rows = parseReportRows(report);
  const columns = eazybiColumnNames(report?.query_results?.column_positions || []);
  const firstRow = rows[0] || {};
  const months = [];
  const rates = {};
  const headcounts = {};
  let totalHeadcount = 0;

  for (const column of columns) {
    if (isTotalHeadcountColumn(column)) {
      totalHeadcount = numericValue(firstRow[column]);
      continue;
    }
    const { measure, month } = splitMeasureColumn(column);
    if (/Utilization Billing Rate/i.test(measure) && month) {
      months.push(month);
      rates[month] = percentValue(firstRow[column]);
      const headcountColumn = columns.find((candidate) => isTotalHeadcountColumn(candidate) && splitMeasureColumn(candidate).month === month);
      if (headcountColumn) headcounts[month] = numericValue(firstRow[headcountColumn]);
    }
  }

  // Some EazyBI exports place months on rows and measures on columns.
  // Example: row = Jun 2026, columns = Utilization Billing Rate / Total Headcount.
  if (!months.length) {
    const rateColumn = columns.find((column) => /Utilization Billing Rate/i.test(column));
    const headcountColumn = columns.find(isTotalHeadcountColumn);
    if (rateColumn) {
      rows.forEach((row) => {
        const month = row.row_label;
        if (!month) return;
        months.push(month);
        rates[month] = percentValue(row[rateColumn]);
        if (headcountColumn) {
          headcounts[month] = numericValue(row[headcountColumn]);
          if (!totalHeadcount) totalHeadcount = headcounts[month];
        }
      });
    }
  }

  const formula = {
    label: 'Utilization Billing Rate',
    calculation: 'Utilization Billing Rate = Utilization ÷ Total Headcount.',
    numerator: 'Utilization: active external assignments in the selected month, excluding Bench and Azumo, weighted by Assignment (%) and prorated by working days when assignments start or end mid-month.',
    denominator: 'Total Headcount: active Epic issues where Freelance is No and Billing Type is Billable.',
    note: 'The source report is authoritative. Jira and Harvest hourly rates are not used for this KPI.',
    source_link: buildReportUrl(EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID, EAZYBI_UTILIZATION_BILLING_REPORT_ID),
    natural_language: 'This KPI shows how much of the billable, non-freelance headcount is effectively utilized on external client work during the selected month.'
  };
  const modeledRows = months.map((month) => {
    const rate = percentValue(rates[month]);
    const monthHeadcount = headcounts[month] || totalHeadcount;
    return {
      month,
      utilization_billing_rate: rate,
      total_headcount: monthHeadcount,
      formula: `Source report exported ${rate}%`
    };
  });

  return {
    source: report?.report_name || 'EazyBI Utilization Billing Rate',
    last_import_at: report?.last_import_at || '',
    months,
    rates,
    total_headcount: totalHeadcount,
    formula,
    modeled_rows: modeledRows,
    raw_table: rawReportTable(report)
  };
}


function issueMemberFromRowPosition(rowPosition = []) {
  return rowPosition.find((position) => position?.key || /\[Issue/i.test(String(position?.full_name || ''))) || rowPosition.at(-1) || {};
}

function cleanEazyBIText(value) {
  const text = String(value ?? '').trim();
  return !text || /^\(none\)$/i.test(text) ? '' : text;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function internalProjectPercent(rawValues, formattedValues, columns, rowIndex, match) {
  const index = columns.findIndex((column) => columnMatches(column, match));
  if (index < 0) return { value: 0, display: '' };
  const raw = rawValues?.[rowIndex]?.[index];
  const formatted = formattedValues?.[rowIndex]?.[index];
  return {
    value: percentValue(raw),
    display: cleanEazyBIText(formatted || `${percentValue(raw)}%`)
  };
}

function parseInternalProjectsReport(report) {
  const queryResults = report?.query_results || {};
  const columns = eazybiColumnNames(queryResults.column_positions || []);
  const rawValues = queryResults.values || [];
  const formattedValues = queryResults.formatted_values || [];
  const valueAt = (rowIndex, match) => {
    const index = columns.findIndex((column) => columnMatches(column, match));
    if (index < 0) return '';
    return cleanEazyBIText(formattedValues?.[rowIndex]?.[index] ?? rawValues?.[rowIndex]?.[index]);
  };

  const rows = (queryResults.row_positions || []).map((rowPosition, rowIndex) => {
    const issue = issueMemberFromRowPosition(rowPosition);
    const client = cleanEazyBIText(rowPosition.find((position) => /\[Client Name/i.test(String(position?.full_name || '')))?.name || rowPosition[0]?.name || 'Azumo');
    const key = cleanEazyBIText(issue.key || issue.name || '');
    const caption = cleanEazyBIText(issue.caption || issue.name || '');
    const assignee = cleanEazyBIText(key ? caption.replace(new RegExp(`^${escapeRegExp(key)}\\s*`, 'i'), '') : caption) || caption || key;
    const allocation = internalProjectPercent(rawValues, formattedValues, columns, rowIndex, (column) => /^Allocation %$/i.test(column));
    const billing = internalProjectPercent(rawValues, formattedValues, columns, rowIndex, (column) => /^Billing %$/i.test(column));
    const availability = internalProjectPercent(rawValues, formattedValues, columns, rowIndex, (column) => /Availability/i.test(column));
    return {
      client,
      key,
      assignee,
      allocation_pct: allocation.value,
      allocation_display: allocation.display,
      billing_pct: billing.value,
      billing_display: billing.display,
      availability_pct: availability.value,
      availability_display: availability.display,
      start_date: valueAt(rowIndex, (column) => /Start Date/i.test(column)),
      due_date: valueAt(rowIndex, (column) => /Due Date/i.test(column)),
      position: valueAt(rowIndex, (column) => /^Position$/i.test(column)),
      technology: valueAt(rowIndex, (column) => /^Technology$/i.test(column)),
      frameworks: valueAt(rowIndex, (column) => /^Frameworks$/i.test(column)),
      potential_next_assignment: valueAt(rowIndex, (column) => /Potential next assignment/i.test(column))
    };
  }).filter((row) => row.key || row.assignee);

  return {
    source: report?.report_name || 'EazyBI Internal Projects',
    last_import_at: report?.last_import_at || '',
    source_link: buildReportUrl(EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID, EAZYBI_INTERNAL_PROJECTS_REPORT_ID),
    row_count: rows.length,
    rows,
    raw_table: {
      columns: ['Key', 'Assignee', 'Allocation %', 'Billing %', 'Availability %', 'Start', 'Due', 'Position', 'Technology', 'Frameworks', 'Potential next assignment'],
      rows: rows.map((row) => [
        row.key,
        row.assignee,
        row.allocation_display,
        row.billing_display,
        row.availability_display,
        row.start_date,
        row.due_date,
        row.position,
        row.technology,
        row.frameworks,
        row.potential_next_assignment
      ])
    }
  };
}

async function fetchInternalProjectsReport(
  reportId = EAZYBI_INTERNAL_PROJECTS_REPORT_ID,
  accountId = EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID,
  embedToken = EAZYBI_INTERNAL_PROJECTS_TOKEN
) {
  if (!reportId || !accountId) return null;
  const report = embedToken
    ? await exportEmbeddedReport(reportId, accountId, embedToken)
    : await exportReport(reportId, accountId);
  return parseInternalProjectsReport(report);
}

function parseGenericReport(report, fallbackSource = 'EazyBI QA Report') {
  const table = rawReportTable(report);
  return {
    source: report?.report_name || fallbackSource,
    last_import_at: report?.last_import_at || '',
    columns: table.columns,
    rows: table.rows,
    row_count: table.rows.length
  };
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parseNewSearchesTriageReport(report) {
  const queryResults = report?.query_results || {};
  const columns = eazybiColumnNames(queryResults.column_positions || []);
  const rawValues = queryResults.values || [];
  const formattedValues = queryResults.formatted_values || [];
  const columnIndex = (match) => columns.findIndex((column) => columnMatches(column, match));
  const idx = {
    client: columnIndex((column) => /^Client$/i.test(column)),
    priority: columnIndex((column) => /^Priority$/i.test(column)),
    status: columnIndex((column) => /^Status$/i.test(column)),
    created: columnIndex((column) => /^Created date$/i.test(column)),
    days: columnIndex((column) => /^Days since created$/i.test(column)),
    candidates: columnIndex((column) => /^Candidates$/i.test(column)),
    quantity: columnIndex((column) => /^Quantity$/i.test(column))
  };
  const valueAt = (rowIndex, key, preferFormatted = true) => {
    const index = idx[key];
    if (index < 0) return '';
    const formatted = formattedValues?.[rowIndex]?.[index];
    const raw = rawValues?.[rowIndex]?.[index];
    return preferFormatted && formatted !== undefined && formatted !== null && formatted !== ''
      ? formatted
      : raw;
  };

  const rows = (queryResults.row_positions || []).map((rowPosition, rowIndex) => {
    const issue = issueMemberFromRowPosition(rowPosition);
    const key = cleanEazyBIText(issue.key || issue.name || '');
    const caption = cleanEazyBIText(issue.caption || issue.name || '');
    const title = cleanEazyBIText(key ? caption.replace(new RegExp(`^${escapeRegExp(key)}\\s*`, 'i'), '') : caption) || caption || key;
    const candidateLines = stripHtml(valueAt(rowIndex, 'candidates') || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const quantity = numericValue(valueAt(rowIndex, 'quantity', false));
    const daysSinceCreated = numericValue(valueAt(rowIndex, 'days', false));
    return {
      key,
      title,
      client: cleanEazyBIText(valueAt(rowIndex, 'client')),
      priority: cleanEazyBIText(valueAt(rowIndex, 'priority')),
      status: cleanEazyBIText(valueAt(rowIndex, 'status')),
      created_at: cleanEazyBIText(valueAt(rowIndex, 'created', false)),
      created_display: cleanEazyBIText(valueAt(rowIndex, 'created')),
      days_since_created: daysSinceCreated,
      days_display: cleanEazyBIText(valueAt(rowIndex, 'days')),
      candidates: candidateLines,
      candidate_count: quantity || candidateLines.length || 0
    };
  }).filter((row) => row.key || row.title || row.client);

  const priorityRank = (priority) => {
    const p = String(priority || '').toLowerCase();
    if (p.includes('highest')) return 0;
    if (p.includes('high')) return 1;
    if (p.includes('medium')) return 2;
    if (p.includes('low')) return 3;
    return 9;
  };
  rows.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
    || Number(b.days_since_created || 0) - Number(a.days_since_created || 0)
    || String(a.client || '').localeCompare(String(b.client || '')));

  return {
    source: report?.report_name || 'EazyBI New Searches Triage',
    last_import_at: report?.last_import_at || '',
    source_link: buildReportUrl(EAZYBI_NEW_SEARCHES_ACCOUNT_ID, EAZYBI_NEW_SEARCHES_REPORT_ID),
    row_count: rows.length,
    high_priority_count: rows.filter((row) => /highest|high/i.test(row.priority || '')).length,
    stale_count: rows.filter((row) => Number(row.days_since_created || 0) >= 30).length,
    without_candidates_count: rows.filter((row) => Number(row.candidate_count || 0) <= 0).length,
    rows,
    raw_table: rawReportTable(report)
  };
}

async function fetchNewSearchesTriageReport(
  reportId = EAZYBI_NEW_SEARCHES_REPORT_ID,
  accountId = EAZYBI_NEW_SEARCHES_ACCOUNT_ID,
  embedToken = EAZYBI_NEW_SEARCHES_TOKEN
) {
  if (!reportId || !accountId) return null;
  const report = embedToken
    ? await exportEmbeddedReport(reportId, accountId, embedToken)
    : await exportReport(reportId, accountId);
  return parseNewSearchesTriageReport(report);
}

async function fetchBenchByMonthReport(reportId = EAZYBI_BENCH_BY_MONTH_REPORT_ID, accountId = EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID || EAZYBI_DEFAULT_ACCOUNT_ID) {
  if (!reportId) return null;
  return parseBenchByMonthReport(await exportReport(reportId, accountId));
}

function buildReportUrl(accountId, reportId) {
  const base = normalizeBaseUrl(EAZYBI_PUBLIC_URL || EAZYBI_URL).replace(/\/eazy$/, '');
  if (!base || !accountId || !reportId) return '';
  return `${base}/accounts/${encodeURIComponent(accountId)}/reports/${encodeURIComponent(reportId)}`;
}

function reportConfig(reportKey) {
  if (reportKey === 'utilization_billing_rate') {
    return {
      account_id: EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID,
      report_id: EAZYBI_UTILIZATION_BILLING_REPORT_ID,
      embed_token: EAZYBI_UTILIZATION_BILLING_TOKEN,
      source_link: buildReportUrl(EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID, EAZYBI_UTILIZATION_BILLING_REPORT_ID)
    };
  }
  if (reportKey === 'internal_projects') {
    return {
      account_id: EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID,
      report_id: EAZYBI_INTERNAL_PROJECTS_REPORT_ID,
      embed_token: EAZYBI_INTERNAL_PROJECTS_TOKEN,
      source_link: buildReportUrl(EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID, EAZYBI_INTERNAL_PROJECTS_REPORT_ID)
    };
  }
  if (reportKey === 'bench_by_month') {
    return {
      account_id: EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID,
      report_id: EAZYBI_BENCH_BY_MONTH_REPORT_ID,
      embed_token: EAZYBI_BENCH_BY_MONTH_TOKEN,
      source_link: buildReportUrl(EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID, EAZYBI_BENCH_BY_MONTH_REPORT_ID)
    };
  }
  if (reportKey === 'new_searches') {
    return {
      account_id: EAZYBI_NEW_SEARCHES_ACCOUNT_ID,
      report_id: EAZYBI_NEW_SEARCHES_REPORT_ID,
      embed_token: EAZYBI_NEW_SEARCHES_TOKEN,
      source_link: buildReportUrl(EAZYBI_NEW_SEARCHES_ACCOUNT_ID, EAZYBI_NEW_SEARCHES_REPORT_ID)
    };
  }
  return {
    account_id: '',
    report_id: '',
    embed_token: '',
    source_link: ''
  };
}

function clientReportConfig() {
  return {
    utilization_billing_rate: {
      source_link: buildReportUrl(EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID, EAZYBI_UTILIZATION_BILLING_REPORT_ID)
    },
    internal_projects: {
      source_link: buildReportUrl(EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID, EAZYBI_INTERNAL_PROJECTS_REPORT_ID)
    },
    bench_by_month: {
      source_link: buildReportUrl(EAZYBI_BENCH_BY_MONTH_ACCOUNT_ID, EAZYBI_BENCH_BY_MONTH_REPORT_ID),
      embed_path: EAZYBI_BENCH_BY_MONTH_TOKEN ? '/api/dashboard?action=embed&report=bench_by_month' : ''
    },
    new_searches: {
      source_link: buildReportUrl(EAZYBI_NEW_SEARCHES_ACCOUNT_ID, EAZYBI_NEW_SEARCHES_REPORT_ID),
      embed_path: '/api/dashboard?action=embed&report=new_searches'
    }
  };
}

async function fetchUtilizationBillingRateReport(
  reportId = EAZYBI_UTILIZATION_BILLING_REPORT_ID,
  accountId = EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID,
  embedToken = EAZYBI_UTILIZATION_BILLING_TOKEN
) {
  if (!reportId || !accountId) return null;
  const report = embedToken
    ? await exportEmbeddedReport(reportId, accountId, embedToken)
    : await exportReport(reportId, accountId);
  return parseUtilizationBillingRateReport(report);
}

function summarizeEazyBIReport(report) {
  const queryResults = report?.query_results || {};
  const values = queryResults.values || [];
  if (values.length) {
    const columns = eazybiColumnNames(queryResults.column_positions || []);
    const row = Object.fromEntries(columns.map((name, index) => [name, values[0]?.[index]]));
    const findValue = (match) => {
      const key = Object.keys(row).find((column) => match(column));
      return key ? row[key] : undefined;
    };
    const metrics = {};
    const billable = findValue((column) => /^Billable$/i.test(column));
    const nonBillable = findValue((column) => /^Non-Billable$/i.test(column));
    const assignmentUt = findValue((column) => /Utilization Rate \(Assignment %\)/i.test(column));
    const billingUt = findValue((column) => /Utilization Rate \(Billing %\)/i.test(column));
    const unassigned = findValue((column) => /Unassigned Capacity/i.test(column));

    if (billable !== undefined) metrics.headcount_billable = numericValue(billable);
    if (nonBillable !== undefined) metrics.headcount_nonbillable = numericValue(nonBillable);
    if (billable !== undefined || nonBillable !== undefined) {
      metrics.headcount_total = numericValue(billable) + numericValue(nonBillable);
    }
    if (assignmentUt !== undefined) metrics.utilization_assignment = percentValue(assignmentUt);
    if (billingUt !== undefined) metrics.utilization_billing = percentValue(billingUt);
    if (unassigned !== undefined) metrics.unassigned_capacity = percentValue(unassigned);
    return metrics;
  }

  const rows = report?.data?.rows || report?.rows || [];
  if (!Array.isArray(rows) || !rows.length) return {};

  const normalizedRows = rows
    .map((row) => (Array.isArray(row) ? row : Object.values(row)))
    .filter((row) => row.some((value) => typeof value === 'number'));

  const numericValues = normalizedRows.flat().filter((value) => typeof value === 'number');
  if (!numericValues.length) return {};

  return {
    utilization_assignment: percentValue(numericValues[0]),
    utilization_billing: percentValue(numericValues[1]),
    unassigned_capacity: percentValue(numericValues[2])
  };
}

module.exports = {
  buildReportUrl,
  clientReportConfig,
  exportReport,
  fetchBenchByMonthReport,
  fetchUtilizationBillingRateReport,
  fetchInternalProjectsReport,
  fetchNewSearchesTriageReport,
  hasEazyBIConfig,
  parseGenericReport,
  parseBenchByMonthReport,
  parseUtilizationBillingRateReport,
  parseReportRows,
  percentValue,
  reportConfig,
  summarizeEazyBIReport
};
