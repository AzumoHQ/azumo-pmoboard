const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const DEFAULT_JIRA_JQL = 'project = AA AND issuetype = Assignment AND status in ("In Progress", "Assigned", "On Hold") ORDER BY updated DESC';
const DEFAULT_ACCOUNT_COVERAGE_JQL = 'project = PSA AND issuetype = Epic AND status in ("In Progress", Backlog) ORDER BY updated DESC';
const JIRA_JQL = process.env.JIRA_JQL || DEFAULT_JIRA_JQL;
const ACCOUNT_COVERAGE_JQL = process.env.JIRA_ACCOUNT_COVERAGE_JQL || DEFAULT_ACCOUNT_COVERAGE_JQL;
const CF_POSITION = 'customfield_11525';
const EPIC_POSITION_FIELD_NAMES = [
  'Position - Assignee',
  'Epic: Position - Assignee',
  'Position Assignee',
  'Assignee Position',
  'Position'
];

const DEFAULT_FIELDS = [
  'summary',
  'assignee',
  'status',
  'duedate',
  'parent',
  'customfield_10828',
  'customfield_10800',
  'customfield_11391',
  'customfield_11525',
  'customfield_11528',
  'customfield_11754',
  'customfield_13480',
  'customfield_12711'
];

const PARENT_FIELDS = [
  'summary',
  'assignee',
  'status',
  'duedate',
  'issuetype',
  'customfield_10828',
  CF_POSITION,
  'customfield_11754',
  'customfield_13480',
  'customfield_12711'
];

const ACCOUNT_COVERAGE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'updated',
  'customfield_12678',
  'customfield_11425',
  'customfield_11622',
  'customfield_11490',
  'customfield_10828'
];

function assertJiraConfig() {
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('Missing Jira credentials. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.');
  }
}

function uniqueFields(fields = []) {
  return [...new Set((fields || []).filter(Boolean))];
}

function hasFieldValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function normalizeFieldName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let fieldListPromise;
let epicPositionFieldIdPromise;

async function getJiraFields() {
  if (!fieldListPromise) fieldListPromise = jiraRequest('/rest/api/3/field');
  return fieldListPromise;
}

async function resolveEpicPositionFieldId() {
  if (process.env.JIRA_EPIC_POSITION_FIELD) return process.env.JIRA_EPIC_POSITION_FIELD;
  if (epicPositionFieldIdPromise) return epicPositionFieldIdPromise;

  epicPositionFieldIdPromise = getJiraFields()
    .then((fields) => {
      const byName = new Map((fields || []).map((field) => [normalizeFieldName(field.name), field.id]));
      for (const name of EPIC_POSITION_FIELD_NAMES) {
        const exact = byName.get(normalizeFieldName(name));
        if (exact) return exact;
      }
      const fuzzy = (fields || []).find((field) => {
        const normalized = normalizeFieldName(field.name);
        return normalized.includes('position') && normalized.includes('assignee');
      });
      return fuzzy?.id || CF_POSITION;
    })
    .catch((error) => {
      console.warn('Jira field discovery skipped; using default Epic Position field:', error.message);
      return CF_POSITION;
    });

  return epicPositionFieldIdPromise;
}

