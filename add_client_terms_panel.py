"""
Client profile panel: billing terms per client (Tracking / Cycle / Project).

- Neon: new table pmo.pmo_client_terms (created by ensureSchema, IF NOT EXISTS).
- API: /api/notes  GET -> includes client_terms; POST {type:'client_terms'} -> saves (PMO only).
- UI: in Accounts Coverage, the client name opens a "client profile" modal
  (Jira PSA coverage + billing terms). PMO edits with dropdowns; other roles read-only.
- WIP: preview/localhost only. In production the client name stays plain text.

Run from the repo root:  python3 add_client_terms_panel.py
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


# ───────────────────────── lib/data-store.js ─────────────────────────
apply("lib/data-store.js",
"""  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_notes')} (""",
"""  // Billing terms per client (Client profile panel). One row per normalized client key.
  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_client_terms')} (
      client_key text PRIMARY KEY,
      client text NOT NULL DEFAULT '',
      tracking text NOT NULL DEFAULT '',
      cycle text NOT NULL DEFAULT '',
      project_type text NOT NULL DEFAULT '',
      updated_by text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ${q('pmo_notes')} (""",
"ensureSchema: tabla pmo_client_terms")

apply("lib/data-store.js",
"""async function getBenchPm() {""",
"""// Billing terms por cliente (Tracking / Cycle / Project). Lo lee cualquiera, lo escribe PMO.
// Valores permitidos: '' (sin definir) o una de estas opciones.
const CLIENT_TERMS_OPTIONS = {
  tracking: ['Hourly', 'Day Rate'],
  cycle: ['Week', 'Month', 'Milestone'],
  project_type: ['Time&Materials', 'Fixed']
};

async function getClientTerms() {
  const sql = getSql();
  if (!sql) return [];
  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  const rows = await sql`
    SELECT client_key, client, tracking, cycle, project_type, updated_by, updated_at
    FROM ${q('pmo_client_terms')}
    ORDER BY client ASC
  `;
  return rows.map((row) => ({
    client_key: row.client_key,
    client: row.client,
    tracking: row.tracking,
    cycle: row.cycle,
    project_type: row.project_type,
    updated_by: row.updated_by,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
  }));
}

async function setClientTerms(input = {}, actorEmail = '') {
  const sql = getSql({ required: true });
  if (!sql) throw new Error('DATABASE_URL is required to save client terms');
  const clientKey = String(input.client_key || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120);
  if (!clientKey) throw new Error('client_key is required');
  const pick = (field) => {
    const value = String(input[field] || '').trim();
    if (value && !CLIENT_TERMS_OPTIONS[field].includes(value)) throw new Error(`Invalid ${field}: ${value}`);
    return value;
  };
  const row = {
    client_key: clientKey,
    client: String(input.client || '').trim().slice(0, 200),
    tracking: pick('tracking'),
    cycle: pick('cycle'),
    project_type: pick('project_type'),
    updated_by: String(actorEmail || '').slice(0, 200)
  };
  await ensureSchema(sql);
  const q = (name) => sql.unsafe(`${DB_SCHEMA}.${name}`);
  await sql`
    INSERT INTO ${q('pmo_client_terms')} (client_key, client, tracking, cycle, project_type, updated_by, updated_at)
    VALUES (${row.client_key}, ${row.client}, ${row.tracking}, ${row.cycle}, ${row.project_type}, ${row.updated_by}, now())
    ON CONFLICT (client_key) DO UPDATE SET
      client = EXCLUDED.client,
      tracking = EXCLUDED.tracking,
      cycle = EXCLUDED.cycle,
      project_type = EXCLUDED.project_type,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
  return { ...row, updated_at: new Date().toISOString() };
}

async function getBenchPm() {""",
"getClientTerms / setClientTerms")

apply("lib/data-store.js",
"""  setBenchPm,
""",
"""  setBenchPm,
  getClientTerms,
  setClientTerms,
""",
"exports")


