const DEFAULT_TIMEZONE = 'America/Argentina/Mendoza';
const DEFAULT_DASHBOARD_URL = 'https://pmoboard.vercel.app';

function clean(value) {
  return String(value ?? '').trim();
}

function escHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escSlack(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isoDateInTimezone(date = new Date(), timezone = process.env.PMO_QA_TIMEZONE || DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function displayDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function dashboardUrl() {
  if (process.env.PMO_DASHBOARD_URL) return process.env.PMO_DASHBOARD_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
  return DEFAULT_DASHBOARD_URL;
}

function latestSnapshot(data = {}) {
  const snapshots = data.snapshots || [];
  return snapshots[snapshots.length - 1] || {};
}

function normalizeClient(value) {
  return clean(value).toLowerCase();
}

function isBench(row = {}) {
  return normalizeClient(row.client || row.client_name) === 'bench';
}

function isInternal(row = {}) {
  const client = normalizeClient(row.client || row.client_name);
  return client === 'bench' || client === 'azumo';
}

function isExternalInProgress(row = {}) {
  return clean(row.status) === 'In Progress' && clean(row.client) && !isInternal(row);
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function billingPct(row = {}) {
  return numeric(row.billing_pct ?? row.epic_billing);
}

function assignmentRows(snapshot = {}) {
  return Array.isArray(snapshot.assignment_rows) ? snapshot.assignment_rows : [];
}

function dueRows(snapshot = {}) {
  const rows = assignmentRows(snapshot);
  if (rows.length) return rows;
  return [
    ...(snapshot.expiring_60d || []),
    ...Object.values(snapshot.forecast || {}).flat()
  ];
}

function rowsDueOn(snapshot = {}, isoDate = isoDateInTimezone()) {
  return dueRows(snapshot)
    .filter((row) => !isBench(row))
    .filter((row) => clean(row.status || 'In Progress') === 'In Progress')
    .filter((row) => clean(row.due) === isoDate)
    .sort((a, b) => clean(a.client).localeCompare(clean(b.client)) || clean(a.assignee).localeCompare(clean(b.assignee)));
}

function overdueRows(snapshot = {}, isoDate = isoDateInTimezone()) {
  return dueRows(snapshot)
    .filter((row) => !isBench(row))
    .filter((row) => clean(row.status || 'In Progress') === 'In Progress')
    .filter((row) => clean(row.due) && clean(row.due) < isoDate)
    .sort((a, b) => clean(a.due).localeCompare(clean(b.due)) || clean(a.client).localeCompare(clean(b.client)));
}

function externalZeroBillingRows(snapshot = {}) {
  return assignmentRows(snapshot)
    .filter((row) => isExternalInProgress(row) && billingPct(row) === 0)
    .sort((a, b) => clean(a.assignee).localeCompare(clean(b.assignee)) || clean(a.client).localeCompare(clean(b.client)));
}

function missingEpicPositionRows(snapshot = {}) {
  const byEpic = new Map();
  for (const row of assignmentRows(snapshot)) {
    if (clean(row.status) !== 'In Progress') continue;
    if (!clean(row.epic_key)) continue;
    if (clean(row.epic_position)) continue;
    const key = clean(row.epic_key) || clean(row.assignee) || clean(row.key);
    if (!byEpic.has(key)) {
      byEpic.set(key, {
        ...row,
        key: clean(row.epic_key) || clean(row.key),
        due: clean(row.epic_due) || clean(row.due),
        position: clean(row.epic_position)
      });
    }
  }
  return [...byEpic.values()].sort((a, b) => clean(a.assignee).localeCompare(clean(b.assignee)));
}

function accountCoverageGaps(snapshot = {}) {
  return (snapshot.account_coverage || [])
    .filter((row) => row.complete === false || (row.missing || []).length)
    .sort((a, b) => clean(a.client).localeCompare(clean(b.client)));
}

function slackUserMap() {
  try {
    return JSON.parse(process.env.SLACK_USER_MAP_JSON || '{}') || {};
  } catch {
    return {};
  }
}

function normalizePersonKey(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, '');
}

function slackMention(nameOrEmail) {
  const map = slackUserMap();
  const direct = map[nameOrEmail] || map[clean(nameOrEmail)];
  const normalized = map[normalizePersonKey(nameOrEmail)];
  const id = direct || normalized;
  return id ? `<@${String(id).replace(/[<@>]/g, '')}>` : clean(nameOrEmail);
}

function rowLabel(row = {}) {
  return `${clean(row.assignee) || 'Unassigned'} · ${clean(row.client) || '—'} · ${clean(row.key) || '—'}`;
}

function buildDailyTasks(report) {
  return [
    `Sync Jira + EazyBI snapshot. Last refresh: ${report.last_refresh_at || report.last_refresh || '—'}.`,
    `Review Position QA: ${report.position_qa.length} Epic(s) missing "Position - Assignee".`,
    `Review external Billing 0 list: ${report.external_zero_billing.length} assignment(s), excluding Bench and Azumo.`,
    `Review assignment last days: ${report.due_today.length} last day today and ${report.overdue.length} needing action after last day.`,
    `Review Account Coverage gaps: ${report.account_coverage_gaps.length} client(s) missing PM/CSM/TL.`,
    'Confirm Bench by Month and Utilization Billing Rate imported from EazyBI and match the source reports.'
  ];
}

function buildDailyQaReport(data = {}, options = {}) {
  const snapshot = options.snapshot || latestSnapshot(data);
  const timezone = options.timezone || process.env.PMO_QA_TIMEZONE || DEFAULT_TIMEZONE;
  const today = options.today || isoDateInTimezone(new Date(), timezone);
  const report = {
    generated_at: new Date().toISOString(),
    timezone,
    today,
    dashboard_url: dashboardUrl(),
    snapshot_date: snapshot.date || data.last_refresh || '',
    last_refresh: data.last_refresh || snapshot.date || '',
    last_refresh_at: data.last_refresh_at || '',
    metrics: snapshot.metrics || {},
    due_today: rowsDueOn(snapshot, today),
    overdue: overdueRows(snapshot, today),
    external_zero_billing: externalZeroBillingRows(snapshot),
    position_qa: missingEpicPositionRows(snapshot),
    account_coverage_gaps: accountCoverageGaps(snapshot),
    data_quality_status: snapshot.data_quality?.status || '',
    data_quality_issue_count: snapshot.data_quality?.issue_count || 0
  };
  report.tasks = buildDailyTasks(report);
  return report;
}

function textRows(rows = [], max = 12) {
  const lines = rows.slice(0, max).map((row) => {
    const pm = clean(row.project_manager) ? ` · PM: ${clean(row.project_manager)}` : '';
    const due = clean(row.due) ? ` · Due: ${clean(row.due)}` : '';
    return `• ${rowLabel(row)}${due}${pm}`;
  });
  if (rows.length > max) lines.push(`• +${rows.length - max} more`);
  return lines.join('\n') || '• None';
}

function buildEmailText(report) {
  return [
    `PMO Daily QA — ${displayDate(report.today)}`,
    `Dashboard: ${report.dashboard_url}`,
    '',
    'Daily tasks:',
    ...report.tasks.map((task) => `• ${task}`),
    '',
    `Assignments on their last day today (${report.due_today.length}):`,
    textRows(report.due_today),
    '',
    `External assignments with Billing 0 (${report.external_zero_billing.length}):`,
    textRows(report.external_zero_billing),
    '',
    `Position QA (${report.position_qa.length}):`,
    textRows(report.position_qa),
    '',
    `Account Coverage gaps (${report.account_coverage_gaps.length}):`,
    textRows(report.account_coverage_gaps.map((row) => ({
      assignee: clean(row.client),
      client: `Missing: ${(row.missing || []).join(', ') || 'coverage'}`,
      key: row.key
    })))
  ].join('\n');
}

function htmlTable(rows = [], columns = [], empty = 'None') {
  if (!rows.length) return `<p style="color:#64748b">${escHtml(empty)}</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>${columns.map((column) => `<th style="text-align:left;border-bottom:1px solid #dbe3ef;padding:7px">${escHtml(column.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td style="border-bottom:1px solid #edf2f7;padding:7px;vertical-align:top">${escHtml(column.value(row))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function buildEmailHtml(report) {
  const rowColumns = [
    { label: 'Key', value: (row) => row.key },
    { label: 'Assignee', value: (row) => row.assignee },
    { label: 'Client', value: (row) => row.client },
    { label: 'Position', value: (row) => row.position },
    { label: 'Due', value: (row) => row.due },
    { label: 'PM', value: (row) => row.project_manager }
  ];
  const coverageColumns = [
    { label: 'Client', value: (row) => row.client },
    { label: 'Missing', value: (row) => (row.missing || []).join(', ') },
    { label: 'PM', value: (row) => row.pm_assigned },
    { label: 'CSM', value: (row) => row.csm_assigned },
    { label: 'TL', value: (row) => row.tl_assigned }
  ];
  return `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.45">
    <h2 style="margin:0 0 4px">PMO Daily QA — ${escHtml(displayDate(report.today))}</h2>
    <p style="margin:0 0 16px;color:#64748b">Last refresh: ${escHtml(report.last_refresh_at || report.last_refresh || '—')} · <a href="${escHtml(report.dashboard_url)}">Open dashboard</a></p>
    <h3>Today's board tasks</h3>
    <ul>${report.tasks.map((task) => `<li>${escHtml(task)}</li>`).join('')}</ul>
    <h3>Assignments on their last day today (${report.due_today.length})</h3>
    ${htmlTable(report.due_today, rowColumns, 'No assignments on their last day today.')}
    <h3>External assignments with Billing 0 (${report.external_zero_billing.length})</h3>
    ${htmlTable(report.external_zero_billing, rowColumns, 'No external client rows with Billing 0.')}
    <h3>Position QA — missing Epic Position - Assignee (${report.position_qa.length})</h3>
    ${htmlTable(report.position_qa, rowColumns, 'No missing Epic positions.')}
    <h3>Account Coverage gaps (${report.account_coverage_gaps.length})</h3>
    ${htmlTable(report.account_coverage_gaps, coverageColumns, 'No Account Coverage gaps.')}
  </div>`;
}

function recipients(value) {
  return clean(value).split(',').map((item) => clean(item)).filter(Boolean);
}

async function sendDailyQaEmail(report) {
  const to = recipients(process.env.PMO_QA_EMAIL_TO);
  if (!to.length) return { ok: false, skipped: true, reason: 'PMO_QA_EMAIL_TO not configured' };
  const from = process.env.PMO_QA_EMAIL_FROM || 'PMO Dashboard <onboarding@resend.dev>';
  const subject = `PMO Daily QA — ${displayDate(report.today)}`;
  const html = buildEmailHtml(report);
  const text = buildEmailText(report);

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html, text })
    });
    const body = await response.text();
    return { ok: response.ok, provider: 'resend', status: response.status, response: body.slice(0, 500) };
  }

  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: clean(from).match(/<([^>]+)>/)?.[1] || from, name: clean(from).replace(/<[^>]+>/, '').trim() || 'PMO Dashboard' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });
    const body = await response.text();
    return { ok: response.ok, provider: 'sendgrid', status: response.status, response: body.slice(0, 500) };
  }

  return { ok: false, skipped: true, reason: 'RESEND_API_KEY or SENDGRID_API_KEY not configured' };
}

