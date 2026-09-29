p='index.html'
s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a
    s=s.replace(a,b)
rep("const PREVIEW_ONLY_SECTIONS = new Set(['processes','helpChangelog']);","const PREVIEW_ONLY_SECTIONS = new Set(['helpChangelog']);")
rep("  if(id === 'processes') return true;\n","  if(id === 'processes') return canSeePmoGroup(); // Process Portal: administrators only\n")
rep("{id:'processes', icon:'<i class=\"ti ti-route\"></i>', label:'Processes'}","{id:'processes', icon:'<i class=\"ti ti-route\"></i>', label:'Process Portal'}")
rep("      <h2>Processes</h2>\n      <div class=\"sec-tag\">Process Portal</div>","      <h2>Process Portal</h2>\n      <div class=\"sec-tag\">Admin only</div>")
open(p,'w',encoding='utf-8').write(s)
print('ok')
