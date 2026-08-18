#!/usr/bin/env python3
"""
rename_bench_rate_label.py

El Glossary del reporte "Azumo - Capacity and Utilization Rates by Week"
define dos cosas distintas:
  Bench      = personas equivalentes (95 headcount * 4.5% = 4.275)
  Bench Rate = porcentaje de capacidad (ej Jul 20: 116.5h / 3840h = 3.03%)

La card que agregamos calcula lo primero (suma de bench%/100) pero se
llamaba "Bench Rate", que en el vocabulario de la empresa es lo segundo.
Mismo nombre, dos numeros, en dos lugares que mira leadership.

Se renombra a "Bench (FTE)". No se toca la key `bench_rate` para no
romper target/hover/metricValue.

Uso:
    python3 rename_bench_rate_label.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old = "  {key:'bench_rate',             label:'Bench Rate',                    unit:'',   color:'#EF4444', higherBetter:false, src:'Jira', target:'bench'},"
new = "  {key:'bench_rate',             label:'Bench (FTE)',                   unit:'',   color:'#EF4444', higherBetter:false, src:'Jira', target:'bench'},"

assert content.count(old) == 1, "Anchor no encontrado - revisar manualmente."
content = content.replace(old, new)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 1 patch aplicado a index.html")
