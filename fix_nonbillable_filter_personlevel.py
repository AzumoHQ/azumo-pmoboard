#!/usr/bin/env python3
"""
fix_nonbillable_filter_personlevel.py

Bug: el checkbox Non-Billable en Harvest Hours Control devolvia lista
vacia. Causa: isNonBillable se derivaba de billingClasses, que mezcla
la etiqueta del epic con la de la persona, y solo agregaba 'Billable'
(nunca 'Non-Billable' explicito). Fix: trackear billing_type de
persona como flag explicito (personNonBillable) y usarlo directo.

Uso:
    python3 fix_nonbillable_filter_personlevel.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """      const isBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'billable';
      const isInternalOrBench = restrictedRoles.includes(role) ? (isCapacity && isBillablePerson) : isCapacity;"""
new_1 = """      const isBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'billable';
      const isNonBillablePerson = String(row.billing_type || '').trim().toLowerCase() === 'non-billable';
      const isInternalOrBench = restrictedRoles.includes(role) ? (isCapacity && isBillablePerson) : isCapacity;"""

assert content.count(old_1) == 1, "Patch 1: anchor no encontrado - revisar manualmente."
content = content.replace(old_1, new_1)

old_2 = """      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true, email:''};
      const rowEmail = String(row.email || '').trim();
      if(rowEmail && !map[person].email) map[person].email = rowEmail;
      map[person].clients.add(client);"""
new_2 = """      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true, email:'', personNonBillable:false};
      const rowEmail = String(row.email || '').trim();
      if(rowEmail && !map[person].email) map[person].email = rowEmail;
      if(isNonBillablePerson) map[person].personNonBillable = true;
      map[person].clients.add(client);"""

assert content.count(old_2) == 1, "Patch 2: anchor no encontrado - hace falta correr antes fix_harvest_email_fallback.py"
content = content.replace(old_2, new_2)

old_3 = """    freelance: value.freelance,
    email: value.email || ''
  }]));
}"""
new_3 = """    freelance: value.freelance,
    email: value.email || '',
    personNonBillable: Boolean(value.personNonBillable)
  }]));
}"""

assert content.count(old_3) == 1, "Patch 3: anchor no encontrado - revisar manualmente."
content = content.replace(old_3, new_3)

old_4 = """        billingClasses: jiraInfo?.billingClasses || [],
        pms: jiraInfo?.pms || [],
        freelance: Boolean(jiraInfo?.freelance),"""
new_4 = """        billingClasses: jiraInfo?.billingClasses || [],
        personNonBillable: Boolean(jiraInfo?.personNonBillable),
        pms: jiraInfo?.pms || [],
        freelance: Boolean(jiraInfo?.freelance),"""

assert content.count(old_4) == 1, "Patch 4: anchor no encontrado - revisar manualmente."
content = content.replace(old_4, new_4)

old_5 = """  const isFreelancer = Boolean(row.freelance);
  const bc = (row.billingClasses || []);
  const isBillable = !isFreelancer && bc.includes('Billable');
  const isNonBillable = !isFreelancer && bc.includes('Non-Billable') && !bc.includes('Billable');"""
new_5 = """  const isFreelancer = Boolean(row.freelance);
  const bc = (row.billingClasses || []);
  const isBillable = !isFreelancer && bc.includes('Billable');
  const isNonBillable = !isFreelancer && Boolean(row.personNonBillable);"""

assert content.count(old_5) == 1, "Patch 5: anchor no encontrado - revisar manualmente."
content = content.replace(old_5, new_5)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 5 patches aplicados a index.html")
