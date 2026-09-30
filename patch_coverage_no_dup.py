p='index.html'
s=open(p,encoding='utf-8').read()
a="""  scopedAccountCoverageRowsSource(latest.account_coverage || []).forEach(row => {
    const key = row.client_key || normalizeClientKey(row.client);
    if(!key) return;
    const existing = rowsByClient.get(key) || {client: row.client, assignees: [], positions: []};"""
assert s.count(a)==1
b="""  // Epics already claimed by an assignments client through the name-prefix fallback
  // (e.g. "Stovell" -> epic "Stovell Research") must not also appear as their own row.
  const claimedEpicKeys = new Set();
  [...rowsByClient.entries()].forEach(([k, r]) => {
    const ck = r.coverage && r.coverage.client_key;
    if(ck && ck !== k) claimedEpicKeys.add(ck);
  });
  scopedAccountCoverageRowsSource(latest.account_coverage || []).forEach(row => {
    const key = row.client_key || normalizeClientKey(row.client);
    if(!key) return;
    if(claimedEpicKeys.has(key) && !rowsByClient.has(key)) return;
    const existing = rowsByClient.get(key) || {client: row.client, assignees: [], positions: []};"""
s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
print('ok')
