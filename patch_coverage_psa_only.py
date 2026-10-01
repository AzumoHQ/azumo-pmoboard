# Account Coverage = exactly the PSA epics returned by the Jira JQL. One row per epic.
# No union with assignments, no name/prefix matching, no merging of epics, no Harvest.
def patch(path, pairs):
    s=open(path).read()
    for a,b,label in pairs:
        n=s.count(a); assert n==1, f"[{path}] {label}: {n} matches"
        s=s.replace(a,b)
    open(path,'w').write(s)
    return s

# Backend: stop merging epics that share a client name; keep every epic as its own row.
patch('lib/pmo-transform.js', [(
"""    const existing = byClient.get(row.client_key);
    if (!existing) {
      byClient.set(row.client_key, row);
      continue;
    }
""",
"""    // One row per PSA epic (keyed by issue key): never merge two epics' PM/CSM/TL.
    const existing = byClient.get(row.key || row.client_key);
    if (!existing) {
      byClient.set(row.key || row.client_key, row);
      continue;
    }
""","no merge")])

patch('index.html', [
("""<th>Accounts Coverage</th><th>Assignees</th><th>Link</th></tr></thead>""",
 """<th>Accounts Coverage</th><th>Link</th></tr></thead>""","thead"),
("""  let rows = accountCoverageRows();
  const rows0 = rows.slice();""",
"""  // Straight from the Jira PSA JQL: one row per epic, nothing derived from other sources.
  let rows = (latest.account_coverage || []).map(cov => ({
    client: cov.client || '',
    epic_status: cov.status || '',
    coverage: cov,
    missing: cov.missing || [],
    complete: Boolean(cov.complete),
    assignees: []
  })).sort((a,b) => a.client.localeCompare(b.client));
  const rows0 = rows.slice();""","rows from JQL"),
("""      row.coverage.tl_assigned,
      row.assignees.join(' ')
    ].join(' ')""","""      row.coverage.tl_assigned
    ].join(' ')""","search"),
("""  // Clients tracked = accounts whose PSA epic is In Progress. Rows that are not counted
  // (Backlog epics, clients with assignments but no epic) are explained in the card.
  const inProgressRows = rows0.filter(row => !isInternalCapacityRow(row) && String(row.epic_status || '').toLowerCase() === 'in progress');
  const ipWithPeople = inProgressRows.filter(row => (row.assignees || []).length).length;
  const ipNoPeople = inProgressRows.length - ipWithPeople;
  const internalRows = rows0.filter(row => isInternalCapacityRow(row)).length;
  const notCounted = rows0.length - inProgressRows.length - internalRows;
  const trackedBreakdown = `In Progress epics · ${ipWithPeople} with people · ${ipNoPeople} without people` + (notCounted ? ` · ${notCounted} not counted (Backlog / no epic)` : '') + (internalRows ? ` · ${internalRows} internal (Azumo) excluded` : '');""",
"""  // Clients tracked = PSA epics In Progress, as returned by the JQL.
  const inProgressRows = rows0.filter(row => String(row.epic_status || '').toLowerCase() === 'in progress');
  const otherCounts = [...countBy(rows0.filter(row => !inProgressRows.includes(row)), row => row.epic_status || 'No status').entries()]
    .map(([status, n]) => `${n} ${status}`).join(' · ');
  const trackedBreakdown = `PSA epics In Progress (Jira JQL)` + (otherCounts ? ` · not counted: ${otherCounts}` : '');""","cards"),
("""    const coverage = row.coverage;
    const assignees = row.assignees || [];
    return `<tr>""","""    const coverage = row.coverage;
    return `<tr>""","row vars"),
("""      <td class="ops-people">${esc(assignees.slice(0,8).join(', ') || '—')}${assignees.length > 8 ? ` +${assignees.length - 8} more` : ''}</td>
      <td>${accountCoverageLink(coverage, coverage.key ? 'Open in Jira' : 'Find in Jira')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" """,
"""      <td>${accountCoverageLink(coverage, 'Open in Jira')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" ""","row cells"),
])
import re
s=open('index.html').read()
open('/tmp/chk.js','w').write(max(re.findall(r'<script>(.*?)</script>',s,re.S),key=len))
print('OK')
