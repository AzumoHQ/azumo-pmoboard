# Account Coverage: PM/CSM/TL status comes only from Jira (no Harvest roster check).
def patch(path, pairs):
    s=open(path).read()
    for a,b,label in pairs:
        assert s.count(a)==1, f"[{path}] {label}: {s.count(a)} matches"
        s=s.replace(a,b)
    open(path,'w').write(s)

patch('lib/pmo-transform.js', [
("""function fieldEmail(value) {""",
"""// Jira user fields carry an "active" flag; false means the account is deactivated in Jira.
function fieldActive(value) {
  if (!value || typeof value !== 'object') return true;
  return value.active !== false;
}

function fieldEmail(value) {""","fieldActive helper"),
("""  const tlEmail = fieldEmail(fields[CF_COVERAGE_TL]) || fieldEmail(fields[CF_COVERAGE_TL_FALLBACK]);
""",
"""  const tlEmail = fieldEmail(fields[CF_COVERAGE_TL]) || fieldEmail(fields[CF_COVERAGE_TL_FALLBACK]);
  const pmActive = fields[CF_COVERAGE_PM] ? fieldActive(fields[CF_COVERAGE_PM]) : fieldActive(fields[CF_PROJECT_MANAGER]);
  const csmActive = fieldActive(fields[CF_COVERAGE_CSM]);
  const tlActive = fields[CF_COVERAGE_TL] ? fieldActive(fields[CF_COVERAGE_TL]) : fieldActive(fields[CF_COVERAGE_TL_FALLBACK]);
""","active values"),
("""    tl_assigned_email: tlEmail || '',
""","""    tl_assigned_email: tlEmail || '',
    pm_assigned_active: pmActive,
    csm_assigned_active: csmActive,
    tl_assigned_active: tlActive,
""","row fields"),
("""      pm_assigned: existing.pm_assigned || row.pm_assigned,
      csm_assigned: existing.csm_assigned || row.csm_assigned,
      tl_assigned: existing.tl_assigned || row.tl_assigned
    });""",
"""      pm_assigned: existing.pm_assigned || row.pm_assigned,
      csm_assigned: existing.csm_assigned || row.csm_assigned,
      tl_assigned: existing.tl_assigned || row.tl_assigned,
      pm_assigned_active: existing.pm_assigned ? existing.pm_assigned_active : row.pm_assigned_active,
      csm_assigned_active: existing.csm_assigned ? existing.csm_assigned_active : row.csm_assigned_active,
      tl_assigned_active: existing.tl_assigned ? existing.tl_assigned_active : row.tl_assigned_active
    });""","merge"),
])

patch('index.html', [
("""function coverageBadge(value){
  if(!value) return '<span class="badge badge-red">Missing</span>';
  const roster = knownActiveRoster();
  if(roster.size > 0 && !roster.has(normalizeIdentity(value))){
    return `<span class="badge badge-red" title="${esc(value)} — not in Harvest active users">Missing</span>`;
  }""",
"""// Account Coverage uses Jira only: a PM/CSM/TL is inactive only when their Jira account is deactivated.
function coverageBadge(value, active){
  if(!value) return '<span class="badge badge-red">Missing</span>';
  if(active === false){
    return `<span class="badge badge-red" title="${esc(value)} — inactive Jira user">Inactive</span>`;
  }""","badge"),
("""  const inactiveRows = roster.size ? (latest.account_coverage||[]).filter(row =>
    [row.pm_assigned, row.csm_assigned, row.tl_assigned].some(v => v && !roster.has(normalizeIdentity(v)))
  ) : [];""",
"""  const inactiveRows = (latest.account_coverage||[]).filter(row =>
    ['pm','csm','tl'].some(r => row[`${r}_assigned`] && row[`${r}_assigned_active`] === false)
  );""","inactive rows"),
])
s=open('index.html').read()
for r in ['pm','csm','tl']:
    a=f"coverageBadge(coverage.{r}_assigned)"
    assert s.count(a)==2, r
    s=s.replace(a,f"coverageBadge(coverage.{r}_assigned, coverage.{r}_assigned_active)")
s=s.replace('PM/CSM/TL not found in current Jira data','PM/CSM/TL deactivated in Jira')
open('index.html','w').write(s)
print('OK')

s=open('index.html').read()
a="""function activePmName(name){
  if(!name) return '';
  const roster = knownActiveRoster();
  if(roster.size && !roster.has(normalizeIdentity(name))) return '';
  return name;
}"""
if s.count(a)==1:
    s=s.replace(a,\"\"\"// PM names come straight from Jira; no Harvest roster filtering.
function activePmName(name){
  return name || '';
}\"\"\")
    open('index.html','w').write(s)
