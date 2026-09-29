"""
Processes — elimina la card "Billing Process" escrita a mano en el HTML (no se podía editar).

  - Se borra la card fija del portal y su render especial.
  - Todos los procesos pasan a venir de /api/processes: se pueden editar y borrar.
    Si ya existe un proceso 'billing' guardado en la base (seed), ahora SÍ se muestra.
  - El calendario semanal y la franja de salud se calculan desde los procesos guardados
    (last_reviewed / review_cadence_months) y se ocultan si no hay ninguno.
  - Cada card muestra su chip de salud (Reviewed / Review due / Review overdue).
  - Se conserva BILLING_PROCESS_STEPS: lo usa "Load Billing example" para crear Billing como
    proceso real y editable.
"""
import pathlib

PATH = pathlib.Path(__file__).parent / "index.html"
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

def cut_between(start, end, replacement, label):
    """Reemplaza desde `start` (inclusive) hasta `end` (exclusive)."""
    global src
    assert src.count(start) == 1, f"[{label}] start: {src.count(start)} matches"
    i = src.index(start)
    j = src.index(end, i)
    assert src.count(end) >= 1 and j > i, f"[{label}] end no encontrado"
    src = src[:i] + replacement + src[j:]
    print(f"OK: {label}")

# 1. Card fija de Billing fuera del HTML
cut_between(
'      <div class="proc-group" data-group="billing">',
'      <div id="processManagerGroup"></div>',
'',
"html: card Billing hardcodeada")

# 2. Render especial del diagrama de Billing
apply(
"""  if(document.getElementById('billingProcessDiagram')){
    ensureProcessLoadedFromApi('billing');
    renderProcessDiagram('billingProcessDiagram', processStepsFor('billing', BILLING_PROCESS_STEPS));
  }
""",
"",
"js: render especial de Billing")

# 3. El proceso 'billing' guardado en la base ya no se esconde
apply(
"""    .then(json => (json.processes || []).filter(p => p.id !== 'billing'))""",
"""    .then(json => json.processes || [])""",
"js: no filtrar 'billing' de la API")

# 4. Calendario: sólo procesos guardados; se oculta si no hay pasos con día
apply(
"""const PROCESS_WEEK_SOURCES = [
  {processId: 'billing', processName: 'Billing Process', steps: BILLING_PROCESS_STEPS},
];""",
"""const PROCESS_WEEK_SOURCES = []; // all processes now come from /api/processes""",
"js: calendario sin fuente hardcodeada")

apply(
"""  // Empty days collapse to a narrow column so the eye goes straight to the days that matter.""",
"""  // Nothing scheduled anywhere -> hide the whole calendar instead of showing seven empty boxes.
  const calWrap = grid.closest('.proc-week-cal');
  if(calWrap) calWrap.style.display = WEEK_DAYS.some(d => byDay[d.key].length) ? '' : 'none';
  // Empty days collapse to a narrow column so the eye goes straight to the days that matter.""",
"js: ocultar calendario vacío")

# 5. Franja de salud desde procesos guardados
apply(
"""const PROCESS_HEALTH_META = {
  billing: {lastReviewed: '2026-07-06', reviewCadenceMonths: 6, owner: 'Pablo Baio'},
};""",
"""// Health is computed from each saved process's last_reviewed + review_cadence_months.""",
"js: sin PROCESS_HEALTH_META")
apply(
"""  const entries = Object.entries(PROCESS_HEALTH_META);""",
"""  const entries = (PROCESS_MANAGER_STATE.list || []).map(p => [p.id, {lastReviewed: p.last_reviewed, reviewCadenceMonths: p.review_cadence_months}]);""",
"js: salud desde procesos guardados")

# 6. Lista: contador real, estado vacío y refresco de salud
apply(
"""      ? '<div style="font-size:.78rem;color:var(--muted);padding:.6rem .2rem 1rem">No other processes documented yet.</div>'
      : '';""",
"""      ? '<div style="font-size:.82rem;color:var(--muted);padding:1.2rem .4rem;text-align:center">No processes documented yet. Use <b>New process</b> to document the first one.</div>'
      : '<div style="font-size:.82rem;color:var(--muted);padding:1.2rem .4rem;text-align:center">No processes documented yet.</div>';
    const emptyCount = document.getElementById('processListCount');
    if(emptyCount) emptyCount.textContent = '0 processes';
    renderProcessWeekCalendar();
    renderProcessHealthStrip();""",
"js: estado vacío")
apply(
"""const n = 1 + PROCESS_MANAGER_STATE.list.length;""",
"""const n = PROCESS_MANAGER_STATE.list.length;""",
"js: contador sin +1")
apply(
"""  renderProcessWeekCalendar();
  PROCESS_MANAGER_STATE.list.forEach(p => {""",
"""  renderProcessWeekCalendar();
  renderProcessHealthStrip();
  PROCESS_MANAGER_STATE.list.forEach(p => {""",
"js: refrescar salud al renderizar lista")

# 7. Chip de salud en cada card
apply(
"""<span class="chip badge-green" style="margin-left:8px">Documented</span></span><span class="qa-status ok">v${esc(p.version || '1.00')}</span></summary>""",
"""<span class="chip badge-green" style="margin-left:8px">Documented</span> ${(() => { const h = computeProcessHealth({lastReviewed: p.last_reviewed, reviewCadenceMonths: p.review_cadence_months}); return `<span class="chip ${h.cls}" style="margin-left:6px" title="${p.last_reviewed ? 'Last reviewed ' + esc(p.last_reviewed) + ' · every ' + esc(String(p.review_cadence_months ?? 6)) + ' mo' : 'No review on record'}">${h.label}</span>`; })()}</span><span class="qa-status ok">v${esc(p.version || '1.00')}</span></summary>""",
"js: chip de salud por card")

# 8. "No processes match that search" sólo cuando hay procesos y el filtro los oculta a todos
apply(
"""  if(empty) empty.style.display = anyVisible ? 'none' : 'block';""",
"""  if(empty) empty.style.display = (anyVisible || !PROCESS_MANAGER_STATE.list.length) ? 'none' : 'block';""",
"js: mensaje de búsqueda sólo si hay procesos")

PATH.write_text(src, encoding="utf-8")
print("\nEscrito OK.")
