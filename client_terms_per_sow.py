"""
Client profile v2: billing terms PER SOW / PROJECT instead of one per client.

Se aplica ENCIMA de add_client_terms_panel.py (v1). Cambia:
- Neon: tabla pmo.pmo_client_projects (client_key + project) en lugar de pmo_client_terms.
- API /api/notes: GET -> client_projects; POST {type:'client_projects'} reemplaza los SOWs de un cliente (solo PMO).
- UI: la ficha del cliente lista cada SOW con Code (Tracking·Cycle·Project), editable por PMO (agregar / quitar / cambiar).
- Opcion de Project: "Time&Materials" -> "T&M".
Sigue siendo WIP / preview-only.

Correr desde la raiz del repo:  python3 client_terms_per_sow.py
"""
import pathlib

files = {}

def load(path):
    if path not in files:
        files[path] = pathlib.Path(path).read_text(encoding="utf-8")

def apply(path, old, new, label):
    load(path)
    count = files[path].count(old)
    assert count == 1, f"[{path} :: {label}] esperado 1 match, encontrados {count}"
    files[path] = files[path].replace(old, new, 1)
    print(f"OK: {path} :: {label}")

def replace_between(path, start, end, new, label, include_end):
    """Reemplaza desde `start` hasta `end` (incluido si include_end) por `new`."""
    load(path)
    src = files[path]
    assert src.count(start) == 1, f"[{path} :: {label}] inicio: esperado 1 match, encontrados {src.count(start)}"
    i = src.index(start)
    j = src.find(end, i)
    assert j != -1 and src.count(end) == 1, f"[{path} :: {label}] fin no encontrado o repetido"
    j = j + len(end) if include_end else j
    files[path] = src[:i] + new + src[j:]
    print(f"OK: {path} :: {label}")


# ───────────────────────── lib/data-store.js ─────────────────────────
apply("lib/data-store.js",
"""  // Billing terms per client (Client profile panel). One row per normalized client key.
  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_client_terms')} (
      client_key text PRIMARY KEY,
      client text NOT NULL DEFAULT '',
      tracking text NOT NULL DEFAULT '',""",
"""  // Billing terms per SOW / project (Client profile panel). One row per client + project.
  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_client_projects')} (
      client_key text NOT NULL,
      project text NOT NULL,
      client text NOT NULL DEFAULT '',
      tracking text NOT NULL DEFAULT '',""",
"ensureSchema: tabla pmo_client_projects (1/2)")

apply("lib/data-store.js",
"""      project_type text NOT NULL DEFAULT '',
      updated_by text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_notes')} (""",
"""      project_type text NOT NULL DEFAULT '',
      updated_by text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_key, project)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_notes')} (""",
"ensureSchema: tabla pmo_client_projects (2/2)")

replace_between("lib/data-store.js",
"""// Billing terms por cliente (Tracking / Cycle / Project). Lo lee cualquiera, lo escribe PMO.""",
"""async function getBenchPm() {""",
"""// Billing terms por SOW/proyecto (Tracking / Cycle / Project). Lo lee cualquiera, lo escribe PMO.
// Project Code = digito Tracking + digito Cycle + digito Project (ej. 211 = Day Rate · Week · T&M).
// Valores permitidos: '' (sin definir) o una de estas opciones.
const CLIENT_TERMS_OPTIONS = {
  tracking: ['Hourly', 'Day Rate'],
  cycle: ['Week', 'Month', 'Milestone'],
  project_type: ['T&M', 'Fixed']
};

async function getClientProjects() {
  const sql = getSql();
  if (!sql) return [];
  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const rows = await sql`
    SELECT client_key, client, project, tracking, cycle, project_type, updated_by, updated_at
    FROM ${q('pmo_client_projects')}
    ORDER BY client ASC, project ASC
  `;
  return rows.map((row) => ({
    client_key: row.client_key,
    client: row.client,
    project: row.project,
    tracking: row.tracking,
    cycle: row.cycle,
    project_type: row.project_type,
    updated_by: row.updated_by,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
  }));
}

// Reemplaza la lista completa de SOWs de un cliente (lo que se ve en la ficha es lo que queda guardado).
async function setClientProjects(input = {}, actorEmail = '') {
  const sql = getSql({ required: true });
  if (!sql) throw new Error('DATABASE_URL is required to save client projects');
  const clientKey = String(input.client_key || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120);
  if (!clientKey) throw new Error('client_key is required');
  const client = String(input.client || '').trim().slice(0, 200);
  const list = Array.isArray(input.projects) ? input.projects.slice(0, 200) : [];
  const updatedBy = String(actorEmail || '').slice(0, 200);
  const seen = new Set();
  const rows = list.map((p) => {
    const project = String(p.project || '').trim().slice(0, 300);
    if (!project) throw new Error('Every SOW needs a name');
    const dupKey = project.toLowerCase();
    if (seen.has(dupKey)) throw new Error(`Duplicated SOW: ${project}`);
    seen.add(dupKey);
    const pick = (field) => {
      const value = String(p[field] || '').trim();
      if (value && !CLIENT_TERMS_OPTIONS[field].includes(value)) throw new Error(`Invalid ${field}: ${value}`);
      return value;
    };
    return { client_key: clientKey, client, project, tracking: pick('tracking'), cycle: pick('cycle'), project_type: pick('project_type'), updated_by: updatedBy };
  });
  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  await sql`DELETE FROM ${q('pmo_client_projects')} WHERE client_key = ${clientKey}`;
  for (const row of rows) {
    await sql`
      INSERT INTO ${q('pmo_client_projects')} (client_key, project, client, tracking, cycle, project_type, updated_by, updated_at)
      VALUES (${row.client_key}, ${row.project}, ${row.client}, ${row.tracking}, ${row.cycle}, ${row.project_type}, ${row.updated_by}, now())
    `;
  }
  const now = new Date().toISOString();
  return rows.map((row) => ({ ...row, updated_at: now }));
}

""",
"getClientProjects / setClientProjects", include_end=False)

