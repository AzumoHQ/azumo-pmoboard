#!/usr/bin/env python3
"""
Processes: (1) arregla los botones Edit/Delete de las cards (comillas dobles rompian el onclick)
           (2) agrega IF (Si / No) a los pasos de tipo Decision, con destino a cualquier paso o "End of process"
Toca: index.html y lib/data-store.js. Ejecutar UNA sola vez desde la raiz del repo.
"""
import pathlib

def load(p):
    return pathlib.Path(p).read_text(encoding="utf-8")

html = load("index.html")
ds = load("lib/data-store.js")

def apply_to(name, old, new, label):
    global html, ds
    src = html if name == "html" else ds
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    if name == "html": html = src
    else: ds = src
    print("OK:", label)

def H(old, new, label): apply_to("html", old, new, label)
def D(old, new, label): apply_to("ds", old, new, label)

# ---------------------------------------------------------------- 1. Edit / Delete
H('''onclick="openProcessForm(${jsArg(p.id)})"><i class="ti ti-pencil"></i> Edit</button>''',
  '''data-pid="${esc(p.id)}" onclick="openProcessForm(this.dataset.pid)"><i class="ti ti-pencil"></i> Edit</button>''',
  "Edit button: data-attribute")
H('''onclick="confirmDeleteProcess(${jsArg(p.id)},${jsArg(p.name)})"><i class="ti ti-trash"></i> Delete</button>''',
  '''data-pid="${esc(p.id)}" data-pname="${esc(p.name)}" onclick="confirmDeleteProcess(this.dataset.pid,this.dataset.pname)"><i class="ti ti-trash"></i> Delete</button>''',
  "Delete button: data-attribute")

# ---------------------------------------------------------------- 2. Backend
D('''  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS form_url text`;''',
  '''  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS form_url text`;
  // IF / branching on decision steps: yes_to_step = where "Yes" goes, returns_to_step = where "No" goes.
  // NULL = next step, 0 = end of process.
  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS yes_to_step integer`;''',
  "schema: yes_to_step")
D('''automation_tool, automation_url, node_type, icon, time_of_day, form_url
    FROM ${q('process_steps')}''',
  '''automation_tool, automation_url, node_type, icon, time_of_day, form_url, yes_to_step
    FROM ${q('process_steps')}''', "select yes_to_step")
D('''      returns_to: s.returns_to_step || null,''',
  '''      returns_to: s.returns_to_step ?? null,
      yes_to: s.yes_to_step ?? null,''', "map yes_to/returns_to")
D('''        node_type, icon, time_of_day, form_url
      )''', '''        node_type, icon, time_of_day, form_url, yes_to_step
      )''', "insert columns")
D('''        ${step.form_url || null}
      )''', '''        ${step.form_url || null}, ${step.yes_to ?? null}
      )''', "insert values yes_to")
D('''${step.related_doc_url || null}, ${step.returns_to || null}, ${step.day || null},''',
  '''${step.related_doc_url || null}, ${step.returns_to ?? null}, ${step.day || null},''',
  "insert returns_to ??")

# ---------------------------------------------------------------- 3. CSS
H('''.pf-step-form-row{display:none;padding:.2rem .2rem .2rem 1.9rem}''',
  '''.pf-step-form-row{display:none;padding:.2rem .2rem .2rem 1.9rem}
.pf-step-branch-row{display:none;flex-wrap:wrap;gap:.5rem .9rem;align-items:center;padding:.3rem .2rem .3rem 1.9rem}
#pfStepsList .pf-step-compact.is-decision .pf-step-branch-row{display:flex}
#pfStepsList .pf-step-compact.is-decision{border-left:3px solid var(--blue-lt)}
.pf-step-branch-row label{display:flex;align-items:center;gap:.35rem;font-size:.76rem;color:var(--muted)}
.pf-step-branch-row select{border:1px solid var(--brd);background:var(--surf);color:var(--txt);font-size:.76rem;padding:.18rem .35rem;border-radius:6px;max-width:230px}
.pf-step-branch-row .pf-br-yes{color:#16a34a;font-weight:700}
.pf-step-branch-row .pf-br-no{color:#ea580c;font-weight:700}
.proc-branch{display:block;font-size:.76rem;color:var(--muted);margin-top:2px}''',
  "CSS branches")

