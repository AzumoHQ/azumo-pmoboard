#!/usr/bin/env python3
"""
Accounts → Team → "Extend": diálogo para cargar la nueva fecha de fin y actualizar el issue Assignment (AA) en Jira.

Corre desde la raíz del repo:  python3 patch_extend_assignment.py
Toca: lib/jira-client.js, api/assignments.js  (backend)   y   redesign/accounts-hub.js  (front).
Requiere JIRA_WRITEBACK_ENABLED=true en Vercel (es el mismo guard que ya usa api/admin.js para editar Jira).
Si un ancla no da exactamente 1 match, el script se frena sin escribir nada.
"""
import pathlib

files = {p: pathlib.Path(p).read_text(encoding="utf-8")
         for p in ("lib/jira-client.js", "api/assignments.js", "redesign/accounts-hub.js")}

def apply(path, old, new, label):
    c = files[path].count(old)
    assert c == 1, f"[{label}] esperado 1 match en {path}, encontrados {c}"
    files[path] = files[path].replace(old, new, 1)
    print(f"OK: {label}")

# ───────────────────────── lib/jira-client.js ─────────────────────────
apply("lib/jira-client.js",
"""// ── PSA report comments (read-only, loaded on demand when a report is expanded) ──""",
"""// Extend an existing Assignment (AA): only the due date changes. Same guard as the other in-place
// Jira edits (updateIssueFields refuses to run unless JIRA_WRITEBACK_ENABLED=true).
async function extendAaAssignment(key, dueDate, submitter = {}, reason = '') {
  const issueKey = String(key || '').trim().toUpperCase();
  if (!/^AA-\\d+$/.test(issueKey)) throw new Error('Invalid assignment key');
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(dueDate || ''))) throw new Error('Invalid due date');

  const issue = await jiraRequest(`/rest/api/3/issue/${issueKey}?fields=issuetype,duedate,${AA_FORM_FIELDS.startDate},summary`);
  if (String(issue?.fields?.issuetype?.id) !== AA_ASSIGNMENT_ISSUE_TYPE_ID) {
    throw new Error(`${issueKey} is not an Assignment ticket`);
  }
  const previous = issue.fields.duedate || '';
  const start = issue.fields[AA_FORM_FIELDS.startDate] || '';
  if (start && dueDate < start) throw new Error(`The new end date is before the assignment start date (${start})`);
  if (previous === dueDate) throw new Error('The end date is already that date');

  await updateIssueFields(issueKey, { duedate: dueDate });

  // Audit trail in the ticket. The date change is already saved, so a failing comment must not fail the request.
  try {
    const who = submitter.name || submitter.email || 'unknown user';
    const lines = [
      `Due date changed from ${previous || '(empty)'} to ${dueDate} from PMO Board by ${who}${submitter.email ? ` (${submitter.email})` : ''}.`,
      String(reason || '').trim().slice(0, 2000)
    ].filter(Boolean);
    await jiraRequest(`/rest/api/3/issue/${issueKey}/comment`, 'POST', { body: adfFromPlainText(lines.join('\\n\\n')) });
  } catch (error) {
    console.warn('AA extend: comment not added:', error.message);
  }

  return { key: issueKey, previous, dueDate, url: `${JIRA_BASE_URL}/browse/${issueKey}` };
}

// ── PSA report comments (read-only, loaded on demand when a report is expanded) ──""",
"extendAaAssignment()")

apply("lib/jira-client.js",
"  createAaAssignment,\n  getPsaStatusReportMeta,",
"  createAaAssignment,\n  extendAaAssignment,\n  getPsaStatusReportMeta,",
"export extendAaAssignment")

# ───────────────────────── api/assignments.js ─────────────────────────
apply("api/assignments.js",
"const { getAaAssignmentMeta, createAaAssignment } = require('../lib/jira-client');",
"const { getAaAssignmentMeta, createAaAssignment, extendAaAssignment } = require('../lib/jira-client');",
"import")