apply("lib/data-store.js",
"""  getClientTerms,
  setClientTerms,
""",
"""  getClientProjects,
  setClientProjects,
""",
"exports")


# ───────────────────────── api/notes.js ─────────────────────────
apply("api/notes.js",
"""getBenchPm, setBenchPm, getClientTerms, setClientTerms } = require('../lib/data-store');""",
"""getBenchPm, setBenchPm, getClientProjects, setClientProjects } = require('../lib/data-store');""",
"require")

apply("api/notes.js",
"""client_terms: await getClientTerms() });""",
"""client_projects: await getClientProjects() });""",
"GET devuelve client_projects")

apply("api/notes.js",
"""      // Client terms (Tracking / Cycle / Project): solo PMO escribe; todos leen via GET.
      if (note.type === 'client_terms') {
        const saved = await setClientTerms(note, access.user?.email || '');
        res.status(200).json({ client_terms: saved });
        return;
      }""",
"""      // Client projects (SOWs con Tracking / Cycle / Project): solo PMO escribe; todos leen via GET.
      if (note.type === 'client_projects') {
        const saved = await setClientProjects(note, access.user?.email || '');
        res.status(200).json({ client_projects: saved });
        return;
      }""",
"POST type client_projects")


# ───────────────────────── index.html ─────────────────────────
apply("index.html",
""".auth-field select{background:var(--surf);""",
""".auth-field select,.client-proj-table select,.client-proj-table input{background:var(--surf);""",
"CSS: selects/inputs de la tabla de SOWs")

apply("index.html",
"""  <div class="auth-card" style="width:min(520px,100%)">
    <h3><span id="clientProfileTitle">Client</span>""",
"""  <div class="auth-card" style="width:min(820px,100%);max-height:90vh;overflow:auto">
    <h3><span id="clientProfileTitle">Client</span>""",
"modal mas ancho")