# ───────────────────────── api/notes.js ─────────────────────────
apply("api/notes.js",
"""const { addNote, deleteNote, getNotes, getBenchPm, setBenchPm } = require('../lib/data-store');""",
"""const { addNote, deleteNote, getNotes, getBenchPm, setBenchPm, getClientTerms, setClientTerms } = require('../lib/data-store');""",
"require")

apply("api/notes.js",
"""  return { read: true, write: canRefresh(user) };""",
"""  return { read: true, write: canRefresh(user), user };""",
"access devuelve user (para updated_by)")

apply("api/notes.js",
"""      res.status(200).json({ notes: await getNotes(), bench_pm: await getBenchPm() });""",
"""      res.status(200).json({ notes: await getNotes(), bench_pm: await getBenchPm(), client_terms: await getClientTerms() });""",
"GET incluye client_terms")

apply("api/notes.js",
"""      if (note.type === 'jira_action_ticket') {""",
"""      // Client terms (Tracking / Cycle / Project): solo PMO escribe; todos leen via GET.
      if (note.type === 'client_terms') {
        const saved = await setClientTerms(note, access.user?.email || '');
        res.status(200).json({ client_terms: saved });
        return;
      }

      if (note.type === 'jira_action_ticket') {""",
"POST type client_terms")


# ───────────────────────── index.html ─────────────────────────
apply("index.html",
""".auth-field input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,102,255,.15)}""",
""".auth-field input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,102,255,.15)}
.auth-field select{background:var(--surf);border:1px solid var(--brd);color:var(--txt);border-radius:10px;padding:.6rem .75rem;font:inherit;outline:none}""",
"CSS select en auth-field")

apply("index.html",
"""

<!-- HERO -->""",
"""

<!-- CLIENT PROFILE (WIP · preview only): billing terms per client -->
<div class="auth-modal" id="clientProfileModal" aria-hidden="true" onclick="if(event.target===this)closeClientProfile()">
  <div class="auth-card" style="width:min(520px,100%)">
    <h3><span id="clientProfileTitle">Client</span> <span class="badge badge-wip" title="Preview only — not visible in production yet.">WIP · Preview</span></h3>
    <p id="clientProfileSubtitle"></p>
    <div id="clientProfileBody"></div>
    <div class="auth-success" id="clientProfileSuccess"></div>
    <div class="auth-error" id="clientProfileError"></div>
    <div class="auth-actions" id="clientProfileActions"></div>
  </div>
</div>

<!-- HERO -->""",
"modal HTML")

apply("index.html",
"""      <td style="font-weight:900">${esc(row.client || '—')}</td>
      <td>${statusChip(row.epic_status || 'Unknown')}</td>
      <td>${coverageBadge(coverage.pm_assigned, coverage.pm_assigned_active)}</td>""",
"""      <td style="font-weight:900">${clientProfileTrigger(row.client)}</td>
      <td>${statusChip(row.epic_status || 'Unknown')}</td>
      <td>${coverageBadge(coverage.pm_assigned, coverage.pm_assigned_active)}</td>""",
"Accounts Coverage: nombre de cliente abre el perfil")

