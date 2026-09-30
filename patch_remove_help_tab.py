p='index.html'
s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a
    s=s.replace(a,b)
rep("""    {id:'pmoActionCenter', icon:'<i class="ti ti-alert-triangle"></i>', label:'PMO QA', count: qaCount},
    {id:'helpChangelog', icon:'<i class="ti ti-help-circle"></i>', label:'Help'}
""","""    {id:'pmoActionCenter', icon:'<i class="ti ti-alert-triangle"></i>', label:'PMO QA', count: qaCount}
""")
rep("  if(id === 'helpChangelog') return true;\n","  if(id === 'helpChangelog') return false; // Help tab removed\n")
open(p,'w',encoding='utf-8').write(s)
print('ok')
