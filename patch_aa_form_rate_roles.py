#!/usr/bin/env python3
"""
Formulario New assignment (AA):
  1) Rate (hourly) pasa a ser obligatorio (front + validación del backend).
  2) Project Manager solo lista personas con rol PM del board; CSM solo rol CSM.
     - Se cruza por email (o por nombre si Jira no expone el email) contra los usuarios activos del board.
     - El PM/CSM por defecto del cliente (de la épica PSA) siempre queda disponible, aunque su rol no coincida.
     - Si no hay ningún usuario con ese rol, cae a la lista completa (nunca deja el desplegable vacío).
     - El backend valida lo mismo, no solo el front.
Corre desde la raíz del repo:  python3 patch_aa_form_rate_roles.py
Toca: index.html, api/assignments.js.  Si un ancla no da exactamente 1 match, se frena sin escribir nada.
"""
import pathlib
files = {p: pathlib.Path(p).read_text(encoding="utf-8") for p in ("index.html", "api/assignments.js")}

def apply(path, old, new, label):
    c = files[path].count(old)
    assert c == 1, f"[{label}] esperado 1 match en {path}, encontrados {c}"
    files[path] = files[path].replace(old, new, 1)
    print(f"OK: {label}")

# ───────────── api/assignments.js ─────────────
A = "api/assignments.js"
apply(A, "const { getSessionUser } = require('../lib/auth');",
"const { getSessionUser, listUsers } = require('../lib/auth');", "import listUsers")

apply(A, "const isIsoDate = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || ''));",
"""const isIsoDate = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || ''));

// Project Manager / CSM dropdowns: only people whose board role is PM / CSM.
// Matches the AA person (Jira) with the board user by email, or by name when Jira hides the email.
// The client's default PM/CSM (from its PSA epic) always stays valid. If a role has nobody, the list is not restricted.
const normName = (value) => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function getMetaWithRoles() {
  const meta = await getAaAssignmentMeta();
  let users = [];
  try {
    users = (await listUsers()).filter((u) => u.active !== false);
  } catch (error) {
    console.warn('assignments: board users not available, PM/CSM lists not restricted:', error.message);
    return { ...meta, roleLists: null };
  }
  const roleOf = (person) => {
    const byEmail = person.email && users.find((u) => String(u.email || '').toLowerCase() === person.email);
    const user = byEmail || users.find((u) => normName(u.name) === normName(person.name));
    return user ? String(user.role || '') : '';
  };
  const people = meta.people || [];
  const pm = people.filter((p) => roleOf(p) === 'PM').map((p) => p.accountId);
  const csm = people.filter((p) => roleOf(p) === 'CSM').map((p) => p.accountId);
  Object.values(meta.clientDefaults || {}).forEach((d) => {
    if (d.pmAccountId && pm.length && !pm.includes(d.pmAccountId)) pm.push(d.pmAccountId);
    if (d.csmAccountId && csm.length && !csm.includes(d.csmAccountId)) csm.push(d.csmAccountId);
  });
  return { ...meta, roleLists: { pm: pm.length ? pm : null, csm: csm.length ? csm : null } };
}""", "helper getMetaWithRoles")

apply(A, "    meta = await getAaAssignmentMeta();\n  } catch (error) {\n    console.error('assignments meta failed:', error.message);\n    res.status(502).json({ error: 'Could not read the AA form options from Jira' });\n    return;\n  }\n\n  const pick",
"    meta = await getMetaWithRoles();\n  } catch (error) {\n    console.error('assignments meta failed:', error.message);\n    res.status(502).json({ error: 'Could not read the AA form options from Jira' });\n    return;\n  }\n\n  const pick", "create usa meta con roles")

apply(A, "  if (!accountIds.has(a.pmAccountId)) errors.push('Project Manager is required');\n  if (a.csmAccountId && !accountIds.has(a.csmAccountId)) errors.push('Unknown CSM');",
"""  const roleLists = meta.roleLists || {};
  if (!accountIds.has(a.pmAccountId)) errors.push('Project Manager is required');
  else if (roleLists.pm && !roleLists.pm.includes(a.pmAccountId)) errors.push('Project Manager must be a user with the PM role');
  if (a.csmAccountId && !accountIds.has(a.csmAccountId)) errors.push('Unknown CSM');
  else if (a.csmAccountId && roleLists.csm && !roleLists.csm.includes(a.csmAccountId)) errors.push('CSM must be a user with the CSM role');""", "validar PM/CSM por rol")

apply(A, "  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) errors.push('Rate must be a positive number');",
"  if (rate === null || !Number.isFinite(rate) || rate <= 0) errors.push('Rate (hourly) is required and must be a positive number');", "rate obligatorio")

apply(A, "    res.status(200).json(await getAaAssignmentMeta());", "    res.status(200).json(await getMetaWithRoles());", "GET meta con roles")

# ───────────── index.html ─────────────
H = "index.html"
apply(H, """<label for="aaRate">Rate (hourly)</label>
        <input id="aaRate" type="number" min="0" step="0.01" placeholder="Optional"/>""",
"""<label for="aaRate">Rate (hourly) <span class="psa-req">*</span></label>
        <input id="aaRate" type="number" min="0.01" step="0.01" placeholder="e.g. 45" required/>""", "Rate obligatorio (campo)")

apply(H, "  const peopleHtml = placeholder => `<option value=\"\">${esc(placeholder)}</option>` + people.map(p => `<option value=\"${esc(p.accountId)}\">${esc(p.name)}</option>`).join('');",
"""  // PM / CSM: only the people with that board role (server sends roleLists; null = not restricted).
  const peopleHtml = (placeholder, allowed) => `<option value="">${esc(placeholder)}</option>` + people.filter(p => !allowed || allowed.includes(p.accountId)).map(p => `<option value="${esc(p.accountId)}">${esc(p.name)}</option>`).join('');""",
"peopleHtml con filtro por rol")

apply(H, "  document.getElementById('aaPm').innerHTML = peopleHtml('Select the PM…');\n  document.getElementById('aaCsm').innerHTML = peopleHtml('No CSM');",
"  document.getElementById('aaPm').innerHTML = peopleHtml('Select the PM…', aaAssignMeta?.roleLists?.pm);\n  document.getElementById('aaCsm').innerHTML = peopleHtml('No CSM', aaAssignMeta?.roleLists?.csm);",
"selects PM/CSM filtrados")

apply(H, "  if(!payload.pmAccountId) missing.push('Project Manager');\n  if(missing.length){",
"  if(!payload.pmAccountId) missing.push('Project Manager');\n  if(!(Number(payload.rate) > 0)) missing.push('Rate (hourly)');\n  if(missing.length){", "Rate obligatorio (validación front)")

for p, t in files.items():
    pathlib.Path(p).write_text(t, encoding="utf-8")
print("Listo.")
