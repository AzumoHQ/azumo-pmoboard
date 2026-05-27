const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_JQL = process.env.JIRA_JQL || 'project = AA';

const DEFAULT_FIELDS = [
  'summary',
  'assignee',
  'status',
  'duedate',
  'customfield_10800',
  'customfield_11391',
  'customfield_11525',
  'customfield_11528',
  'customfield_12021'
];

function assertJiraConfig() {
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('Missing Jira credentials. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.');
  }
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
  const fields = (process.env.JIRA_FIELDS || DEFAULT_FIELDS.join(','))
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

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

  return { ...firstPage, issues };
}

module.exports = {
  getIssues,
  jiraRequest
};