apply("api/assignments.js",
"module.exports = async function assignmentsHandler(req, res) {\n  if (req.method !== 'GET' && req.method !== 'POST') {",
"""// PATCH: extend an existing assignment (new due date). Body: { key: 'AA-123', dueDate: 'YYYY-MM-DD', reason?: string }
async function handleExtend(req, res, user) {
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const key = String(body.key || '').trim().toUpperCase();
  const dueDate = String(body.dueDate || '').trim();
  if (!/^AA-\\d+$/.test(key)) { res.status(400).json({ error: 'Assignment key is required' }); return; }
  if (!isIsoDate(dueDate)) { res.status(400).json({ error: 'New end date is required' }); return; }
  try {
    const result = await extendAaAssignment(key, dueDate, { email: user.email, name: user.name }, String(body.reason || ''));
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('assignments extend failed:', error.message);
    const disabled = /write-back is disabled/i.test(error.message);
    const own = /^(Invalid|The new end date|The end date|AA-\\d+ is not)/.test(error.message);
    res.status(disabled ? 503 : own ? 400 : 502).json({ error: disabled ? error.message : own ? error.message : `Jira rejected the change: ${error.message.slice(0, 400)}` });
  }
}

module.exports = async function assignmentsHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {""",
"handler: PATCH")

apply("api/assignments.js",
"  if (req.method === 'POST') {\n    await handleCreate(req, res, user);\n    return;\n  }",
"  if (req.method === 'POST') {\n    await handleCreate(req, res, user);\n    return;\n  }\n  if (req.method === 'PATCH') {\n    await handleExtend(req, res, user);\n    return;\n  }",
"dispatch PATCH")

# ───────────────────────── redesign/accounts-hub.js ─────────────────────────
H = "redesign/accounts-hub.js"
# 1) la persona queda con la key/fecha del assignment que termina primero (antes la key era la de la primera fila)
apply(H,
"      else if(r.due && (!cur.due || r.due < cur.due)) cur.due = r.due;",
"      else if(r.due && (!cur.due || r.due < cur.due)){ cur.due = r.due; if(r.key) cur.key = r.key; }",
"peopleFor: key del assignment con la fecha más próxima")

# 2) botón
apply(H,
"""onclick="AH.changeAssignment(' + i + ')">' + ico('event_repeat') + 'Extend / change</button>""",
"""onclick="AH.extendAssignment(' + i + ')">' + ico('event_repeat') + 'Extend</button>""",
"botón Extend")

