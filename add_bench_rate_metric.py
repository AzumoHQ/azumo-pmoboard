#!/usr/bin/env python3
"""
add_bench_rate_metric.py

Agrega una nueva card "Bench Rate" al dashboard Overview del PMO Board.

Definicion: Bench Rate = suma de (bench% / 100) de cada persona en
bench_list. 100% -> 1, 75% -> 0.75, 25% -> 0.25. Es un headcount
equivalente de gente en banco.

Fuente: snapshot.bench_list[].assign

Uso:
    python3 add_bench_rate_metric.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """  {key:'bench',                  label:'Bench',                         unit:'',   color:'#EF4444', higherBetter:false, src:'Jira', target:'bench', hover:'bench'},
  {key:'pending_assignments',    label:'Pending Assignments',           unit:'',   color:'#F59E0B', higherBetter:false, src:'Jira'},"""
new_1 = """  {key:'bench',                  label:'Bench',                         unit:'',   color:'#EF4444', higherBetter:false, src:'Jira', target:'bench', hover:'bench'},
  {key:'bench_rate',             label:'Bench Rate',                    unit:'',   color:'#EF4444', higherBetter:false, src:'Jira', target:'bench'},
  {key:'pending_assignments',    label:'Pending Assignments',           unit:'',   color:'#F59E0B', higherBetter:false, src:'Jira'},"""

assert content.count(old_1) == 1, "Patch 1: anchor no encontrado - revisar index.html manualmente."
content = content.replace(old_1, new_1)

old_2 = """function metricValue(snapshot, key){
  const metrics = snapshot?.metrics || {};
  if(key === 'headcount_total'){
    return overviewPeopleCount(snapshot);
  }
  if(key === 'freelancers') return freelancerMetricRows(snapshot).length;
  return metrics[key];
}"""
new_2 = """function benchRateValue(snapshot = latest){
  const rows = Array.isArray(snapshot?.bench_list) ? snapshot.bench_list : [];
  const sum = rows.reduce((acc, row) => {
    const pct = Number(row.assign ?? row.avail ?? 0);
    return acc + (pct / 100);
  }, 0);
  return Math.round(sum * 100) / 100;
}
function metricValue(snapshot, key){
  const metrics = snapshot?.metrics || {};
  if(key === 'headcount_total'){
    return overviewPeopleCount(snapshot);
  }
  if(key === 'freelancers') return freelancerMetricRows(snapshot).length;
  if(key === 'bench_rate') return benchRateValue(snapshot);
  return metrics[key];
}"""

assert content.count(old_2) == 1, "Patch 2: anchor no encontrado - revisar index.html manualmente."
content = content.replace(old_2, new_2)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 2 patches aplicados a index.html")
