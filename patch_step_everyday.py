p='index.html'
s=open(p,encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a
    s=s.replace(a,b)
# label
rep("Sat:'Saturday', Sun:'Sunday'};","Sat:'Saturday', Sun:'Sunday', Daily:'Everyday'};")
# option in the step form
rep("""        <option value="">— day —</option>
        ${['Mon','Tue','Wed','Thu','Fri']""","""        <option value="">— day —</option>
        <option value="Daily"${s.day==='Daily'?' selected':''}>Everyday</option>
        ${['Mon','Tue','Wed','Thu','Fri']""")
# weekly calendar: Everyday lands on Mon-Fri
rep("""      if(step.day && byDay[step.day]) byDay[step.day].push({processName: source.processName, title: step.title});""",
"""      if(step.day === 'Daily') ['Mon','Tue','Wed','Thu','Fri'].forEach(k => { if(byDay[k]) byDay[k].push({processName: source.processName, title: step.title}); });
      else if(step.day && byDay[step.day]) byDay[step.day].push({processName: source.processName, title: step.title});""")
# process steps list text
rep("${s.day ? ', ' + esc(s.day) : ''})</span>","${s.day ? ', ' + esc(s.day === 'Daily' ? 'Everyday' : s.day) : ''})</span>")
open(p,'w',encoding='utf-8').write(s)
print('ok')
