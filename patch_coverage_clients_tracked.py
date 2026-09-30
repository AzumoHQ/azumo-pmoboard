p='index.html'
s=open(p,encoding='utf-8').read()
a="""      `<div class="action-card"><div class="action-label">Clients tracked</div><div class="action-value">${total}</div><div class="action-copy">Active Jira clients + PSA coverage records</div></div>`,"""
assert s.count(a)==1
b="""      `<div class="action-card"><div class="action-label">Clients tracked</div><div class="action-value">${inProgressRows.length}</div><div class="action-copy">${esc(trackedBreakdown)}</div></div>`,"""
s=s.replace(a,b)
a2="""  const cards = document.getElementById('accountCoverageSummaryCards');
  if(cards){
    cards.innerHTML = ["""
assert s.count(a2)==1
b2="""  // Clients tracked = accounts whose PSA epic is In Progress. Rows that are not counted
  // (Backlog epics, clients with assignments but no epic) are explained in the card.
  const inProgressRows = rows0.filter(row => String(row.epic_status || '').toLowerCase() === 'in progress');
  const ipWithPeople = inProgressRows.filter(row => (row.assignees || []).length).length;
  const ipNoPeople = inProgressRows.length - ipWithPeople;
  const notCounted = rows0.length - inProgressRows.length;
  const trackedBreakdown = `In Progress epics · ${ipWithPeople} with people · ${ipNoPeople} without people` + (notCounted ? ` · ${notCounted} not counted (Backlog / no epic)` : '');
  const cards = document.getElementById('accountCoverageSummaryCards');
  if(cards){
    cards.innerHTML = ["""
s=s.replace(a2,b2)
a3="""  let rows = accountCoverageRows();
  const total = rows.length;"""
assert s.count(a3)==1
s=s.replace(a3,"""  let rows = accountCoverageRows();
  const rows0 = rows.slice();
  const total = rows.length;""")
open(p,'w',encoding='utf-8').write(s)
print('ok')