async function jiraRequest(endpoint, method = 'GET', body = null) {
  assertJiraConfig();

  const response = await fetch(`${JIRA_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    throw new Error(`Jira API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function getIssues(jql = JIRA_JQL) {
  const maxResults = 100;
  const epicPositionFieldId = await resolveEpicPositionFieldId();
  const fields = uniqueFields((process.env.JIRA_FIELDS || DEFAULT_FIELDS.join(','))
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .concat(epicPositionFieldId));

  const firstPage = await jiraRequest('/rest/api/3/search/jql', 'POST', {
    jql,
    fields,
    maxResults
  });

  const issues = [...(firstPage.issues || [])];
  let nextPageToken = firstPage.nextPageToken;

  while (nextPageToken) {
    const page = await jiraRequest('/rest/api/3/search/jql', 'POST', {
      jql,
      fields,
      maxResults,
      nextPageToken
    });
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  }

  await enrichIssuesWithParentFields(issues, epicPositionFieldId);

  return { ...firstPage, issues };
}

// Returns the number of issues matching a JQL query without fetching them.
// Used to source Headcount Billable / Non-Billable from an auditable Jira
// filter (active billable Epics, excluding freelancers) instead of an
// aggregated EazyBI column.
async function countIssues(jql) {
  const res = await jiraRequest('/rest/api/3/search/approximate-count', 'POST', { jql });
  return Number(res?.count ?? 0);
}

async function getAccountCoverageIssues(jql = ACCOUNT_COVERAGE_JQL) {
  return searchIssues(jql, ACCOUNT_COVERAGE_FIELDS, 100);
}

async function searchIssues(jql, fields, maxResults = 100) {
  const firstPage = await jiraRequest('/rest/api/3/search/jql', 'POST', {
    jql,
    fields,
    maxResults
  });
  const issues = [...(firstPage.issues || [])];
  let nextPageToken = firstPage.nextPageToken;

  while (nextPageToken) {
    const page = await jiraRequest('/rest/api/3/search/jql', 'POST', {
      jql,
      fields,
      maxResults,
      nextPageToken
    });
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  }

  return issues;
}

async function enrichIssuesWithParentFields(issues, epicPositionFieldId = null) {
  const parentKeys = [
    ...new Set(
      (issues || [])
        .map((issue) => issue.fields?.parent?.key)
        .filter(Boolean)
    )
  ];
  if (!parentKeys.length) return issues;

  const parentFields = uniqueFields([...PARENT_FIELDS, epicPositionFieldId || await resolveEpicPositionFieldId()]);
  const parents = [];
  for (let index = 0; index < parentKeys.length; index += 100) {
    const chunk = parentKeys.slice(index, index + 100);
    parents.push(...await searchIssues(`key in (${chunk.join(',')})`, parentFields, chunk.length));
  }

  const parentByKey = new Map(parents.map((issue) => [issue.key, issue]));
  for (const issue of issues || []) {
    const parentKey = issue.fields?.parent?.key;
    const parent = parentByKey.get(parentKey);
    if (!parent) continue;

    // The dashboard only trusts the AA parent Epic for visible Position.
    // Some Jira instances expose that Epic field as "Position - Assignee"
    // instead of the legacy Harvest Role / Position field. Normalize it into
    // CF_POSITION so the transform has one source of truth.
    if (
      epicPositionFieldId
      && epicPositionFieldId !== CF_POSITION
      && hasFieldValue(parent.fields?.[epicPositionFieldId])
    
    ) {
      parent.fields[CF_POSITION] = parent.fields[epicPositionFieldId];
    }

    issue.fields.parent = {
      ...(issue.fields.parent || {}),
      fields: {
        ...(issue.fields.parent?.fields || {}),
        ...(parent.fields || {})
      }
    };
  }

  return issues;
}

function adfParagraph(text) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: String(text || '') }]
  };
}

function adfBulletList(items = []) {
  return {
    type: 'bulletList',
    content: items.filter(Boolean).map((item) => ({
      type: 'listItem',
      content: [adfParagraph(item)]
    }))
  };
}

function adfDescriptionFromAction(action = {}) {
  const rows = Array.isArray(action.rows) ? action.rows.slice(0, 12) : [];
  const rowLines = rows.map((row) => {
    const parts = [
      row.key || row.epic_key || '',
      row.assignee || row.name || row.harvest_user || '',
      row.client || row.harvest_client || '',
      row.position || '',
      row.due || row.epic_due || '',
      row.harvest_project ? `Harvest: ${row.harvest_project}` : '',
      row.reason || row.harvest_check || ''
    ].filter(Boolean);
    return parts.join(' · ');
  });

  const content = [
    adfParagraph(action.description || 'PMO dashboard action created from the PMO Action Center.'),
    adfParagraph(`Category: ${action.category || 'qa'} · Severity: ${action.severity || 'warning'}`),
    adfParagraph(`Snapshot: ${action.snapshot_date || '—'} · Last refresh: ${action.last_refresh || '—'}`),
    adfParagraph(`Source: ${action.source || 'PMO Dashboard'}`),
    adfParagraph(`Dashboard: ${action.dashboard_url || 'https://pmoboard.vercel.app'}`),
    adfParagraph(`PMO board: ${action.pmo_board_url || 'https://azumohq.atlassian.net/jira/software/c/projects/PMO/boards/629'}`)
  ];

  const context = [
    action.key ? `Source Jira issue: ${action.key}` : '',
    action.assignee ? `Assignee: ${action.assignee}` : '',
    action.client ? `Client: ${action.client}` : '',
    action.project_manager ? `Project Manager: ${action.project_manager}` : '',
    action.due ? `Due date: ${action.due}` : ''
  ].filter(Boolean);
  if (context.length) content.push(adfParagraph('Context'), adfBulletList(context));
  if (rowLines.length) content.push(adfParagraph('Rows to review'), adfBulletList(rowLines));

  return { type: 'doc', version: 1, content };
}

