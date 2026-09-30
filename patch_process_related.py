#!/usr/bin/env python3
"""
Processes: "Related processes" (Previous / Next).
- Form: new section where you pick the process that comes before / after this one.
- Card: clickable chips "← Previous" / "Next →", shown in BOTH directions automatically.
- Diagram: the Start node says "← From: X", the End node says "→ Next: Y".
Toca: index.html y lib/data-store.js. Ejecutar UNA sola vez desde la raiz del repo.
"""
import pathlib

html = pathlib.Path("index.html").read_text(encoding="utf-8")
ds = pathlib.Path("lib/data-store.js").read_text(encoding="utf-8")

def apply_to(which, old, new, label):
    global html, ds
    src = html if which == "html" else ds
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    if which == "html": html = src
    else: ds = src
    print("OK:", label)

def H(old, new, label): apply_to("html", old, new, label)
def D(old, new, label): apply_to("ds", old, new, label)

# ------------------------------------------------------------ backend
D('''  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS roles_responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb`;''',
  '''  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS roles_responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb`;
  // Hand-offs between processes: [{id: '<process id>', relation: 'previous' | 'next'}]
  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS related_processes jsonb NOT NULL DEFAULT '[]'::jsonb`;''',
  "schema: related_processes")
D('''      trigger_event, roles_responsibilities, frequency,
      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    ORDER BY name ASC''',
  '''      trigger_event, roles_responsibilities, frequency, related_processes,
      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    ORDER BY name ASC''', "select list")
D('''      trigger_event, roles_responsibilities, frequency,
      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    WHERE id = ${id}''',
  '''      trigger_event, roles_responsibilities, frequency, related_processes,
      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    WHERE id = ${id}''', "select detail")
D('''      trigger_event, roles_responsibilities, frequency,
      last_reviewed, review_cadence_months, version
    )''',
  '''      trigger_event, roles_responsibilities, frequency, related_processes,
      last_reviewed, review_cadence_months, version
    )''', "insert columns")
D('''      ${process.frequency || null},''',
  '''      ${process.frequency || null},
      ${JSON.stringify(Array.isArray(process.related_processes) ? process.related_processes.filter(r => r && r.id && (r.relation === 'previous' || r.relation === 'next')) : [])}::jsonb,''',
  "insert values")
D('''      frequency = EXCLUDED.frequency,''',
  '''      frequency = EXCLUDED.frequency,
      related_processes = EXCLUDED.related_processes,''', "on conflict")

# ------------------------------------------------------------ CSS
H('''.pf-step-form-row{display:none;padding:.2rem .2rem .2rem 1.9rem}''',
  '''.pf-step-form-row{display:none;padding:.2rem .2rem .2rem 1.9rem}
.pf-related-row{display:flex;gap:.5rem;align-items:center;margin-bottom:.45rem}
.pf-related-row .pf-select{padding:.5rem .7rem;font-size:.84rem}
.pf-related-row .pf-rel-proc{flex:1;min-width:0}
.proc-related{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:0 0 .9rem;font-size:.8rem}
.proc-related .proc-rel-label{color:var(--muted);font-weight:700}
.proc-related a{cursor:pointer;color:var(--blue-lt);border:1px solid var(--brd);border-radius:999px;padding:1px 10px;text-decoration:none;background:var(--surf)}
.proc-related a:hover{background:var(--hov)}''',
  "CSS related")