# ---------------------------------------------------------------- 4. Form row
H('''  return `<div class="pf-step-compact" data-icon="${esc(s.icon||'')}" data-returns="${esc(s.returns_to!=null?String(s.returns_to):'')}">''',
  '''  return `<div class="pf-step-compact${nt==='decision'?' is-decision':''}" data-icon="${esc(s.icon||'')}" data-yes-pending="${esc(s.yes_to!=null?String(s.yes_to):'')}" data-no-pending="${esc(s.returns_to!=null?String(s.returns_to):'')}">''',
  "step row wrapper")
H('''    <div class="pf-step-auto-row"${(s.has_auto||s.automation_url)?' style=\\"display:flex\\"':''}>''',
  '''    <div class="pf-step-branch-row">
      <label><span class="pf-br-yes">✔ If yes →</span><select class="pf-step-yes"></select></label>
      <label><span class="pf-br-no">✖ If no →</span><select class="pf-step-no"></select></label>
    </div>
    <div class="pf-step-auto-row"${(s.has_auto||s.automation_url)?' style=\\"display:flex\\"':''}>''',
  "branch row markup")

# pfSyncBranches + hooks
H('''function pfMiniSetNt(btn){
  const row=btn.closest('.pf-step-compact');if(!row)return;
  row.querySelectorAll('.pf-nt-mini-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const hid=row.querySelector('.pf-step-nodetype');if(hid)hid.value=btn.dataset.nt;
  pfRefreshDiagramPreview();
}''',
  '''function pfMiniSetNt(btn){
  const row=btn.closest('.pf-step-compact');if(!row)return;
  row.querySelectorAll('.pf-nt-mini-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const hid=row.querySelector('.pf-step-nodetype');if(hid)hid.value=btn.dataset.nt;
  pfSyncBranches();
  pfRefreshDiagramPreview();
}
// IF / branching: each step gets a stable uid; the Yes / No selects point at a uid (or END),
// so reordering or deleting steps never leaves a target pointing at the wrong step.
let _pfUid=0;
function pfSyncBranches(finalize){
  const rows=Array.from(document.querySelectorAll('#pfStepsList .pf-step-compact'));
  rows.forEach(r=>{if(!r.dataset.uid)r.dataset.uid='u'+(++_pfUid);});
  rows.forEach((row,i)=>{
    row.classList.toggle('is-decision',(row.querySelector('.pf-step-nodetype')?.value||'')==='decision');
    [['yes','.pf-step-yes','yesPending'],['no','.pf-step-no','noPending']].forEach(([k,selq,pk])=>{
      const sel=row.querySelector(selq);if(!sel)return;
      let cur=sel.value;
      const pend=row.dataset[pk];
      if(!cur&&pend!==undefined&&pend!==''){
        if(pend==='0'){cur='END';delete row.dataset[pk];}
        else{const t=rows[Number(pend)-1];if(t&&t!==row){cur=t.dataset.uid;delete row.dataset[pk];}}
      }
      if(finalize)delete row.dataset[pk];
      sel.innerHTML='<option value="">Next step</option><option value="END">End of process</option>'+
        rows.map((t,j)=>j===i?'':`<option value="${t.dataset.uid}">Step ${j+1} · ${esc((t.querySelector('.pf-step-title')?.value||'').trim()||'untitled')}</option>`).join('');
      sel.value=cur||'';
    });
  });
}
window.pfSyncBranches=pfSyncBranches;''',
  "pfSyncBranches")

H('''function pfRefreshDiagramPreview(){
  clearTimeout(_pfPreviewTimer);''',
  '''function pfRefreshDiagramPreview(){
  try{pfSyncBranches();}catch(e){}
  clearTimeout(_pfPreviewTimer);''',
  "sync on preview refresh")

H('''      (process.steps || []).forEach(s => addProcessStepRow(s));
      (process.validations || []).forEach(v => addProcessValidationRow(v));''',
  '''      (process.steps || []).forEach(s => addProcessStepRow(s));
      pfSyncBranches(true);
      (process.validations || []).forEach(v => addProcessValidationRow(v));''',
  "resolve branch targets on load")

# Billing example: legacy returns_to are positions -> resolve too
H('''  addProcessResourceRow({label:'Billing tracking sheet',''',
  '''  pfSyncBranches(true);
  addProcessResourceRow({label:'Billing tracking sheet',''',
  "resolve branch targets in billing example")

