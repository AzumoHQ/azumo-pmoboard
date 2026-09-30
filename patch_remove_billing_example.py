p='index.html'
s=open(p,encoding='utf-8').read()
# 1) button
a=s.index('        <button class="btn btn-ghost btn-sm" type="button" id="pfLoadExampleBtn"')
b=s.index('\n',a)+1
assert s.count('id="pfLoadExampleBtn"')==1
s=s[:a]+s[b:]
# 2) function + its comment + window export
a=s.index('// Reference example: the Billing Process exactly as documented today')
end='window.pfLoadBillingExample = pfLoadBillingExample;\n\n'
assert s.count(end)==1 and s.count('function pfLoadBillingExample(){')==1
b=s.index(end)+len(end)
s=s[:a]+s[b:]
assert 'pfLoadBillingExample' not in s and 'pfLoadExampleBtn' not in s
open(p,'w',encoding='utf-8').write(s)
print('ok')