function jiraSafeSummary(value) {
  const summary = String(value || 'PMO dashboard action').replace(/\s+/g, ' ').trim();
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary;
}

function jiraSafeLabels(action = {}) {
  return [
    'pmo-dashboard',
    'action-center',
    action.category ? `pmo-${action.category}` : '',
    action.severity ? `severity-${action.severity}` : ''
  ]
    .map((label) => String(label || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .slice(0, 8);
}

async function createPmoActionIssue(action = {}) {
  const projectKey = process.env.JIRA_PMO_PROJECT_KEY || 'PMO';
  const issueType = process.env.JIRA_PMO_ISSUE_TYPE || 'Task';
  const fields = {
    project: { key: projectKey },
    issuetype: { name: issueType },
    summary: jiraSafeSummary(`[PMO] ${action.title || 'Dashboard action'}`),
    description: adfDescriptionFromAction(action),
    labels: jiraSafeLabels(action)
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(action.due || ''))) {
    fields.duedate = action.due;
  }

  const issue = await jiraRequest('/rest/api/3/issue', 'POST', { fields });
  return {
    id: issue.id || '',
    key: issue.key || '',
    self: issue.self || '',
    url: issue.key ? `${JIRA_BASE_URL}/browse/${issue.key}` : ''
  };
}


const PSA_EPIC_FIELDS = [
  'summary',
  'status',
  'customfield_12678',
  'customfield_11425',
  'customfield_11622'
];

const PSA_REPORT_FIELDS = [
  'updated',
  'summary',
  'parent',
  'customfield_11031',
  'customfield_11392',
  'customfield_11394',
  'customfield_11042',
  'customfield_13514',
  'customfield_11395',
  'customfield_11178',
  'customfield_13547'
];

function extractJiraUser(field) {
  if (!field) return null;
  return {
    email: field.emailAddress || null,
    name: field.displayName || null
  };
}

const PSA_ALL_PROJECTS_JQL = 'project = PSA AND issuetype = Epic ORDER BY updated DESC';

async function getPsaProjectReports(epicJql = PSA_ALL_PROJECTS_JQL) {
  const epics = await searchIssues(epicJql, PSA_EPIC_FIELDS, 200);
  if (!epics.length) return [];

  const epicKeys = epics.map((epic) => epic.key);
  const reportsByParent = new Map();

  for (let index = 0; index < epicKeys.length; index += 50) {
    const chunk = epicKeys.slice(index, index + 50);
    const jql = `parent in (${chunk.join(',')})`;
    const children = await searchIssues(jql, PSA_REPORT_FIELDS, 200);
    for (const child of children) {
      const parentKey = child.fields?.parent?.key;
      if (!parentKey) continue;
      if (!reportsByParent.has(parentKey)) reportsByParent.set(parentKey, []);
      reportsByParent.get(parentKey).push(child);
    }
  }

  return epics.map((epic) => {
    const reports = (reportsByParent.get(epic.key) || []).slice().sort((a, b) => {
      const dateA = a.fields?.customfield_11031 || '';
      const dateB = b.fields?.customfield_11031 || '';
      return dateB.localeCompare(dateA);
    });
    const latest = reports[0] || null;

    return {
      epicKey: epic.key,
      epicName: epic.fields?.summary || epic.key,
      status: epic.fields?.status?.name || null,
      pmAssigned: extractJiraUser(epic.fields?.customfield_12678),
      csmAssigned: extractJiraUser(epic.fields?.customfield_11425),
      tlAssigned: extractJiraUser(epic.fields?.customfield_11622),
      lastReport: latest ? {
        key: latest.key,
        date: latest.fields?.customfield_11031 || null,
        reportType: latest.fields?.customfield_11392?.value || null,
        projectStatus: latest.fields?.customfield_11394?.value || null,
        teamStatus: latest.fields?.customfield_11395?.value || null
      } : null
    };
  });
}

module.exports = {
  getIssues,
  countIssues,
  getAccountCoverageIssues,
  enrichIssuesWithParentFields,
  getPsaProjectReports,
  createPmoActionIssue,
  jiraRequest
};
