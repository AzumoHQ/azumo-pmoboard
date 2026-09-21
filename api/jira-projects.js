const { jiraRequest } = require('../lib/jira-client');
const { getSessionUser } = require('../lib/auth');

function normalizeProject(p = {}) {
  const origin = p.self ? (() => { try { return new URL(p.self).origin; } catch { return ''; } })() : '';
  return {
    id: p.id || '',
    key: p.key || '',
    name: p.name || '',
    type: p.projectTypeKey || '',
    style: p.style || '',
    isPrivate: Boolean(p.isPrivate),
    lead: p.lead ? { id: p.lead.accountId || '', name: p.lead.displayName || '' } : null,
    category: p.projectCategory ? { id: p.projectCategory.id || '', name: p.projectCategory.name || '' } : null,
    description: p.description || '',
    avatarUrl: p.avatarUrls?.['48x48'] || '',
    url: origin && p.key ? `${origin}/browse/${p.key}` : ''
  };
}

async function fetchAllProjects() {
  const projects = [];
  let startAt = 0;
  const maxResults = 100;
  let isLast = false;

  do {
    const page = await jiraRequest(
      `/rest/api/3/project/search?expand=description,lead,category&maxResults=${maxResults}&startAt=${startAt}`
    );
    const values = page.values || [];
    projects.push(...values.map(normalizeProject));
    isLast = page.isLast !== false && values.length < maxResults;
    startAt += values.length;
    if (!values.length) break;
  } while (!isLast);

  return projects;
}

module.exports = async function jiraProjectsHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await getSessionUser(req);
    if (!user || user.active === false) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const projects = await fetchAllProjects();

    res.status(200).json({
      fetched_at: new Date().toISOString(),
      total: projects.length,
      projects
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