function dueCardUrl(report) {
  const token = process.env.PMO_PUBLIC_DUE_CARD_TOKEN;
  const query = new URLSearchParams({ date: report.today });
  if (token) query.set('token', token);
  query.set('card', 'due-today');
  return `${report.dashboard_url}/api/cron-snapshot?${query.toString()}`;
}

function buildSlackBlocks(report) {
  const alertRows = report.overdue || [];
  const dueLines = alertRows.slice(0, 10).map((row) => {
    const pm = clean(row.project_manager) ? ` · PM: ${slackMention(row.project_manager)}` : '';
    return `• *${escSlack(row.assignee || 'Unassigned')}* — ${escSlack(row.client || '—')} · ${escSlack(row.key || '—')} · last day ${escSlack(displayDate(row.due))}${pm}`;
  });
  if (alertRows.length > 10) dueLines.push(`• +${alertRows.length - 10} more`);
  return [
    { type: 'header', text: { type: 'plain_text', text: `Assignments needing action — ${displayDate(report.today)}` } },
    { type: 'section', text: { type: 'mrkdwn', text: dueLines.join('\n') || 'No assignments needing action after last day.' } },
    { type: 'image', image_url: dueCardUrl(report), alt_text: 'PMO due assignments card' },
    { type: 'section', text: { type: 'mrkdwn', text: `<${report.dashboard_url}|Open PMO Dashboard> · Daily QA panel` } }
  ];
}

