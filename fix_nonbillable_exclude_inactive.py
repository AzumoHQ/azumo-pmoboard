#!/usr/bin/env python3
"""
fix_nonbillable_exclude_inactive.py

Excluye personas con status "Inactive" en su epic personal de
non_billable_epic_assignments (ya no estan en la empresa).

Uso:
    python3 fix_nonbillable_exclude_inactive.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """  try{
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
  }"""
new_1 = """  try{
    (latest?.non_billable_epic_assignments || []).forEach(row => {
      const status = String(row.status || '').trim().toLowerCase();
      if(status === 'inactive') return;
      const person = normalizeIdentity(displayName(row));
      if(!person) return;
      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true, email:'', personNonBillable:false};
      map[person].personNonBillable = true;
      const rowEmail = String(row.email || '').trim();
      if(rowEmail && !map[person].email) map[person].email = rowEmail;
    });
  }catch(error){
    console.info("Harvest hours non-billable map unavailable:", error.message);
  }"""

assert content.count(old_1) == 1, "Anchor no encontrado - revisar manualmente."
content = content.replace(old_1, new_1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 1 patch aplicado a index.html")