# ------------------------------------------------------------ helpers (relations, navigation, form rows)
H('''function processBranchText(s, steps){''',
  '''// Related processes: each process stores only its own declarations ({id, relation}); the other
// direction is derived from the rest of the list, so declaring "A -> next: B" also shows A on B.
function processRelations(p, list){
  const all = list || [];
  const byId = new Map(all.map(x => [x.id, x]));
  const prev = new Map(), next = new Map();
  (p.related_processes || []).forEach(r => {
    const t = byId.get(r.id); if(!t) return;
    (r.relation === 'previous' ? prev : next).set(t.id, t.name);
  });
  all.forEach(q => {
    if(q.id === p.id) return;
    (q.related_processes || []).forEach(r => {
      if(r.id !== p.id) return;
      // q says "p is my next" => q is p's previous, and vice versa
      (r.relation === 'next' ? prev : next).set(q.id, q.name);
    });
  });
  return {
    prev: Array.from(prev, ([id, name]) => ({id, name})),
    next: Array.from(next, ([id, name]) => ({id, name}))
  };
}
function processRelatedHtml(rel){
  if(!rel.prev.length && !rel.next.length) return '';
  const chip = x => `<a data-pid="${esc(x.id)}" onclick="pfGoToProcess(this.dataset.pid)">${esc(x.name)}</a>`;
  return `<div class="proc-related">${rel.prev.length ? `<span class="proc-rel-label">← Previous</span>${rel.prev.map(chip).join('')}` : ''}${rel.next.length ? `<span class="proc-rel-label"${rel.prev.length ? ' style="margin-left:.6rem"' : ''}>Next →</span>${rel.next.map(chip).join('')}` : ''}</div>`;
}
function pfGoToProcess(id){
  const group = Array.from(document.querySelectorAll('.proc-group')).find(g => g.getAttribute('data-group') === id);
  if(!group) return;
  const d = group.querySelector('details'); if(d) d.open = true;
  group.scrollIntoView({behavior: 'smooth', block: 'start'});
}
window.pfGoToProcess = pfGoToProcess;
function pfRelatedRowHtml(r){
  const x = r || {};
  const cur = (document.getElementById('pfId')?.value || '').trim();
  const opts = (PROCESS_MANAGER_STATE.list || []).filter(p => p.id !== cur)
    .map(p => `<option value="${esc(p.id)}"${p.id === x.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<div class="pf-related-row">
    <select class="pf-select pf-rel-kind" onchange="pfRefreshDiagramPreview()">
      <option value="previous"${x.relation === 'previous' ? ' selected' : ''}>Previous process</option>
      <option value="next"${x.relation !== 'previous' ? ' selected' : ''}>Next process</option>
    </select>
    <select class="pf-select pf-rel-proc" onchange="pfRefreshDiagramPreview()"><option value="">— select a process —</option>${opts}</select>
    <button type="button" class="pf-icon-btn" title="Remove" onclick="this.closest('.pf-related-row').remove();pfRefreshDiagramPreview()"><i class="ti ti-trash"></i></button>
  </div>`;
}
function addProcessRelatedRow(r){
  document.getElementById('pfRelatedList').insertAdjacentHTML('beforeend', pfRelatedRowHtml(r));
}
window.addProcessRelatedRow = addProcessRelatedRow;
function pfCollectRelated(){
  return Array.from(document.querySelectorAll('#pfRelatedList .pf-related-row')).map(row => ({
    id: row.querySelector('.pf-rel-proc')?.value || '',
    relation: row.querySelector('.pf-rel-kind')?.value === 'previous' ? 'previous' : 'next'
  })).filter(r => r.id);
}
function pfRelatedNames(){
  const byId = new Map((PROCESS_MANAGER_STATE.list || []).map(p => [p.id, p.name]));
  const rel = pfCollectRelated();
  return {
    prevNames: rel.filter(r => r.relation === 'previous').map(r => byId.get(r.id)).filter(Boolean),
    nextNames: rel.filter(r => r.relation === 'next').map(r => byId.get(r.id)).filter(Boolean)
  };
}
function processBranchText(s, steps){''',
  "helpers")

# ------------------------------------------------------------ card
H('''        ${(p.roles_responsibilities || []).length ? `<div class="mc-sub" style="margin-bottom:.4rem">Roles &amp; responsibilities</div>''',
  '''        ${processRelatedHtml(processRelations(p, PROCESS_MANAGER_STATE.list))}
        ${(p.roles_responsibilities || []).length ? `<div class="mc-sub" style="margin-bottom:.4rem">Roles &amp; responsibilities</div>''',
  "card chips")
H('''      renderProcessDiagram(`procDiagram-${p.id}`, d.steps, d.lanes, {trigger: p.trigger_event || '', frequency: p.frequency || ''});''',
  '''      const rel = processRelations(p, PROCESS_MANAGER_STATE.list);
      renderProcessDiagram(`procDiagram-${p.id}`, d.steps, d.lanes, {trigger: p.trigger_event || '', frequency: p.frequency || '', prevNames: rel.prev.map(x => x.name), nextNames: rel.next.map(x => x.name)});''',
  "card diagram opts")

