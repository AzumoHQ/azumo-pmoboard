#!/usr/bin/env python3
"""
fix_nonbillable_read_hidden_list.py

pmo-refresh.py descarta a proposito las asignaciones Non-Billable
antes de mandarlas al frontend (van a una lista aparte,
non_billable_epic_assignments, que ya viene en el JSON pero nunca
se leia). Este patch lee esa lista SOLO para marcar
personNonBillable=true e identidad/email -- nunca cliente/proyecto,
para no exponer lo que se oculta a proposito.

Uso:
    python3 fix_nonbillable_read_hidden_list.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """  }catch(error){
    console.info("Harvest hours Jira client map unavailable:", error.message);
  }
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, {
    clients: [...value.clients].sort(),
    billingClasses: [...value.billingClasses].sort(),
    pms: [...value.pms].sort(),
    freelance: value.freelance,
    email: value.email || '',
    personNonBillable: Boolean(value.personNonBillable)
  }]));
}"""
new_1 = """  }catch(error){
    console.info("Harvest hours Jira client map unavailable:", error.message);
  }
  try{
    (latest?.non_billable_epic_assignments || []).forEach(row => {
      const person = normalizeIdentity(displayName(row));
      if(!person) return;
      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true, email:'', personNonBillable:false};
      map[person].personNonBillable = true;
      const rowEmail = String(row.email || '').trim();
      if(rowEmail && !map[person].email) map[person].email = rowEmail;
    });
  }catch(error){
    console.info("Harvest hours non-billable map unavailable:", error.message);
  }
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, {
    clients: [...value.clients].sort(),
    billingClasses: [...value.billingClasses].sort(),
    pms: [...value.pms].sort(),
    freelance: value.freelance,
    email: value.email || '',
    personNonBillable: Boolean(value.personNonBillable)
  }]));
}"""

assert content.count(old_1) == 1, "Anchor no encontrado - revisar manualmente."
content = content.replace(old_1, new_1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 1 patch aplicado a index.html")