# 3) lógica del diálogo
apply(H,
"  // Hook into the board: re-render when our sections activate or data changes.",
"""  /* ---------- extend assignment (new end date → updates the AA Assignment in Jira) ---------- */
  var EX = {open:false, person:null, client:'', busy:false, msg:''};
  function exHost(){
    var m = document.getElementById('ahExtendModal');
    if(!m){
      m = document.createElement('div'); m.id = 'ahExtendModal'; m.className = 'auth-modal'; m.setAttribute('aria-hidden', 'true');
      m.addEventListener('click', function(ev){ if(ev.target === m) AH.closeExtend(); });
      document.body.appendChild(m);
    }
    return m;
  }
  function exRender(){
    var m = exHost(), p = EX.person;
    if(!EX.open || !p){ m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); return; }
    m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
    var cur = p.due ? String(p.due).slice(0,10) : '';
    var keep = {date:(document.getElementById('ahExDate') || {}).value, why:(document.getElementById('ahExWhy') || {}).value};
    m.innerHTML = '<div class="auth-card" style="max-width:460px">' +
      '<h3>Extend assignment</h3>' +
      '<p><b>' + e(p.name) + '</b> · ' + e(EX.client) + (p.key ? ' · <span class="ah-meta">' + e(p.key) + '</span>' : '') + '</p>' +
      '<div class="auth-field"><label>Current end date</label><div class="' + dueTone(daysFrom(cur)) + '" style="padding:6px 0">' + (cur ? fmt(cur) + (daysFrom(cur) < 0 ? ' (overdue)' : '') : '—') + '</div></div>' +
      '<div class="auth-field"><label for="ahExDate">New end date <span class="psa-req">*</span></label><input id="ahExDate" type="date" value="' + e(keep.date || '') + '"' + (cur ? ' min="' + e(cur) + '"' : '') + '></div>' +
      '<div class="auth-field"><label for="ahExWhy">Comment (optional)</label><textarea id="ahExWhy" rows="3" placeholder="Why is it being extended?">' + e(keep.why || '') + '</textarea></div>' +
      (EX.msg ? '<div class="ah-meta" style="margin:8px 0;color:' + (EX.msg.charAt(0) === '!' ? 'var(--neg)' : 'var(--muted)') + '">' + e(EX.msg.replace(/^!/, '')) + '</div>' : '') +
      '<div class="ah-meta" style="margin:6px 0 12px">Updates the due date of ' + (p.key ? e(p.key) : 'the Assignment ticket') + ' in Jira and adds a comment to it. ' +
        '<a href="#" onclick="AH.closeExtend();AH.changeAssignment(' + EX.index + ');return false;">Need to change something else? Open the full form</a></div>' +
      '<div class="auth-actions" style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button type="button" class="btn btn-ghost" onclick="AH.closeExtend()">Cancel</button>' +
        '<button type="button" class="btn btn-primary" onclick="AH.saveExtend()"' + (EX.busy ? ' disabled' : '') + '>' + (EX.busy ? 'Saving…' : 'Save new end date') + '</button>' +
      '</div></div>';
  }
  function exApplyLocal(key, due){
    // Keep the board's in-memory snapshot in step until the next sync brings the same change from Jira.
    try{
      var s = latest; if(!s) return;
      var fix = function(r){ if(r && r.key === key) r.due = due; };
      (s.assignment_rows || []).forEach(fix);
      (s.expiring_60d || []).forEach(fix);
      Object.keys(s.forecast || {}).forEach(function(mo){ (s.forecast[mo] || []).forEach(fix); });
    }catch(_){}
  }

  // Hook into the board: re-render when our sections activate or data changes.""",
"extend: helpers del diálogo")

apply(H,
"    changeAssignment: function(i){",
"""    extendAssignment: function(i){
      var a = account(S.key); if(!a) return; var p = a.people[i]; if(!p) return;
      // Without a ticket key (or still pending) there is nothing to extend: go to the full form like before.
      if(!p.key || p.pending){ AH.changeAssignment(i); return; }
      EX = {open:true, person:p, client:a.client, index:i, busy:false, msg:''}; exRender();
      setTimeout(function(){ var d = document.getElementById('ahExDate'); if(d) d.focus(); }, 0);
    },
    closeExtend: function(){ EX.open = false; exRender(); },
    saveExtend: function(){
      var p = EX.person; if(!p || EX.busy) return;
      var due = (document.getElementById('ahExDate') || {}).value || '';
      var why = (document.getElementById('ahExWhy') || {}).value || '';
      if(!due){ EX.msg = '!Pick the new end date.'; exRender(); return; }
      EX.busy = true; EX.msg = ''; exRender();
      fetch('/api/assignments', {method:'PATCH', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:p.key, dueDate:due, reason:why})})
        .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
        .then(function(j){
          exApplyLocal(p.key, j.dueDate || due);
          EX.open = false; EX.busy = false; exRender();
          S.msg = p.name + ' extended to ' + fmt(j.dueDate || due) + ' (' + p.key + ' updated in Jira)'; render();
          setTimeout(function(){ S.msg = ''; render(); }, 3500);
        })
        .catch(function(err){ EX.busy = false; EX.msg = '!' + err.message; exRender(); });
    },
    changeAssignment: function(i){""",
"extend: acciones AH")

for p, text in files.items():
    pathlib.Path(p).write_text(text, encoding="utf-8")
print("Listo.")
