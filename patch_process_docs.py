"""
Processes — limpieza UX del portal + formulario "New process" alineado a documentación de procesos.

Formulario:
  - Category: se oculta (queda como input hidden para no romper datos existentes).
  - Nueva sección "Definition": Objective, Scope y Trigger (evento que dispara el proceso).
  - Nueva sección "Roles & responsibilities": filas rol + responsabilidades.
  - Steps: el nombre del paso tiene su propia línea + campo de detalle; los controles pasan abajo.
  - Hints de Owner / Co-responsible corregidos (estaban cruzados).
Portal:
  - Header "Billing & Ops 1" -> "Documented processes · N", ubicado sobre la lista.
  - Weekly cadence: días sin pasos se colapsan; incluye pasos de procesos creados desde el board.
  - Health strip: oculta contadores en cero.
  - Pill "Goal & methodology" sin mayúsculas forzadas.
Backend (lib/data-store.js):
  - Columnas nuevas en pmo.processes: trigger_event text, roles_responsibilities jsonb.
    ADD COLUMN IF NOT EXISTS: aditivo, no afecta al código de producción.
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

def replace_between(key, start, end, new, label):
    s = SRC[key]
    assert s.count(start) == 1, f"[{label}] start: {s.count(start)} matches"
    i = s.index(start)
    j = s.find(end, i)
    assert j != -1, f"[{label}] end no encontrado"
    assert s.count(end) == 1 or s.find(end, j + 1) == -1 or True
    SRC[key] = s[:i] + new + s[j:]
    print(f"OK: {label}")

# ════════════════════════ BACKEND ════════════════════════
apply("ds",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS time_of_day text`;""",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS time_of_day text`;
  // Process documentation fields: the event that starts the process, and who does what.
  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS trigger_event text`;
  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS roles_responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb`;""",
"ds: columnas trigger_event + roles_responsibilities")

apply("ds",
"""    SELECT id, name, category, owner_role, corresponsable_role, objective, scope,
      last_reviewed, review_cadence_months, version, updated_at""",
"""    SELECT id, name, category, owner_role, corresponsable_role, objective, scope,
      trigger_event, roles_responsibilities,
      last_reviewed, review_cadence_months, version, updated_at""",
"ds: SELECTs incluyen campos nuevos", n=2)

apply("ds",
"""      id, name, category, owner_role, corresponsable_role, objective, scope,
      last_reviewed, review_cadence_months, version
    )""",
"""      id, name, category, owner_role, corresponsable_role, objective, scope,
      trigger_event, roles_responsibilities,
      last_reviewed, review_cadence_months, version
    )""",
"ds: upsert columnas")

apply("ds",
"""      ${process.scope || null},
      ${process.last_reviewed || null},""",
"""      ${process.scope || null},
      ${process.trigger_event || null},
      ${JSON.stringify(Array.isArray(process.roles_responsibilities) ? process.roles_responsibilities : [])}::jsonb,
      ${process.last_reviewed || null},""",
"ds: upsert values")

apply("ds",
"""      scope = EXCLUDED.scope,
      last_reviewed = EXCLUDED.last_reviewed,""",
"""      scope = EXCLUDED.scope,
      trigger_event = EXCLUDED.trigger_event,
      roles_responsibilities = EXCLUDED.roles_responsibilities,
      last_reviewed = EXCLUDED.last_reviewed,""",
"ds: upsert on conflict")

# ════════════════════════ CSS ════════════════════════
apply("html",
""".proc-week-cal-empty{font-size:.7rem;color:var(--muted);font-style:italic}""",
""".proc-week-cal-empty{font-size:.7rem;color:var(--muted);font-style:italic}
.proc-week-cal-day.empty{background:transparent;border-style:dashed;padding:.5rem .2rem;text-align:center;min-height:0}
.proc-week-cal-day.empty .proc-week-cal-day-label{margin:0;opacity:.7}
.proc-list-head{display:flex;align-items:baseline;gap:10px;margin-top:1.4rem}
.proc-list-count{font-size:.78rem;font-weight:500;color:var(--muted)}
.proc-framework-pill{text-transform:none!important;font-weight:700!important;letter-spacing:0}
#pfStepsList .pf-step-compact{flex-direction:column;align-items:stretch;gap:.35rem;padding:.55rem .7rem .6rem;margin-bottom:.5rem}
#pfStepsList .pf-step-line1{display:flex;align-items:center;gap:.5rem}
#pfStepsList .pf-step-line2{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding-left:1.9rem}
#pfStepsList .pf-step-compact .pf-step-title{flex:1 1 auto;font-size:.9rem;font-weight:600;border-bottom:1px dashed var(--brd)}
#pfStepsList .pf-step-compact .pf-step-role{max-width:none;min-width:120px}
#pfStepsList .pf-step-desc{margin-left:1.9rem;width:calc(100% - 1.9rem);box-sizing:border-box;background:var(--surf);border:1px solid var(--brd);color:var(--txt);border-radius:8px;padding:.4rem .55rem;font:inherit;font-size:.78rem;line-height:1.4;resize:vertical;min-height:2.2rem}
.pf-step-desc::placeholder{color:var(--muted)}
#pfStepsList .pf-step-compact .pf-step-auto-row,#pfStepsList .pf-step-compact .pf-step-schedule-row{padding-left:1.9rem}
.pf-role-row{display:grid;grid-template-columns:160px 1fr 26px;gap:8px;align-items:start;margin-bottom:.5rem}
.pf-role-row input,.pf-role-row textarea{background:var(--surf);border:1px solid var(--brd);color:var(--txt);border-radius:8px;padding:.5rem .65rem;font:inherit;font-size:.8rem;box-sizing:border-box;width:100%}
.pf-role-row input{font-weight:600}
.pf-role-row textarea{resize:vertical;min-height:2.4rem;line-height:1.4}
.pf-textarea{background:var(--surf);border:1px solid var(--brd);color:var(--txt);border-radius:10px;padding:.6rem .7rem;font:inherit;resize:vertical}""",
"css: calendario colapsado, header lista, step en 2 líneas, roles")

# ════════════════════════ PORTAL HTML ════════════════════════
apply("html",
"""<span class="qa-status" style="background:rgba(107,143,191,.14);color:var(--muted)">Goal &amp; methodology</span>""",
"""<span class="qa-status proc-framework-pill" style="background:rgba(107,143,191,.14);color:var(--muted)">Goal &amp; methodology</span>""",
"portal: pill sin uppercase")

apply("html",
"""    <div class="tbl-head" style="border:1px solid var(--brd);border-radius:var(--r) var(--r) 0 0;border-bottom:0">
      <h3><i class="ti ti-receipt-2"></i> Billing &amp; Ops <span class="badge badge-blue">1</span></h3>
    </div>

    <div class="proc-week-cal">
      <div class="proc-week-cal-head"><i class="ti ti-calendar-time"></i> Weekly cadence — where each process lands, Monday to Sunday</div>
      <div class="proc-week-cal-note">Fixed-day steps from every documented process.</div>
      <div class="proc-week-cal-grid" id="processWeekCalendarGrid"></div>
    </div>

    <div class="proc-health-strip" id="processHealthStrip"></div>
""",
"""    <div class="proc-week-cal">
      <div class="proc-week-cal-head"><i class="ti ti-calendar-time"></i> Weekly cadence</div>
      <div class="proc-week-cal-note">Fixed-day steps across all documented processes. Days with nothing scheduled are collapsed.</div>
      <div class="proc-week-cal-grid" id="processWeekCalendarGrid"></div>
    </div>

    <div class="proc-health-strip" id="processHealthStrip" title="Last review vs. review cadence"></div>

    <div class="tbl-head proc-list-head" style="border:1px solid var(--brd);border-radius:var(--r) var(--r) 0 0;border-bottom:0">
      <h3><i class="ti ti-list-details"></i> Documented processes</h3>
      <span class="proc-list-count" id="processListCount"></span>
    </div>
""",
"portal: header de lista reubicado y sin categoría")

# Health strip: sin ceros
apply("html",
"""  strip.innerHTML = `
    <span><i class="proc-health-dot green"></i> ${counts.green} healthy</span>
    <span><i class="proc-health-dot yellow"></i> ${counts.yellow} review due</span>
    <span><i class="proc-health-dot red"></i> ${counts.red} overdue / never reviewed</span>
    <span style="margin-left:auto;color:var(--muted)">Last review vs. review cadence</span>
  `;""",
"""  // Only show the buckets that have something in them — zeros are noise.
  const parts = [];
  if(counts.green) parts.push(`<span><i class="proc-health-dot green"></i> ${counts.green} healthy</span>`);
  if(counts.yellow) parts.push(`<span><i class="proc-health-dot yellow"></i> ${counts.yellow} review due</span>`);
  if(counts.red) parts.push(`<span><i class="proc-health-dot red"></i> ${counts.red} overdue / never reviewed</span>`);
  if(!counts.yellow && !counts.red && counts.green) parts.push(`<span style="color:var(--muted)">All reviews up to date</span>`);
  strip.innerHTML = parts.join('');
  strip.style.display = parts.length ? '' : 'none';""",
"portal: health strip sin ceros")

# Calendario: colapsar días vacíos + sumar procesos del board
apply("html",
"""  const byDay = Object.fromEntries(WEEK_DAYS.map(d => [d.key, []]));
  PROCESS_WEEK_SOURCES.forEach(source => {""",
"""  const byDay = Object.fromEntries(WEEK_DAYS.map(d => [d.key, []]));
  // Processes created from the board (/api/processes) also land on the calendar.
  let boardSources = [];
  try{ boardSources = (PROCESS_MANAGER_STATE.list || []).map(p => ({processName: p.name, steps: p.steps || []})); }catch(e){ boardSources = []; }
  [...PROCESS_WEEK_SOURCES, ...boardSources].forEach(source => {""",
"calendario: incluye procesos del board")

apply("html",
"""  grid.innerHTML = WEEK_DAYS.map(d => {
    const items = byDay[d.key];
    const body = items.length
      ? items.map(it => `<div class="proc-week-cal-item"><b>${esc(it.processName)}</b>${esc(it.title)}</div>`).join('')
      : `<div class="proc-week-cal-empty">—</div>`;
    return `<div class="proc-week-cal-day ${d.key === todayKey ? 'today' : ''}">""",
"""  // Empty days collapse to a narrow column so the eye goes straight to the days that matter.
  grid.style.gridTemplateColumns = WEEK_DAYS.map(d => byDay[d.key].length ? 'minmax(130px,1fr)' : '46px').join(' ');
  grid.innerHTML = WEEK_DAYS.map(d => {
    const items = byDay[d.key];
    if(!items.length){
      return `<div class="proc-week-cal-day empty ${d.key === todayKey ? 'today' : ''}" title="No fixed-day steps on ${d.label}"><div class="proc-week-cal-day-label">${d.label}</div></div>`;
    }
    const body = items.map(it => `<div class="proc-week-cal-item"><b>${esc(it.processName)}</b>${esc(it.title)}</div>`).join('');
    return `<div class="proc-week-cal-day ${d.key === todayKey ? 'today' : ''}">""",
"calendario: días vacíos colapsados")

# Lista: contador + refrescar calendario
apply("html",
"""  host.innerHTML = PROCESS_MANAGER_STATE.list.map(renderProcessManagerCard).join('');""",
"""  host.innerHTML = PROCESS_MANAGER_STATE.list.map(renderProcessManagerCard).join('');
  const countEl = document.getElementById('processListCount');
  if(countEl){ const n = 1 + PROCESS_MANAGER_STATE.list.length; countEl.textContent = `${n} process${n === 1 ? '' : 'es'}`; }
  renderProcessWeekCalendar();""",
"lista: contador y calendario")

# Card: sin categoría, con trigger y roles
apply("html",
"""          <span class="badge badge-blue">${esc(processCategoryLabel(p.category))}</span>
          ${p.owner_role ? `<span class="badge badge-blue">Owner: ${esc(p.owner_role)}</span>` : ''}""",
"""          ${p.owner_role ? `<span class="badge badge-blue">Owner: ${esc(p.owner_role)}</span>` : ''}""",
"card: sin badge de categoría")

apply("html",
"""        ${p.scope ? `<p style="margin:0 0 .9rem;font-size:.82rem;color:var(--muted);line-height:1.5"><b style="color:var(--txt)">Scope:</b> ${esc(p.scope)}</p>` : ''}""",
"""        ${p.scope ? `<p style="margin:0 0 .5rem;font-size:.82rem;color:var(--muted);line-height:1.5"><b style="color:var(--txt)">Scope:</b> ${esc(p.scope)}</p>` : ''}
        ${p.trigger_event ? `<p style="margin:0 0 .9rem;font-size:.82rem;color:var(--muted);line-height:1.5"><b style="color:var(--txt)">Trigger:</b> ${esc(p.trigger_event)}</p>` : ''}
        ${(p.roles_responsibilities || []).length ? `<div class="mc-sub" style="margin-bottom:.4rem">Roles &amp; responsibilities</div><dl style="margin:0 0 .9rem;display:grid;grid-template-columns:max-content 1fr;gap:.35rem .9rem;font-size:.8rem;line-height:1.45">${(p.roles_responsibilities || []).map(r => `<dt style="font-weight:700;color:var(--txt)">${esc(r.role || '')}</dt><dd style="margin:0;color:var(--txt)">${esc(r.responsibilities || '')}</dd>`).join('')}</dl>` : ''}""",
"card: trigger + roles")

apply("html",
"""  const searchText = [p.name, p.category, p.owner_role, p.corresponsable_role, p.objective].filter(Boolean).join(' ').toLowerCase();""",
"""  const searchText = [p.name, p.owner_role, p.corresponsable_role, p.objective, p.trigger_event, ...(p.roles_responsibilities || []).map(r => r.role)].filter(Boolean).join(' ').toLowerCase();""",
"card: search text")

# ════════════════════════ FORM HTML ════════════════════════
replace_between("html",
"""        <div class="pf-section" style="padding-top:0;border-top:none;margin-top:0">
          <div class="pf-section-head"><h4>Basics</h4></div>""",
"""        <div class="pf-section">
          <div class="pf-section-head"><h4>Steps</h4></div>""",
"""        <div class="pf-section" style="padding-top:0;border-top:none;margin-top:0">
          <div class="pf-section-head"><h4>Basics</h4></div>
          <div class="pf-grid">
            <div class="auth-field pf-field-full">
              <label for="pfName">Name</label>
              <input type="text" id="pfName" placeholder="New Project Process">
            </div>
            <div class="auth-field">
              <label for="pfId">ID (slug)</label>
              <input type="text" id="pfId" placeholder="new-project-process">
            </div>
            <div class="auth-field">
              <label for="pfVersion">Version</label>
              <input type="text" id="pfVersion" value="1.00">
            </div>
            <div class="auth-field">
              <label for="pfOwnerRole">Owner role</label>
              <input type="text" id="pfOwnerRole" placeholder="PMO" list="pfCompanyRoles">
              <span class="pf-field-hint">Accountable for the process end to end.</span>
            </div>
            <div class="auth-field">
              <label for="pfCorresponsableRole">Co-responsible role</label>
              <input type="text" id="pfCorresponsableRole" placeholder="PM" list="pfCompanyRoles">
              <datalist id="pfCompanyRoles"></datalist>
              <span class="pf-field-hint">Shares accountability and backs up the owner.</span>
            </div>
            <div class="auth-field">
              <label for="pfLastReviewed">Last reviewed</label>
              <input type="date" id="pfLastReviewed">
            </div>
            <!-- Category hidden for now: kept so existing processes keep their value on save -->
            <input type="hidden" id="pfCategory" value="other">
          </div>
        </div>

        <div class="pf-section">
          <div class="pf-section-head"><h4>Definition</h4></div>
          <div class="pf-grid">
            <div class="auth-field pf-field-full">
              <label for="pfObjective">Objective</label>
              <span class="pf-field-hint">What is this process for, and what is the expected final result?</span>
              <textarea id="pfObjective" rows="2" class="pf-textarea"></textarea>
            </div>
            <div class="auth-field pf-field-full">
              <label for="pfScope">Scope</label>
              <span class="pf-field-hint">Where does it begin and end? What does it include — and what does it not?</span>
              <textarea id="pfScope" rows="2" class="pf-textarea"></textarea>
            </div>
            <div class="auth-field pf-field-full">
              <label for="pfTrigger">Trigger</label>
              <span class="pf-field-hint">The event that starts the process — e.g. "SOW signed", "New hire accepts the offer", "Every Friday EOD".</span>
              <textarea id="pfTrigger" rows="2" class="pf-textarea"></textarea>
            </div>
          </div>
        </div>

        <div class="pf-section">
          <div class="pf-section-head"><h4>Roles &amp; responsibilities</h4></div>
          <p class="pf-field-hint" style="margin:.1rem 0 .5rem">Who takes part in the process and what each role is accountable for at each stage.</p>
          <div id="pfRolesList"></div>
          <button type="button" class="pf-add-btn" onclick="addProcessRoleRow()"><i class="ti ti-plus"></i> Add role</button>
        </div>

""",
"form: Basics + Definition (trigger) + Roles & responsibilities, sin Category")

apply("html",
"""<p class="pf-field-hint" style="margin:.1rem 0 .5rem">Describe in detail each step of the process in sequential order. Include role, type, automation, and schedule when applicable.</p>""",
"""<p class="pf-field-hint" style="margin:.1rem 0 .5rem">One row per step, in order. Name the action, describe what happens, then set the role, type and schedule.</p>""",
"form: hint de steps")

# ════════════════════════ FORM JS ════════════════════════
# Step row en 2 líneas + detalle
replace_between("html",
"""  return `<div class="pf-step-compact" data-desc="${esc(s.desc||'')}" data-icon="${esc(s.icon||'')}" data-returns="${esc(s.returns_to!=null?String(s.returns_to):'')}">""",
"""    <div class="pf-step-auto-row\"""",
"""  return `<div class="pf-step-compact" data-icon="${esc(s.icon||'')}" data-returns="${esc(s.returns_to!=null?String(s.returns_to):'')}">
    <div class="pf-step-line1">
      <span class="pf-step-num">?</span>
      <input type="text" class="pf-step-title" value="${esc(s.title||'')}" placeholder="Step name — e.g. Create the project in Harvest">
      <div class="pf-row-actions">
        <button type="button" class="pf-icon-btn" title="Move up" onclick="pfMoveRow(this,-1)"><i class="ti ti-chevron-up"></i></button>
        <button type="button" class="pf-icon-btn" title="Move down" onclick="pfMoveRow(this,1)"><i class="ti ti-chevron-down"></i></button>
        <button type="button" class="pf-icon-btn" title="Remove" onclick="this.closest('.pf-step-compact').remove();pfRenumberSteps();pfRefreshDiagramPreview()"><i class="ti ti-trash"></i></button>
      </div>
    </div>
    <textarea class="pf-step-desc" rows="2" placeholder="What happens here? Inputs, output, tool used, done criteria…">${esc(s.desc||'')}</textarea>
    <div class="pf-step-line2">
      <select class="pf-step-role" data-init="${esc(s.role||'')}">
        <option value="">— role —</option>${s.role?`<option value="${esc(s.role)}" selected>${esc(s.role)}</option>`:''}
      </select>
      <div class="pf-step-type-mini">
        ${types.map(t=>`<button type="button" class="pf-nt-mini-btn${nt===t.v?' active':''}" data-nt="${t.v}" onclick="pfMiniSetNt(this)">${t.l}</button>`).join('')}
      </div>
      <input type="hidden" class="pf-step-nodetype" value="${esc(nt)}">
      <label class="pf-step-docs-lbl" title="Requires documentation">
        <input type="checkbox" class="pf-step-has-docs"${s.has_docs?' checked':''}> Doc
      </label>
      <label class="pf-step-auto-lbl" title="Has an automation">
        <input type="checkbox" class="pf-step-has-auto"${s.has_auto?' checked':''} onchange="pfToggleAutoRow(this)"> ⚡ Automated
      </label>
      <label class="pf-step-eventual-lbl" title="Occasional step — no fixed day or time">
        <input type="checkbox" class="pf-step-is-eventual"${s.is_eventual?' checked':''} onchange="pfToggleEventual(this)"> Eventual
      </label>
    </div>
""",
"form: step row en dos líneas + detalle")

apply("html",
"""      desc:row.dataset.desc||'',""",
"""      desc:(row.querySelector('.pf-step-desc')?.value||'').trim(),""",
"pfCollectSteps: desc desde textarea")

# Roles rows
apply("html",
"""function addProcessValidationRow(text){""",
"""function pfRoleRowHtml(r){
  const x = r || {};
  return `<div class="pf-role-row">
    <input type="text" class="pf-rr-role" list="pfCompanyRoles" value="${esc(x.role || '')}" placeholder="Role — e.g. CSM">
    <textarea class="pf-rr-resp" rows="2" placeholder="Responsibilities — e.g. Owns the client relationship; joins the kickoff…">${esc(x.responsibilities || '')}</textarea>
    <button type="button" class="pf-icon-btn" title="Remove" onclick="this.closest('.pf-role-row').remove()"><i class="ti ti-trash"></i></button>
  </div>`;
}
function addProcessRoleRow(r){
  document.getElementById('pfRolesList').insertAdjacentHTML('beforeend', pfRoleRowHtml(r));
}
window.addProcessRoleRow = addProcessRoleRow;
function pfCollectRoles(){
  return Array.from(document.querySelectorAll('#pfRolesList .pf-role-row')).map(row => ({
    role: (row.querySelector('.pf-rr-role')?.value || '').trim(),
    responsibilities: (row.querySelector('.pf-rr-resp')?.value || '').trim()
  })).filter(r => r.role || r.responsibilities);
}
function addProcessValidationRow(text){""",
"form: roles rows helpers")

# Reset al abrir
apply("html",
"""  document.getElementById('pfScope').value = '';
  document.getElementById('pfLastReviewed').value = '';
  document.getElementById('pfVersion').value = '1.00';
  document.getElementById('pfStepsList').innerHTML = '';""",
"""  document.getElementById('pfScope').value = '';
  document.getElementById('pfTrigger').value = '';
  document.getElementById('pfRolesList').innerHTML = '';
  document.getElementById('pfLastReviewed').value = '';
  document.getElementById('pfVersion').value = '1.00';
  document.getElementById('pfStepsList').innerHTML = '';""",
"openProcessForm: reset trigger/roles")

# Populate al editar
apply("html",
"""      document.getElementById('pfScope').value = process.scope || '';
      document.getElementById('pfLastReviewed').value = process.last_reviewed || '';""",
"""      document.getElementById('pfScope').value = process.scope || '';
      document.getElementById('pfTrigger').value = process.trigger_event || '';
      (process.roles_responsibilities || []).forEach(r => addProcessRoleRow(r));
      document.getElementById('pfLastReviewed').value = process.last_reviewed || '';""",
"openProcessForm: populate trigger/roles")

apply("html",
"""    if(!document.getElementById('pfStepsList').children.length) addProcessStepRow();
    openModal();""",
"""    if(!document.getElementById('pfStepsList').children.length) addProcessStepRow();
    if(!document.getElementById('pfRolesList').children.length) addProcessRoleRow();
    openModal();""",
"openProcessForm: una fila de rol vacía por defecto")

# Payload
apply("html",
"""    scope: document.getElementById('pfScope').value.trim() || null,
    last_reviewed: document.getElementById('pfLastReviewed').value || null,""",
"""    scope: document.getElementById('pfScope').value.trim() || null,
    trigger_event: document.getElementById('pfTrigger').value.trim() || null,
    roles_responsibilities: pfCollectRoles(),
    last_reviewed: document.getElementById('pfLastReviewed').value || null,""",
"saveProcessForm: payload trigger/roles")

# Billing example con trigger y roles
apply("html",
"""  document.getElementById('pfScope').value = 'Time registration - Invoice issuance';
  document.getElementById('pfStepsList').innerHTML = '';""",
"""  document.getElementById('pfScope').value = 'Time registration - Invoice issuance';
  document.getElementById('pfTrigger').value = 'End of the working week — every Friday, team members register the week\\'s hours in Harvest.';
  document.getElementById('pfRolesList').innerHTML = '';
  [
    {role:'Team', responsibilities:'Register all hours in Harvest by Friday EOD, with the right project and task.'},
    {role:'PM', responsibilities:'Review the team\\'s entries on Friday and request adjustments when something is off.'},
    {role:'CSM', responsibilities:'Weekly review on Monday; flags client-side issues before invoicing.'},
    {role:'PMO / COS', responsibilities:'Final time register review on Tuesday and sign-off for invoicing.'}
  ].forEach(r => addProcessRoleRow(r));
  document.getElementById('pfStepsList').innerHTML = '';""",
"billing example: trigger + roles")

for k, p in FILES.items():
    p.write_text(SRC[k], encoding="utf-8")
print("\nEscrito OK.")