# ---------------------------------------------------------------- 5. Collect
H('''function pfCollectSteps(forDiagram){
  const withSchedule = processFrequencyHasSchedule(document.getElementById('pfFrequency')?.value || '');
  return Array.from(document.querySelectorAll('#pfStepsList .pf-step-compact')).map((row,i)=>{
    const val=sel=>(row.querySelector(sel)?.value||'').trim();
    return {''',
  '''function pfCollectSteps(forDiagram){
  const withSchedule = processFrequencyHasSchedule(document.getElementById('pfFrequency')?.value || '');
  const allRows = Array.from(document.querySelectorAll('#pfStepsList .pf-step-compact'));
  // Yes / No select value -> step position (1-based) | 0 = end of process | null = next step
  const branchPos = (row, selq) => {
    if((row.querySelector('.pf-step-nodetype')?.value||'') !== 'decision') return null;
    const v = row.querySelector(selq)?.value || '';
    if(!v) return null;
    if(v === 'END') return 0;
    const k = allRows.findIndex(r => r.dataset.uid === v);
    return k < 0 ? null : k + 1;
  };
  const collected = allRows.map((row,i)=>{
    const val=sel=>(row.querySelector(sel)?.value||'').trim();
    return {''', "collect: helpers")
H('''returns_to:row.dataset.returns?Number(row.dataset.returns):null,''',
  '''returns_to:branchPos(row,'.pf-step-no'),yes_to:branchPos(row,'.pf-step-yes'),''',
  "collect returns_to/yes_to")
H('''  }).filter(s=>forDiagram||s.title).map(s=>forDiagram?Object.assign({},s,{title:s.title||('Step '+s.id)}):s);
}''',
  '''  });
  if(forDiagram) return collected.map(s=>Object.assign({},s,{title:s.title||('Step '+s.id)}));
  // Saving: drop untitled steps and renumber, keeping Yes / No targets pointing at the right step.
  const kept = collected.filter(s=>s.title);
  const newId = new Map(kept.map((s,i)=>[s.id,i+1]));
  const remap = t => (t===null||t===0) ? t : (newId.has(t) ? newId.get(t) : null);
  return kept.map(s=>Object.assign({},s,{id:newId.get(s.id),yes_to:remap(s.yes_to),returns_to:remap(s.returns_to)}));
}''',
  "collect: renumber on save")

# ---------------------------------------------------------------- 6. Renderer
H('''  // Main flow connectors — elbowed between lane rows, "Sí" labeling the edge leaving a decision.
  for(let i = 0; i < flow.length - 1; i++){
    const a = flow[i], b = flow[i + 1];
    const x1 = nodeX[i], y1 = roleY(a), x2 = nodeX[i + 1], y2 = roleY(b);
    const midx = (x1 + x2) / 2;
    svg += `<path d="M${x1},${y1} L${midx},${y1} L${midx},${y2} L${x2},${y2}" fill="none" stroke="var(--blue-lt)" stroke-width="2" marker-end="url(#pdArrow-${containerId})" opacity=".55"/>`;
    if(a.node_type === 'decision') svg += `<text x="${midx + 6}" y="${y1 - 6}" font-size="10" font-weight="700" fill="var(--blue-lt)">Yes</text>`;
  }
''',
  '''  // IF / branching: a decision step can send "Yes" and "No" to any step (or to the End).
  //   yes_to null = next step · returns_to null = no "No" path (legacy loop-back) · 0 = End of process.
  const flowIdxOf = (t) => {
    if(t === 0) return flow.length - 1;
    const k = steps.findIndex(x => x.id === t);
    return k < 0 ? -1 : k + offset;
  };
  const branchInfo = {}; // flow index -> {yes, no} (flow indexes)
  steps.forEach((s, i) => {
    if(s.node_type !== 'decision') return;
    const fi = i + offset, next = fi + 1;
    let yes = s.yes_to != null ? flowIdxOf(s.yes_to) : next;
    if(yes < 0) yes = next;
    let no = s.returns_to != null ? flowIdxOf(s.returns_to) : -1;
    if(no < 0 && s.yes_to != null) no = next; // explicit Yes with no "No": No falls through to the next step
    branchInfo[fi] = {yes, no};
  });

  // Main flow connectors — elbowed between lane rows. Decisions only draw the straight edge
  // when Yes or No actually goes to the next step, labeled accordingly.
  for(let i = 0; i < flow.length - 1; i++){
    const a = flow[i], b = flow[i + 1];
    const bi = branchInfo[i];
    let lbl = '';
    if(a.node_type === 'decision' && !a.__virtual){
      if(bi && bi.yes === i + 1) lbl = 'Yes';
      else if(bi && bi.no === i + 1) lbl = 'No';
      else if(bi) continue;
      else lbl = 'Yes';
    }
    const x1 = nodeX[i], y1 = roleY(a), x2 = nodeX[i + 1], y2 = roleY(b);
    const midx = (x1 + x2) / 2;
    svg += `<path d="M${x1},${y1} L${midx},${y1} L${midx},${y2} L${x2},${y2}" fill="none" stroke="var(--blue-lt)" stroke-width="2" marker-end="url(#pdArrow-${containerId})" opacity=".55"/>`;
    if(lbl) svg += `<text x="${midx + 6}" y="${y1 - 6}" font-size="10" font-weight="700" fill="${lbl === 'No' ? '#F97316' : '#16A34A'}">${lbl}</text>`;
  }
''', "renderer: main connectors with branches")

