"""
Processes — la frecuencia es del PROCESO, no de cada paso.

  - Nuevo campo de proceso "Frequency": Recurring (weekly / every two weeks / monthly /
    quarterly) o Event-driven (on demand). Columna nueva pmo.processes.frequency.
  - Se elimina el checkbox "Eventual" de cada paso.
  - Día/horario por paso sólo se muestran si el proceso es weekly o biweekly
    (o si todavía no tiene frecuencia definida, para no esconder datos viejos).
  - El nodo Start muestra la frecuencia; las cards muestran un badge; el calendario
    semanal sólo incluye procesos semanales/quincenales.

REQUIERE haber aplicado antes patch_process_trigger_start.py.
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
FILES = {"html": ROOT / "index.html", "ds": ROOT / "lib" / "data-store.js"}
SRC = {k: p.read_text(encoding="utf-8") for k, p in FILES.items()}

def apply(key, old, new, label, n=1):
    count = SRC[key].count(old)
    assert count == n, f"[{label}] esperado {n} match, encontrados {count}"
    SRC[key] = SRC[key].replace(old, new)
    print(f"OK: {label}")

assert "wrapLabel" in SRC["html"], "Falta aplicar primero patch_process_trigger_start.py"

# ════════ BACKEND ════════
apply("ds",
"""  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS trigger_event text`;""",
"""  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS trigger_event text`;
  // Process-level cadence: weekly | biweekly | monthly | quarterly | on_demand
  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS frequency text`;""",
"ds: columna frequency")
apply("ds",
"""      trigger_event, roles_responsibilities,
      last_reviewed, review_cadence_months, version, updated_at""",
"""      trigger_event, roles_responsibilities, frequency,
      last_reviewed, review_cadence_months, version, updated_at""",
"ds: SELECTs", n=2)
apply("ds",
"""      trigger_event, roles_responsibilities,
      last_reviewed, review_cadence_months, version
    )""",
"""      trigger_event, roles_responsibilities, frequency,
      last_reviewed, review_cadence_months, version
    )""",
"ds: upsert columnas")
apply("ds",
"""      ${JSON.stringify(Array.isArray(process.roles_responsibilities) ? process.roles_responsibilities : [])}::jsonb,""",
"""      ${JSON.stringify(Array.isArray(process.roles_responsibilities) ? process.roles_responsibilities : [])}::jsonb,
      ${process.frequency || null},""",
"ds: upsert value")
apply("ds",
"""      roles_responsibilities = EXCLUDED.roles_responsibilities,""",
"""      roles_responsibilities = EXCLUDED.roles_responsibilities,
      frequency = EXCLUDED.frequency,""",
"ds: on conflict")

# ════════ CSS ════════
apply("html",
""".pf-textarea{background:var(--surf);""",
"""#pfStepsList.pf-no-schedule .pf-step-schedule-row{display:none!important}
.pf-select{background:var(--surf);border:1px solid var(--brd);color:var(--txt);border-radius:10px;padding:.7rem .8rem;font:inherit}
.pf-textarea{background:var(--surf);""",
"css: ocultar horario cuando el proceso no es semanal")

# ════════ HELPERS ════════
apply("html",
"""function renderProcessDiagram(containerId, steps, lanes = PROCESS_LANES, opts = {}){""",
"""// Process-level frequency. Day/time per step only makes sense for weekly-type cadences;
// an empty value means "not defined yet" and keeps showing the schedule so old data stays visible.
const PROCESS_FREQUENCY_LABEL = {
  weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly',
  quarterly: 'Quarterly', on_demand: 'On demand'
};
function processFrequencyHasSchedule(freq){ return !freq || freq === 'weekly' || freq === 'biweekly'; }
function renderProcessDiagram(containerId, steps, lanes = PROCESS_LANES, opts = {}){""",
"helpers de frecuencia")

apply("html",
"""        <text x="${x}" y="${y + 28}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--muted)">${isEnd ? 'End' : 'Start'}</text>""",
"""        <text x="${x}" y="${y + 28}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--muted)">${isEnd ? 'End' : (PROCESS_FREQUENCY_LABEL[opts.frequency] ? 'Start · ' + PROCESS_FREQUENCY_LABEL[opts.frequency] : 'Start')}</text>""",
"start node: muestra frecuencia")

# ════════ FORM HTML ════════
apply("html",
"""            <div class="auth-field pf-field-full">
              <label for="pfTrigger">Trigger</label>""",
"""            <div class="auth-field pf-field-full">
              <label for="pfFrequency">Frequency</label>
              <span class="pf-field-hint">Recurring processes run on a fixed cadence — for weekly ones each step can have a day and time. Event-driven processes run whenever the trigger happens.</span>
              <select id="pfFrequency" class="pf-select" onchange="pfApplyFrequency()">
                <option value="">— select —</option>
                <optgroup label="Recurring">
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every two weeks</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </optgroup>
                <optgroup label="Event-driven">
                  <option value="on_demand">On demand (when the trigger happens)</option>
                </optgroup>
              </select>
            </div>
            <div class="auth-field pf-field-full">
              <label for="pfTrigger">Trigger</label>""",
"form: campo Frequency")

apply("html",
"""      <label class="pf-step-eventual-lbl" title="Occasional step — no fixed day or time">
        <input type="checkbox" class="pf-step-is-eventual"${s.is_eventual?' checked':''} onchange="pfToggleEventual(this)"> Eventual
      </label>
""",
"",
"step row: sin checkbox Eventual")

apply("html",
"""    <div class="pf-step-schedule-row"${s.is_eventual?' style=\\"display:none\\"':''}>""",
"""    <div class="pf-step-schedule-row">""",
"step row: horario controlado por la frecuencia del proceso")

apply("html",
"""function pfToggleEventual(chk){
  const row=chk.closest('.pf-step-compact');if(!row)return;
  const sched=row.querySelector('.pf-step-schedule-row');if(!sched)return;
  sched.style.display=chk.checked?'none':'flex';
  if(chk.checked){
    const d=sched.querySelector('.pf-step-day');if(d)d.value='';
    const t=sched.querySelector('.pf-step-time');if(t)t.value='';
  }
}
window.pfToggleEventual=pfToggleEventual;""",
"""function pfApplyFrequency(){
  const freq = document.getElementById('pfFrequency')?.value || '';
  const list = document.getElementById('pfStepsList');
  if(list) list.classList.toggle('pf-no-schedule', !processFrequencyHasSchedule(freq));
  pfRefreshDiagramPreview();
}
window.pfApplyFrequency=pfApplyFrequency;""",
"pfToggleEventual -> pfApplyFrequency")

apply("html",
"""  return Array.from(document.querySelectorAll('#pfStepsList .pf-step-compact')).map((row,i)=>{
    const val=sel=>(row.querySelector(sel)?.value||'').trim();""",
"""  const withSchedule = processFrequencyHasSchedule(document.getElementById('pfFrequency')?.value || '');
  return Array.from(document.querySelectorAll('#pfStepsList .pf-step-compact')).map((row,i)=>{
    const val=sel=>(row.querySelector(sel)?.value||'').trim();""",
"pfCollectSteps: lee frecuencia")

apply("html",
"""      day:val('.pf-step-day')||null,""",
"""      day:withSchedule?(val('.pf-step-day')||null):null,""",
"pfCollectSteps: day sólo si aplica")
apply("html",
"""is_eventual:!!(row.querySelector('.pf-step-is-eventual')?.checked),time_of_day:val('.pf-step-time')||null,""",
"""time_of_day:withSchedule?(val('.pf-step-time')||null):null,""",
"pfCollectSteps: sin is_eventual")

# Diagram preview + cards: pasar frecuencia
apply("html",
"""{trigger:(document.getElementById('pfTrigger')?.value||'')});""",
"""{trigger:(document.getElementById('pfTrigger')?.value||''),frequency:(document.getElementById('pfFrequency')?.value||'')});""",
"preview: pasa frecuencia")
apply("html",
"""{trigger: p.trigger_event || ''});""",
"""{trigger: p.trigger_event || '', frequency: p.frequency || ''});""",
"cards: pasan frecuencia")

# open / populate / save / example
apply("html",
"""  document.getElementById('pfTrigger').value = '';""",
"""  document.getElementById('pfTrigger').value = '';
  document.getElementById('pfFrequency').value = '';""",
"open: reset frecuencia")
apply("html",
"""      document.getElementById('pfTrigger').value = process.trigger_event || '';""",
"""      document.getElementById('pfTrigger').value = process.trigger_event || '';
      document.getElementById('pfFrequency').value = process.frequency || '';""",
"populate: frecuencia")
apply("html",
"""    if(!document.getElementById('pfRolesList').children.length) addProcessRoleRow();
    openModal();""",
"""    if(!document.getElementById('pfRolesList').children.length) addProcessRoleRow();
    pfApplyFrequency();
    openModal();""",
"open: aplica frecuencia")
apply("html",
"""    trigger_event: document.getElementById('pfTrigger').value.trim() || null,""",
"""    trigger_event: document.getElementById('pfTrigger').value.trim() || null,
    frequency: document.getElementById('pfFrequency').value || null,""",
"save: payload frecuencia")
apply("html",
"""  document.getElementById('pfTrigger').value = 'End of the working week""",
"""  document.getElementById('pfFrequency').value = 'weekly';
  pfApplyFrequency();
  document.getElementById('pfTrigger').value = 'End of the working week""",
"billing example: weekly")
apply("html",
"""has_docs: s.icon === 'document', is_eventual: !s.day""",
"""has_docs: s.icon === 'document'""",
"billing example: sin is_eventual")

# Portal: card badge + calendario
apply("html",
"""          ${p.owner_role ? `<span class="badge badge-blue">Owner: ${esc(p.owner_role)}</span>` : ''}""",
"""          ${PROCESS_FREQUENCY_LABEL[p.frequency] ? `<span class="badge badge-blue">↻ ${esc(PROCESS_FREQUENCY_LABEL[p.frequency])}</span>` : ''}
          ${p.owner_role ? `<span class="badge badge-blue">Owner: ${esc(p.owner_role)}</span>` : ''}""",
"card: badge de frecuencia")
apply("html",
"""  try{ boardSources = (PROCESS_MANAGER_STATE.list || []).map(p => ({processName: p.name, steps: p.steps || []})); }catch(e){ boardSources = []; }""",
"""  try{ boardSources = (PROCESS_MANAGER_STATE.list || []).filter(p => processFrequencyHasSchedule(p.frequency)).map(p => ({processName: p.name, steps: p.steps || []})); }catch(e){ boardSources = []; }""",
"calendario: sólo procesos semanales")

for k, p in FILES.items():
    p.write_text(SRC[k], encoding="utf-8")
print("\nEscrito OK.")