replace_between("index.html",
"""// ── Client profile: billing terms por cliente (Tracking / Cycle / Project) ──""",
"""window.saveClientProfile = saveClientProfile;
""",
"""// ── Client profile: billing terms por SOW/proyecto (Tracking / Cycle / Project) ──
// WIP: solo preview/localhost (en produccion el nombre queda como texto plano).
// Guardado en Neon (pmo_client_projects) via /api/notes type 'client_projects'.
// Lo ve cualquiera con sesion; lo edita solo PMO (canRunRefresh, mismo criterio que Bench PM).
// Project Code = digito Tracking + digito Cycle + digito Project (ej. 211 = Day Rate · Week · T&M).
const CLIENT_TERMS_FIELDS = [
  {field:'tracking', label:'Tracking', options:['Hourly','Day Rate']},
  {field:'cycle', label:'Cycle', options:['Week','Month','Milestone']},
  {field:'project_type', label:'Project', options:['T&M','Fixed']}
];
let clientProjects = new Map();   // client_key -> [SOW rows guardados]
let clientProjectsLoading = null;
let clientProfileKey = '';
let clientProfileDraft = [];      // copia editable (solo PMO)
function clientTermsKey(client){ return String(normalizeClientKey(client) || '').replace(/[^a-z0-9]/g,''); }
function clientProjectCode(p){
  return CLIENT_TERMS_FIELDS.map(({field, options}) => {
    const i = options.indexOf(p[field] || '');
    return i < 0 ? '·' : String(i + 1);
  }).join('');
}
function clientProjectFromCode(code){
  const digits = String(code || '').trim();
  const out = {};
  CLIENT_TERMS_FIELDS.forEach(({field, options}, i) => { out[field] = options[Number(digits[i]) - 1] || ''; });
  return out;
}
function clientProfileTrigger(client){
  const name = esc(client || '—');
  if(IS_PMO_PRODUCTION || !client) return name;
  return `<button type="button" class="auth-link" style="padding:0;font-size:inherit;font-weight:900;text-align:left" title="Open client profile" onclick="openClientProfile('${clientTermsKey(client)}')">${name}</button>`;
}
function loadClientProjects(){
  if(location.protocol === 'file:' || !currentUser) return Promise.resolve();
  if(clientProjectsLoading) return clientProjectsLoading;
  clientProjectsLoading = (async () => {
    try{
      const response = await fetch('/api/notes', {cache:'no-store', credentials:'same-origin'});
      if(response.ok){
        const result = await response.json().catch(()=>({}));
        const grouped = new Map();
        (result.client_projects || []).forEach(row => {
          if(!grouped.has(row.client_key)) grouped.set(row.client_key, []);
          grouped.get(row.client_key).push(row);
        });
        clientProjects = grouped;
      }
    }catch(e){ /* sin red: el panel muestra lo que haya */ }
    finally{ clientProjectsLoading = null; }
  })();
  return clientProjectsLoading;
}
function clientProfileCoverage(key){
  return (latest?.account_coverage || []).find(cov => clientTermsKey(cov.client) === key) || null;
}
function setClientProfileMessage(type, text){
  const error = document.getElementById('clientProfileError');
  const success = document.getElementById('clientProfileSuccess');
  if(error){ error.textContent = type === 'error' ? text : ''; error.style.display = type === 'error' && text ? 'block' : 'none'; }
  if(success){ success.textContent = type === 'success' ? text : ''; success.style.display = type === 'success' && text ? 'block' : 'none'; }
}
function resetClientProfileDraft(){
  clientProfileDraft = (clientProjects.get(clientProfileKey) || []).map(p => ({
    project: p.project || '', tracking: p.tracking || '', cycle: p.cycle || '', project_type: p.project_type || ''
  }));
}
async function openClientProfile(key){
  clientProfileKey = key;
  const modal = document.getElementById('clientProfileModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  setClientProfileMessage('', '');
  renderClientProfile(true);
  await loadClientProjects();
  if(clientProfileKey !== key) return;
  resetClientProfileDraft();
  renderClientProfile(false);
}
function closeClientProfile(){
  const modal = document.getElementById('clientProfileModal');
  if(modal){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }
  clientProfileKey = '';
  clientProfileDraft = [];
}
function updateClientProjectDraft(i, field, value){
  if(!clientProfileDraft[i]) return;
  clientProfileDraft[i][field] = value;
  const codeCell = document.getElementById(`clientProjCode_${i}`);
  if(codeCell) codeCell.textContent = clientProjectCode(clientProfileDraft[i]);
}
function addClientProjectRow(){
  clientProfileDraft.push({project:'', tracking:'', cycle:'', project_type:''});
  renderClientProfile(false);
}
function removeClientProjectRow(i){
  clientProfileDraft.splice(i, 1);
  renderClientProfile(false);
}
function renderClientProfile(loading){
  const cov = clientProfileCoverage(clientProfileKey) || {};
  const saved = clientProjects.get(clientProfileKey) || [];
  const canEdit = canRunRefresh();
  const title = document.getElementById('clientProfileTitle');
  const subtitle = document.getElementById('clientProfileSubtitle');
  const body = document.getElementById('clientProfileBody');
  const actions = document.getElementById('clientProfileActions');
  if(title) title.textContent = cov.client || 'Client';
  if(subtitle) subtitle.textContent = `${cov.status || 'Unknown status'} · Jira PSA`;
  if(!body) return;
  const coverageHtml = `<div class="auth-field"><label>Coverage</label><div class="coverage-cell">
      <b>PM:</b> ${coverageBadge(cov.pm_assigned, cov.pm_assigned_active)}<br/>
      <b>CSM:</b> ${coverageBadge(cov.csm_assigned, cov.csm_assigned_active)}<br/>
      <b>TL:</b> ${coverageBadge(cov.tl_assigned, cov.tl_assigned_active)}<br/>
      ${cov.client ? accountCoverageLink(cov, 'Open in Jira') : ''}
    </div></div>`;
  let sowsHtml;
  if(loading){
    sowsHtml = '<p>Loading SOWs…</p>';
  }else{
    const rows = canEdit ? clientProfileDraft : saved;
    const head = `<tr><th>SOW / Project</th><th>Code</th>${CLIENT_TERMS_FIELDS.map(f => `<th>${esc(f.label)}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr>`;
    const bodyRows = rows.map((p, i) => {
      if(!canEdit){
        return `<tr><td>${esc(p.project)}</td><td style="font-weight:800">${esc(clientProjectCode(p))}</td>${CLIENT_TERMS_FIELDS.map(({field}) => `<td>${esc(p[field] || 'Not set')}</td>`).join('')}</tr>`;
      }
      const selects = CLIENT_TERMS_FIELDS.map(({field, options}) =>
        `<td><select onchange="updateClientProjectDraft(${i},'${field}',this.value)">${['', ...options].map(opt => `<option value="${esc(opt)}"${opt === (p[field] || '') ? ' selected' : ''}>${esc(opt || '— Not set —')}</option>`).join('')}</select></td>`
      ).join('');
      return `<tr>
        <td><input type="text" value="${esc(p.project)}" placeholder="[SOW n] Software Development Services - …" style="min-width:240px;width:100%" oninput="updateClientProjectDraft(${i},'project',this.value)"/></td>
        <td id="clientProjCode_${i}" style="font-weight:800">${esc(clientProjectCode(p))}</td>
        ${selects}
        <td><button class="btn btn-ghost btn-sm" type="button" title="Remove SOW" onclick="removeClientProjectRow(${i})">✕</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="${canEdit ? 6 : 5}" style="text-align:center;padding:.8rem;color:var(--muted)">No SOWs loaded for this client.</td></tr>`;
    const last = saved.map(p => p.updated_at).filter(Boolean).sort().at(-1);
    const lastBy = last ? (saved.find(p => p.updated_at === last) || {}).updated_by : '';
    sowsHtml = `<div class="auth-field"><label>SOWs · billing terms</label>
      <div class="fc-table-wrap client-proj-table"><table><thead>${head}</thead><tbody>${bodyRows}</tbody></table></div>
      ${canEdit ? `<div><button class="btn btn-ghost btn-sm" type="button" onclick="addClientProjectRow()">+ Add SOW</button></div>` : ''}
      ${last ? `<p style="margin:.3rem 0 0">Last updated ${esc(String(last).slice(0,10))}${lastBy ? ` by ${esc(lastBy)}` : ''}</p>` : ''}
    </div>`;
  }
  body.innerHTML = coverageHtml + sowsHtml;
  if(actions){
    actions.innerHTML = `<button class="btn btn-ghost btn-sm" type="button" onclick="closeClientProfile()">Close</button>`
      + (canEdit && !loading ? `<button class="btn btn-primary btn-sm" type="button" id="clientProfileSaveBtn" onclick="saveClientProfile()">Save</button>` : '');
  }
}
async function saveClientProfile(){
  const key = clientProfileKey;
  if(!key) return;
  const cov = clientProfileCoverage(key) || {};
  const projects = clientProfileDraft
    .map(p => ({...p, project: String(p.project || '').trim()}))
    .filter(p => p.project);
  const btn = document.getElementById('clientProfileSaveBtn');
  if(btn) btn.disabled = true;
  setClientProfileMessage('', '');
  try{
    const response = await fetch('/api/notes', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({type:'client_projects', client_key:key, client:cov.client || '', projects})
    });
    const result = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
    clientProjects.set(key, result.client_projects || []);
    if(clientProfileKey === key){
      resetClientProfileDraft();
      renderClientProfile(false);
      setClientProfileMessage('success', 'Saved');
    }
  }catch(e){
    setClientProfileMessage('error', 'Could not save: ' + e.message);
    if(btn) btn.disabled = false;
  }
}
window.openClientProfile = openClientProfile;
window.closeClientProfile = closeClientProfile;
window.saveClientProfile = saveClientProfile;
window.updateClientProjectDraft = updateClientProjectDraft;
window.addClientProjectRow = addClientProjectRow;
window.removeClientProjectRow = removeClientProjectRow;
""",
"Client profile: JS por SOW", include_end=True)


for path, content in files.items():
    pathlib.Path(path).write_text(content, encoding="utf-8")
print("Listo.")
