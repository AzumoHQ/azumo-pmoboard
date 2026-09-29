p='index.html'
s=open(p,encoding='utf-8').read()
anchor='.pf-icon-btn:hover{color:var(--txt);border-color:var(--blue-lt)}\n'
assert s.count(anchor)==1
css=anchor+""".pf-icon-btn .ti::before{font-family:'Material Symbols Outlined';font-style:normal;font-weight:normal;font-size:1.05rem;line-height:1;font-variation-settings:'opsz' 24,'wght' 400,'GRAD' 0,'FILL' 0}
.pf-icon-btn .ti-chevron-up::before{content:'expand_less'}
.pf-icon-btn .ti-chevron-down::before{content:'expand_more'}
.pf-icon-btn .ti-trash::before{content:'delete'}
"""
s=s.replace(anchor,css)
open(p,'w',encoding='utf-8').write(s)
print('ok')