apply("index.html",
"""window.setAccountCoverageStatusFilter = setAccountCoverageStatusFilter;
""",
"""window.setAccountCoverageStatusFilter = setAccountCoverageStatusFilter;

// ── Client profile: billing terms por cliente (Tracking / Cycle / Project) ──
// WIP: solo preview/localhost (en produccion el nombre queda como texto plano).
// Guardado en Neon (pmo_client_terms) via /api/notes type 'client_terms'.
// Lo ve cualquiera con sesion; lo edita solo PMO (canRunRefresh, mismo criterio que Bench PM).
const CLIENT_TERMS_FIELDS = [
  {field:'tracking', label:'Tracking', options:['Hourly','Day Rate']},
  {field:'cycle', label:'Cycle', options:['Week','Month','Milestone']},
  {field:'project_type', label:'Project', options:['Time&Materials','Fixed']}
];
let clientTerms = new Map();
let clientTermsLoading = null;
let clientProfileKey = '';
function clientTermsKey(client){ return String(normalizeClientKey(client) || '').replace(/[^a-z0-9]/g,''); }
function clientProfileTrigger(client){
  const name = esc(client || '—');
  if(IS_PMO_PRODUCTION || !client) return name;
  return `<button type="button" class="auth-link" style="padding:0;font-size:inherit;font-weight:900;text-align:left" title="Open client profile" onclick="openClientProfile('${clientTermsKey(client)}')">${name}</button>`;
}
function loadClientTerms(){
  if(location.protocol === 'file:' || !currentUser) return Promise.resolve();
  if(clientTermsLoading) return clientTermsLoading;
  clientTermsLoading = (async () => {
    try{
      const response = await fetch('/api/notes', {cache:'no-store', credentials:'same-origin'});
      if(response.ok){
        const result = await response.json().catch(()=>({}));
        clientTerms = new Map((result.client_terms || []).map(row => [row.client_key, row]));
      }
    }catch(e){ /* sin red: el panel muestra lo que haya */ }
    finally{ clientTermsLoading = null; }
  })();
  return clientTermsLoading;
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
async function openClientProfile(key){
  clientProfileKey = key;
  const modal = document.getElementById('clientProfileModal');
  if(!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  setClientProfileMessage('', '');
  renderClientProfile(true);
  await loadClientTerms();
  if(clientProfileKey === key) renderClientProfile(false);
}
function closeClientProfile(){
  const modal = document.getElementById('clientProfileModal');
  if(modal){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }
  clientProfileKey = '';
}
function renderClientProfile(loading){
  const cov = clientProfileCoverage(clientProfileKey) || {};
  const terms = clientTerms.get(clientProfileKey) || {};
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
  const termsHtml = loading
    ? '<p>Loading billing terms…</p>'
    : CLIENT_TERMS_FIELDS.map(({field, label, options}) => {
        const value = terms[field] || '';
        const control = canEdit
          ? `<select id="clientTerms_${field}">${['', ...options].map(opt => `<option value="${esc(opt)}"${opt === value ? ' selected' : ''}>${esc(opt || '— Not set —')}</option>`).join('')}</select>`
          : `<div style="font-weight:700">${esc(value || 'Not set')}</div>`;
        return `<div class="auth-field"><label${canEdit ? ` for="clientTerms_${field}"` : ''}>${esc(label)}</label>${control}</div>`;
      }).join('');
  const updated = (!loading && terms.updated_at)
    ? `<p style="margin:0">Last updated ${esc(String(terms.updated_at).slice(0,10))}${terms.updated_by ? ` by ${esc(terms.updated_by)}` : ''}</p>`
    : '';
  body.innerHTML = coverageHtml + termsHtml + updated;
  if(actions){
    actions.innerHTML = `<button class="btn btn-ghost btn-sm" type="button" onclick="closeClientProfile()">Close</button>`
      + (canEdit && !loading ? `<button class="btn btn-primary btn-sm" type="button" id="clientProfileSaveBtn" onclick="saveClientProfile()">Save</button>` : '');
  }
}
async function saveClientProfile(){
  const key = clientProfileKey;
  if(!key) return;
  const cov = clientProfileCoverage(key) || {};
  const payload = {type:'client_terms', client_key:key, client:cov.client || ''};
  CLIENT_TERMS_FIELDS.forEach(({field}) => {
    const el = document.getElementById(`clientTerms_${field}`);
    payload[field] = el ? el.value : '';
  });
  const btn = document.getElementById('clientProfileSaveBtn');
  if(btn) btn.disabled = true;
  setClientProfileMessage('', '');
  try{
    const response = await fetch('/api/notes', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
    if(result.client_terms) clientTerms.set(key, result.client_terms);
    if(clientProfileKey === key){
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
""",
"Client profile: JS")


for path, content in files.items():
    pathlib.Path(path).write_text(content, encoding="utf-8")
print("Listo.")