H('''  steps.forEach((s, i) => {
    if(!s.returns_to) return;
    const targetIdx = steps.findIndex(t => t.id === s.returns_to);
    if(targetIdx < 0) return;
    const flowI = i + offset, flowT = targetIdx + offset;
    const x1 = nodeX[flowI], y1 = roleY(flow[flowI]) + laneH / 2 - 10;
    const x2 = nodeX[flowT], y2 = roleY(flow[flowT]) + laneH / 2 - 10;
    const arcY = H - 12;
    svg += `<path d="M${x1},${y1} C${x1},${arcY} ${x2},${arcY} ${x2},${y2}" fill="none" stroke="#F97316" stroke-width="1.6" stroke-dasharray="5,4" marker-end="url(#pdArrowLoop-${containerId})"/>`;
  });''',
  '''  // Every branch that does not go to the next step is drawn as an arc under the lanes:
  // green = Yes, orange dashed = No (also used for the legacy "claim" loop-backs).
  Object.keys(branchInfo).forEach(key => {
    const flowI = Number(key), bi = branchInfo[key];
    [['Yes', bi.yes], ['No', bi.no]].forEach(([kind, flowT]) => {
      if(flowT < 0 || flowT === flowI + 1 || flowT === flowI) return;
      const isYes = kind === 'Yes';
      const x1 = nodeX[flowI], y1 = roleY(flow[flowI]) + laneH / 2 - 10;
      const x2 = nodeX[flowT], y2 = roleY(flow[flowT]) + laneH / 2 - 10;
      const arcY = isYes ? H - 26 : H - 12;
      const color = isYes ? '#16A34A' : '#F97316';
      svg += `<path d="M${x1},${y1} C${x1},${arcY} ${x2},${arcY} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="1.6"${isYes ? '' : ' stroke-dasharray="5,4"'} marker-end="url(#${isYes ? 'pdArrowYes' : 'pdArrowLoop'}-${containerId})"/>`;
      svg += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2 + 6 * arcY) / 8 - 3}" font-size="10" font-weight="700" text-anchor="middle" fill="${color}">${kind}</text>`;
    });
  });''',
  "renderer: Yes/No arcs")

H('''    <marker id="pdArrowLoop-${containerId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#F97316"/></marker>''',
  '''    <marker id="pdArrowLoop-${containerId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#F97316"/></marker>
    <marker id="pdArrowYes-${containerId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#16A34A"/></marker>''',
  "renderer: Yes marker")

# ---------------------------------------------------------------- 7. Card list text
H('''async function confirmDeleteProcess(id, name){''',
  '''// "If yes → step 4 · If no → End" text for decision steps in the process card.
function processBranchText(s, steps){
  if(!s || s.node_type !== 'decision' || (s.yes_to == null && s.returns_to == null)) return '';
  const ref = t => {
    if(t === 0) return 'End of process';
    const k = (steps || []).find(x => x.id === t);
    return k ? `step ${k.id} · ${k.title || ''}` : '';
  };
  const parts = [];
  if(s.yes_to != null) parts.push('If yes → ' + ref(s.yes_to));
  if(s.returns_to != null) parts.push('If no → ' + ref(s.returns_to));
  return parts.length ? `<span class="proc-branch">${parts.map(esc).join(' · ')}</span>` : '';
}
async function confirmDeleteProcess(id, name){''', "processBranchText")
H('''${s.desc ? ' — ' + esc(s.desc) : ''}${(s.form_url || s.automation_url)''',
  '''${s.desc ? ' — ' + esc(s.desc) : ''}${processBranchText(s, steps)}${(s.form_url || s.automation_url)''',
  "card list: branch text")

pathlib.Path("index.html").write_text(html, encoding="utf-8")
pathlib.Path("lib/data-store.js").write_text(ds, encoding="utf-8")
print("LISTO: index.html y lib/data-store.js actualizados")
