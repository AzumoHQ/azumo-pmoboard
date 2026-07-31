#!/usr/bin/env python3
"""
fix_harvest_email_fallback.py

Bug real (no era un alias faltante para Kristopher Simbeck):
1) harvestHoursClientMap() nunca devolvia el campo email por persona,
   asi que jiraInfo.email siempre era ''.
2) harvestByEmail se usaba en runHarvestHoursReport() pero nunca se
   definia en ningun lado del archivo.

Resultado: el fallback por email nunca funciono para nadie.

Uso:
    python3 fix_harvest_email_fallback.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """      const person = normalizeIdentity(displayName(row));
      if(!person || !client) return;
      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true};
      map[person].clients.add(client);"""
new_1 = """      const person = normalizeIdentity(displayName(row));
      if(!person || !client) return;
      if(!map[person]) map[person] = {clients:new Set(), billingClasses:new Set(), pms:new Set(), freelance:false, hasNonBillableOnly:true, email:''};
      const rowEmail = String(row.email || '').trim();
      if(rowEmail && !map[person].email) map[person].email = rowEmail;
      map[person].clients.add(client);"""

assert content.count(old_1) == 1, "Patch 1: anchor no encontrado - revisar index.html manualmente."
content = content.replace(old_1, new_1)

old_2 = """  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, {
    clients: [...value.clients].sort(),
    billingClasses: [...value.billingClasses].sort(),
    pms: [...value.pms].sort(),
    freelance: value.freelance
  }]));
}"""
new_2 = """  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, {
    clients: [...value.clients].sort(),
    billingClasses: [...value.billingClasses].sort(),
    pms: [...value.pms].sort(),
    freelance: value.freelance,
    email: value.email || ''
  }]));
}"""

assert content.count(old_2) == 1, "Patch 2: anchor no encontrado - revisar index.html manualmente."
content = content.replace(old_2, new_2)

old_3 = """    const buildProjects = (harv) => {"""
new_3 = """    // Harvest data indexed by email (lowercased) - fallback cuando los nombres no matchean
    const harvestByEmail = {};
    Object.values(harvestByNorm).forEach(harv => {
      if(harv.email) harvestByEmail[harv.email.toLowerCase()] = harv;
    });

    const buildProjects = (harv) => {"""

assert content.count(old_3) == 1, "Patch 3: anchor no encontrado - revisar index.html manualmente."
content = content.replace(old_3, new_3)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 3 patches aplicados a index.html")