# ------------------------------------------------------------ diagram
H('''const W = labelW + 70 + plotW + 40;''',
  '''const W = labelW + 70 + plotW + 70;''', "diagram: room for hand-off label")
H('''        ${!isEnd && triggerText ? `<title>Trigger: ${esc(triggerText)}</title>` + wrapLabel(triggerText, 24, 2).map((line, li) =>
          `<text x="${x}" y="${y + 40 + li * 10}" font-size="8.5" text-anchor="middle" fill="var(--txt)">${li === 0 ? '⚡ ' : ''}${esc(line)}</text>`).join('') : ''}''',
  '''        ${!isEnd && triggerText ? `<title>Trigger: ${esc(triggerText)}</title>` + wrapLabel(triggerText, 24, 2).map((line, li) =>
          `<text x="${x}" y="${y + 40 + li * 10}" font-size="8.5" text-anchor="middle" fill="var(--txt)">${li === 0 ? '⚡ ' : ''}${esc(line)}</text>`).join('') : ''}
        ${!isEnd && (opts.prevNames || []).length ? wrapLabel('← From: ' + opts.prevNames.join(', '), 26, 2).map((line, li) =>
          `<text x="${x}" y="${y + 40 + (triggerText ? 22 : 0) + li * 10}" font-size="8.5" font-weight="700" text-anchor="middle" fill="var(--blue-lt)">${esc(line)}</text>`).join('') : ''}
        ${isEnd && (opts.nextNames || []).length ? wrapLabel('→ Next: ' + opts.nextNames.join(', '), 26, 2).map((line, li) =>
          `<text x="${x}" y="${y + 40 + li * 10}" font-size="8.5" font-weight="700" text-anchor="middle" fill="var(--blue-lt)">${esc(line)}</text>`).join('') : ''}''',
  "diagram: From / Next labels")
H('''  renderProcessDiagram('pfSwimlane',d.steps,d.lanes,{trigger:(document.getElementById('pfTrigger')?.value||''),frequency:(document.getElementById('pfFrequency')?.value||'')});''',
  '''  renderProcessDiagram('pfSwimlane',d.steps,d.lanes,Object.assign({trigger:(document.getElementById('pfTrigger')?.value||''),frequency:(document.getElementById('pfFrequency')?.value||'')},pfRelatedNames()));''',
  "preview opts")

# ------------------------------------------------------------ form
H('''        <div class="pf-section">
          <div class="pf-section-head"><h4>Steps</h4></div>''',
  '''        <div class="pf-section">
          <div class="pf-section-head"><h4>Related processes</h4></div>
          <p class="pf-field-hint" style="margin:.1rem 0 .5rem">Processes that hand off to this one, or that this one hands off to. The link shows up on both processes.</p>
          <div id="pfRelatedList"></div>
          <button type="button" class="pf-add-btn" onclick="addProcessRelatedRow()"><i class="ti ti-plus"></i> Add related process</button>
        </div>

        <div class="pf-section">
          <div class="pf-section-head"><h4>Steps</h4></div>''',
  "form section")
H('''  document.getElementById('pfRolesList').innerHTML = '';''',
  '''  document.getElementById('pfRolesList').innerHTML = '';
  document.getElementById('pfRelatedList').innerHTML = '';''',
  "open: reset")
H('''      (process.roles_responsibilities || []).forEach(r => addProcessRoleRow(r));''',
  '''      (process.roles_responsibilities || []).forEach(r => addProcessRoleRow(r));
      (process.related_processes || []).forEach(r => addProcessRelatedRow(r));''',
  "open: populate")
H('''    roles_responsibilities: pfCollectRoles(),''',
  '''    roles_responsibilities: pfCollectRoles(),
    related_processes: pfCollectRelated(),''',
  "save payload")

pathlib.Path("index.html").write_text(html, encoding="utf-8")
pathlib.Path("lib/data-store.js").write_text(ds, encoding="utf-8")
print("LISTO: index.html y lib/data-store.js actualizados")
