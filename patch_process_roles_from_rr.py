"""
Process Portal — step roles come ONLY from "Roles & responsibilities".
- The Role dropdown of each step lists only the roles written in the Roles & responsibilities section of the same form
  (no longer the whole company role catalog).
- The dropdowns refresh when a role is added, renamed (on leaving the field) or removed.
- A step whose saved role is not in Roles & responsibilities keeps it, marked "(not in Roles & responsibilities)",
  so editing an old process never loses data silently.
- With no roles defined yet, the dropdown says to add them first.
The Roles field itself still suggests the company roles (that is where roles get chosen). Owner / Co-responsible unchanged.
Run from the repo root:  python3 patch_process_roles_from_rr.py
"""
import pathlib

PATH = pathlib.Path("index.html")
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] expected 1 match, found {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

# R&R row: refresh step dropdowns when a role name is committed or the row is removed
apply(
"""    <input type="text" class="pf-rr-role" list="pfCompanyRoles" value="${esc(x.role || '')}" placeholder="Role">""",
"""    <input type="text" class="pf-rr-role" list="pfCompanyRoles" value="${esc(x.role || '')}" placeholder="Role" onchange="pfRefreshStepRoleOptions()">""",
"rr row: change refreshes steps")

apply(
"""    <button type="button" class="pf-icon-btn" title="Remove" onclick="this.closest('.pf-role-row').remove()"><i class="ti ti-trash"></i></button>""",
"""    <button type="button" class="pf-icon-btn" title="Remove" onclick="this.closest('.pf-role-row').remove();pfRefreshStepRoleOptions()"><i class="ti ti-trash"></i></button>""",
"rr row: remove refreshes steps")

# Company catalog loading no longer feeds the step dropdowns directly
apply(
"""      // Rebuild all role selects currently in the form
      document.querySelectorAll('.pf-step-role').forEach(sel => pfPopulateRoleSelect(sel));""",
"""      // Step dropdowns follow Roles & responsibilities; refresh so the people avatars resolve
      pfRefreshStepRoleOptions();""",
"catalog load: refresh only")

apply(
"""function pfPopulateRoleSelect(sel){
  const current = sel.value || sel.dataset.init || '';
  sel.innerHTML = '<option value="">— role —</option>' +
    PF_ROLES_PEOPLE.map(r => `<option value="${esc(r.role_name)}"${r.role_name === current ? ' selected' : ''}>${esc(r.role_name)}</option>`).join('') +
    (current && !PF_ROLES_PEOPLE.some(r => r.role_name === current) ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : '');
  pfUpdateRoleAvatar(sel);
}""",
"""// Roles typed in the "Roles & responsibilities" section (distinct, in order).
function pfRrRoles(){
  const seen = new Set(), out = [];
  document.querySelectorAll('#pfRolesList .pf-rr-role').forEach(i => {
    const v = (i.value || '').trim();
    if(v && !seen.has(v.toLowerCase())){ seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
}
// A step can only pick roles defined in Roles & responsibilities. A saved role that is no longer
// there stays selected (flagged) so nothing is lost silently.
function pfPopulateRoleSelect(sel){
  const current = sel.options.length ? sel.value : (sel.dataset.init || '');
  const roles = pfRrRoles();
  const known = roles.some(r => r.toLowerCase() === String(current).toLowerCase());
  const match = known ? roles.find(r => r.toLowerCase() === String(current).toLowerCase()) : current;
  sel.innerHTML = `<option value="">${roles.length ? '— role —' : '— add roles in Roles & responsibilities —'}</option>` +
    roles.map(r => `<option value="${esc(r)}"${r === match ? ' selected' : ''}>${esc(r)}</option>`).join('') +
    (current && !known ? `<option value="${esc(current)}" selected>${esc(current)} (not in Roles &amp; responsibilities)</option>` : '');
  sel.dataset.init = '';
  pfUpdateRoleAvatar(sel);
}
function pfRefreshStepRoleOptions(){
  document.querySelectorAll('#pfStepsList .pf-step-role').forEach(sel => pfPopulateRoleSelect(sel));
  if(typeof pfRefreshDiagramPreview === 'function') pfRefreshDiagramPreview();
}
window.pfRefreshStepRoleOptions = pfRefreshStepRoleOptions;""",
"step role dropdown: only R&R roles")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
