#!/usr/bin/env python3
"""
fix_nonbillable_by_exclusion.py

El campo billing_type en Jira nunca contiene el string literal
"Non-Billable" (confirmado: de 125 assignment rows, el unico valor
presente es "Billable"). Non-Billable se redefine por descarte:
cualquiera cuyo billing_type NO sea "Billable".

Uso:
    python3 fix_nonbillable_by_exclusion.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """      const isBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'billable';
      const isNonBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'non-billable';
      const isInternalOrBench = restrictedRoles.includes(role) ? (isCapacity && isBillablePerson) : isCapacity;"""
new_1 = """      const isBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'billable';
      const isNonBillablePerson = !isBillablePerson;
      const isInternalOrBench = restrictedRoles.includes(role) ? (isCapacity && isBillablePerson) : isCapacity;"""

assert content.count(old_1) == 1, "Anchor no encontrado - revisar manualmente."
content = content.replace(old_1, new_1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 1 patch aplicado a index.html")
