#!/usr/bin/env python3
"""
Promueve a producción Accounts hub / My Portfolio / nueva navegación (vienen de patch_accounts_hub_preview.py).
Corre desde la raíz del repo, en la rama development:  python3 patch_accounts_hub_promote.py

Qué hace (mínimo, para no cambiar el código ya probado en preview):
  1) window.PMO_PREVIEW pasa a valer lo mismo que el tema nuevo (on), sin excluir los hosts de producción.
  2) myPortfolio y accountsHub salen de PREVIEW_ONLY_SECTIONS.
  3) Agrega la release v3.4 arriba de PMO_RELEASES (convención de promoción).
Si algún ancla no da exactamente 1 match, se frena sin escribir nada.
"""
import pathlib
PATH = pathlib.Path("index.html")
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    c = src.count(old)
    assert c == 1, f"[{label}] esperado 1 match, encontrados {c}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

apply(
"  // PREVIEW: Accounts hub / My Portfolio / nueva navegación. Solo con el tema nuevo y fuera de los hosts de producción.\n"
"  window.PMO_PREVIEW = on && ['pmoboard.it.azumo.com','pmoboard.vercel.app'].indexOf(location.hostname) === -1;\n",
"  // Accounts hub / My Portfolio / nueva navegación: en producción desde v3.4. El nombre PMO_PREVIEW se conserva\n"
"  // para no tocar el código probado; hoy significa 'tema nuevo activo' (con ?lf=0 vuelve la navegación anterior).\n"
"  window.PMO_PREVIEW = on;\n",
"PMO_PREVIEW ya no excluye producción")

apply(
"const PREVIEW_ONLY_SECTIONS = new Set(['dashboard','history','myPortfolio','accountsHub']);",
"const PREVIEW_ONLY_SECTIONS = new Set(['dashboard','history']);",
"myPortfolio y accountsHub fuera de PREVIEW_ONLY_SECTIONS")

apply(
"const PMO_RELEASES = [\n  {version:'3.3',",
"""const PMO_RELEASES = [
  {version:'3.4', date:'2026-10-08', title:'My Portfolio, Accounts hub and new navigation', items:[
    'Navigation — new structure: My Portfolio (home), Accounts (All accounts, Status reports, Coverage, New status report), People (Operating Views, Pending, Due Dates, Forecast, Bench, New assignment) and Operations (Overview, Billing, Trends, Harvest sections, New Searches). Process Portal and PMO QA stay as they were',
    'My Portfolio — new home: what needs attention (overdue or due status reports, assignments ending or past their end date, pending assignments, SOWs without terms), plus My accounts and My people. Administrators can choose which PM to view',
    'Accounts — one page per client with Overview, Team (Request assignment / Extend or change open the Jira AA form), Status reports, Terms (Tracking, Billing cycle and Type of project per SOW) and Documents (links to SOWs, Granola transcripts, reports and others). Clicking a client name anywhere in the board opens its account page',
    'Look & feel — single theme button (moon in light mode, sun in dark mode), centered menu arrows, aligned Overview cards, 34px controls, Settings menu above the content, search fields with an icon and equal-height menu items'
  ]},
  {version:'3.3',""",
"release v3.4")

PATH.write_text(src, encoding="utf-8")
print("Listo.")
