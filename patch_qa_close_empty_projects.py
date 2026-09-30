p='index.html'
s=open(p,encoding='utf-8').read()
a="""  const lastRefreshDate = String(PMO.last_refresh_at || PMO.last_refresh || '').slice(0,10);"""
a="""  const lastRefreshDate = String(PMO.last_refresh || PMO.last_refresh_at || '').slice(0,10);"""
assert s.count(a)==1
b="""  // Active PSA epic (In Progress / Backlog) but nobody assigned to that client in Jira AA:
  // the project should be closed in Jira and Harvest.
  try{
    accountCoverageRows()
      .filter(row => !(row.assignees || []).length)
      .forEach(row => {
        const cov = row.coverage || {};
        const epicKey = cov.key || '';
        add({
          id:`qa:close-empty-project:${normalizeClientKey(row.client)}`,
          severity:'warning',
          category:'coverage',
          title:`No people assigned: close ${row.client} in Jira and Harvest`,
          description:`${row.client} has an active PSA epic${cov.status ? ` (${cov.status})` : ''} but no one is assigned to it in Jira. Close the epic in Jira and archive the project in Harvest.`,
          client: row.client,
          key: epicKey,
          action_url: epicKey ? jiraIssueUrl(epicKey) : '',
          source:'Jira PSA Epic Account Coverage vs. Jira Assignments',
          rows:[{client: row.client, key: epicKey, status: cov.status || '', reason:'No people assigned — close in Jira and Harvest'}]
        });
      });
  }catch(err){ console.warn('close-empty-project check failed', err); }

"""
s=s.replace(a,b+a)
open(p,'w',encoding='utf-8').write(s)
print('ok')
