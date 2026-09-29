import re
p='index.html'
s=open(p,encoding='utf-8').read()

# 1) CSS
a=s.index('.fc-cap-card{')
b=s.index('.fc-cap-bar-demand{')
b=s.index('\n',b)+1
assert s.count('.fc-cap-card{')==1
s=s[:a]+s[b:]

# 2) HTML card
a=s.index('    <div class="fc-cap-card">')
end='<div class="fc-cap-chart" id="forecastCapacityChart"></div>\n    </div>\n\n'
b=s.index(end,a)+len(end)
assert s.count('class="fc-cap-card"')==1
s=s[:a]+s[b:]

# 3) JS functions
a=s.index('// Demand vs. Capacity — org-wide 6-month view')
b=s.index('function renderForecast(){')
assert s.count('function renderForecast(){')==1
s=s[:a]+s[b:]

# 4) call
call='  renderForecastCapacity();\n'
assert s.count(call)==1
s=s.replace(call,'')

assert 'fc-cap' not in s and 'forecastCapacityChart' not in s and 'DemandCapacity' not in s and 'ForecastCapacity' not in s
open(p,'w',encoding='utf-8').write(s)
print('ok')