async function sendSlackDueAlert(report) {
  if (!report.overdue.length) return { ok: true, skipped: true, reason: 'No assignments needing action after last day' };
  const text = `PMO alert: ${report.overdue.length} assignment(s) need action after their last day (${displayDate(report.today)}).`;
  const blocks = buildSlackBlocks(report);

  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_ASSIGNMENTS_CHANNEL_ID) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: process.env.SLACK_ASSIGNMENTS_CHANNEL_ID,
        text,
        blocks,
        unfurl_links: false,
        unfurl_media: true
      })
    });
    const body = await response.json().catch(async () => ({ raw: await response.text() }));
    return { ok: response.ok && body.ok !== false, provider: 'slack-web-api', response: body };
  }

  if (process.env.SLACK_ASSIGNMENTS_WEBHOOK_URL) {
    const response = await fetch(process.env.SLACK_ASSIGNMENTS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks })
    });
    const body = await response.text();
    return { ok: response.ok, provider: 'slack-webhook', status: response.status, response: body.slice(0, 500) };
  }

  return { ok: false, skipped: true, reason: 'Slack env vars not configured' };
}

function renderDueTodaySvg(report) {
  const rows = (report.overdue || []).slice(0, 14);
  const width = 1200;
  const rowHeight = 54;
  const height = Math.max(260, 168 + Math.max(rows.length, 1) * rowHeight);
  const rowSvg = rows.length
    ? rows.map((row, index) => {
        const y = 136 + index * rowHeight;
        return `<g>
          <rect x="36" y="${y}" width="1128" height="44" rx="12" fill="${index % 2 ? '#f8fafc' : '#ffffff'}" stroke="#e2e8f0"/>
          <text x="58" y="${y + 19}" font-size="17" font-weight="700" fill="#0f172a">${escHtml(row.assignee || 'Unassigned')}</text>
          <text x="58" y="${y + 37}" font-size="13" fill="#64748b">${escHtml(row.key || '')} · ${escHtml(row.position || '')}</text>
          <text x="430" y="${y + 27}" font-size="16" fill="#0f172a">${escHtml(row.client || '—')}</text>
          <text x="760" y="${y + 27}" font-size="15" fill="#475569">PM: ${escHtml(row.project_manager || '—')}</text>
          <text x="1030" y="${y + 27}" font-size="15" font-weight="700" fill="#ef4444">${escHtml(displayDate(row.due))}</text>
        </g>`;
      }).join('')
    : `<text x="58" y="168" font-size="22" font-weight="700" fill="#10b981">No assignments on their last day today.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f1f5f9"/>
    <rect x="24" y="24" width="1152" height="${height - 48}" rx="28" fill="#ffffff" stroke="#dbe3ef"/>
    <text x="54" y="72" font-size="30" font-weight="800" fill="#0f172a">PMO Due Assignments</text>
    <text x="54" y="104" font-size="18" fill="#475569">${escHtml(displayDate(report.today))} · ${(report.overdue || []).length} need action after last day</text>
    ${rowSvg}
    <text x="54" y="${height - 42}" font-size="14" fill="#94a3b8">Generated by PMO Daily QA · ${escHtml(report.dashboard_url)}</text>
  </svg>`;
}

module.exports = {
  buildDailyQaReport,
  buildEmailHtml,
  buildEmailText,
  renderDueTodaySvg,
  sendDailyQaEmail,
  sendSlackDueAlert
};
