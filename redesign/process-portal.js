/* PMO Board — Process Portal (preview only: window.PMO_LF).
   List page + one page per process with inline editing, following the
   Deep-Slate / Azumo Blue look & feel ("Portal de Procesos" design).
   Reads/writes the same /api/processes endpoints as the legacy modal. */
(function(){
  'use strict';
  if(!window.PMO_LF) return;

  // ---------- helpers ----------
  var H = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var DASH = '<span class="pp-faint">—</span>';
  var $ = function(sel, root){ return (root || document).querySelector(sel); };
  var canEdit = function(){ try{ return typeof canManageProcesses === 'function' && canManageProcesses(); }catch(e){ return false; } };
  var listState = function(){ try{ return PROCESS_MANAGER_STATE; }catch(e){ return {list: []}; } };
  var FREQ = function(){ try{ return PROCESS_FREQUENCY_LABEL; }catch(e){ return {}; } };
  var DAYS = {Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Daily:'Everyday'};
  var TYPES = [
    {v:'task', l:'Task'}, {v:'approval', l:'Approval'}, {v:'decision', l:'Decision'}, {v:'document', l:'Document'}
  ];
  var TYPE_LABEL = {task:'Task', approval:'Approval', decision:'Decision', document:'Document', start:'Start', end:'End',
    parallelogram:'Input / output', delay:'Delay', preparation:'Preparation', connector:'Connector', manual:'Manual'};
  var STATUS = {draft:{l:'Draft', c:''}, review:{l:'In review', c:'is-warn'}, published:{l:'Published', c:'is-pos'}};
  var isControl = function(s){ return s.node_type === 'approval' || s.node_type === 'decision'; };
  var initials = function(t){ return String(t || '').split(/[\s/]+/).filter(Boolean).slice(0, 2).map(function(w){ return w[0]; }).join('').toUpperCase() || '·'; };
  var num = function(v){ var n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  var fmtDays = function(n){ return n ? (Math.round(n * 10) / 10) + ' d' : '—'; };
  var pad = function(i){ return String(i + 1).padStart(2, '0'); };
  var norm = function(r){ return String(r || '').trim().toLowerCase(); };
  function ago(ts){
    if(!ts) return '';
    var t = new Date(ts).getTime(); if(!isFinite(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if(s < 60) return 'just now';
    if(s < 3600) return Math.round(s / 60) + 'm ago';
    if(s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }
  function slug(name){
    var base = String(name || 'process').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'process';
    var ids = new Set((listState().list || []).map(function(p){ return p.id; }));
    var id = base, n = 2;
    while(ids.has(id)) id = base + '-' + (n++);
    return id;
  }

  // ---------- state ----------
  var view = {mode: 'list', id: null, p: null, sel: null, layout: 'lanes', preview: false, editObjective: false, editRole: -1, query: ''};
  var save = {dirty: new Set(), timer: null, state: 'idle', at: null, err: ''};
  var root = null;

  // Company roles catalog (Admin -> Roles), same source as the legacy modal.
  // Loaded once; when it arrives, the open step editor is repainted.
  var catalog = {roles: [], state: 'idle'};
  function loadCatalog(){
    if(catalog.state !== 'idle') return;
    catalog.state = 'loading';
    fetch('/api/admin?action=roles-with-people', {credentials: 'same-origin', cache: 'no-store'})
      .then(function(r){ return r.ok ? r.json() : {roles: []}; })
      .then(function(j){
        catalog.roles = (j.roles || []).map(function(r){ return String(r.role_name || '').trim(); }).filter(Boolean)
          .sort(function(a, b){ return a.localeCompare(b); });
        catalog.state = 'done';
        if(view.p && view.sel && root) paint(['editor']);
      })
      .catch(function(){ catalog.state = 'idle'; });
  }

  function toModel(p){
    var m = JSON.parse(JSON.stringify(p || {}));
    m.status = m.status || 'published';
    m.scope_includes = Array.isArray(m.scope_includes) ? m.scope_includes : [];
    m.scope_excludes = Array.isArray(m.scope_excludes) ? m.scope_excludes : [];
    m.roles_responsibilities = Array.isArray(m.roles_responsibilities) ? m.roles_responsibilities : [];
    m.validations = Array.isArray(m.validations) ? m.validations : [];
    m.resources = Array.isArray(m.resources) ? m.resources : [];
    var steps = Array.isArray(m.steps) ? m.steps : [];
    var keyOf = {}; steps.forEach(function(s, i){ s._k = 'k' + i + '_' + Math.random().toString(36).slice(2, 7); keyOf[s.id] = s._k; });
    var ref = function(t){ return t === 0 ? 'END' : (t == null ? null : (keyOf[t] || null)); };
    steps.forEach(function(s){ s._yes = ref(s.yes_to); s._no = ref(s.returns_to); s.days = s.days == null ? null : s.days; });
    m.steps = steps;
    return m;
  }
  function stepsPayload(m){
    var pos = {}; m.steps.forEach(function(s, i){ pos[s._k] = i + 1; });
    var back = function(k){ return k === 'END' ? 0 : (k && pos[k] ? pos[k] : null); };
    return m.steps.map(function(s, i){
      var dec = s.node_type === 'decision';
      return {
        id: i + 1, role: s.role || '', title: s.title || ('Step ' + (i + 1)), desc: s.desc || '',
        node_type: s.node_type || 'task', outputs: s.outputs || null, days: s.days == null || s.days === '' ? null : num(s.days),
        inputs: s.inputs || null, required_info: s.required_info || null, system_tool: s.system_tool || null, sla: s.sla || null,
        jira_ref: s.jira_ref || null, related_doc_url: s.related_doc_url || null,
        day: s.day || null, time_of_day: s.time_of_day || null, icon: s.icon || null,
        has_auto: !!(s.has_auto || s.automation_url), automation_url: s.automation_url || null, automation_tool: s.automation_tool || null,
        form_url: s.form_url || null, has_docs: !!s.has_docs,
        yes_to: dec ? back(s._yes) : null, returns_to: dec ? back(s._no) : null
      };
    });
  }
  function processPayload(m){
    return {
      id: m.id, name: m.name, category: m.category || 'other', owner_role: m.owner_role || null, corresponsable_role: m.corresponsable_role || null,
      objective: m.objective || null, scope: m.scope || null, scope_includes: m.scope_includes, scope_excludes: m.scope_excludes,
      trigger_event: m.trigger_event || null, frequency: m.frequency || null,
      roles_responsibilities: m.roles_responsibilities.filter(function(r){ return (r.role || '').trim() || (r.responsibilities || '').trim(); }),
      related_processes: m.related_processes || [], last_reviewed: m.last_reviewed || null,
      review_cadence_months: m.review_cadence_months == null ? 6 : m.review_cadence_months, version: m.version || '1.00', status: m.status
    };
  }

  // ---------- saving (autosave) ----------
  function touch(parts){
    if(!canEdit() || !view.p) return;
    parts.forEach(function(x){ save.dirty.add(x); });
    save.state = 'pending'; paintSave();
    clearTimeout(save.timer);
    save.timer = setTimeout(flush, 700);
  }
  async function api(path, body){
    var r = await fetch('/api/processes' + path, {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    if(!r.ok){ var b = await r.json().catch(function(){ return {}; }); throw new Error(b.error || ('http ' + r.status)); }
    return r.json();
  }
  async function flush(){
    var m = view.p; if(!m || !save.dirty.size) return;
    var parts = Array.from(save.dirty); save.dirty.clear();
    save.state = 'saving'; paintSave();
    var id = encodeURIComponent(m.id);
    try{
      var out = null;
      if(parts.indexOf('process') > -1) out = await api('', processPayload(m));
      if(parts.indexOf('steps') > -1) out = await api('?id=' + id + '&action=steps', {steps: stepsPayload(m), source: 'portal'});
      if(parts.indexOf('validations') > -1) out = await api('?id=' + id + '&action=validations', {validations: m.validations});
      if(parts.indexOf('resources') > -1) out = await api('?id=' + id + '&action=resources', {resources: m.resources});
      save.state = 'saved'; save.at = Date.now(); save.err = '';
      if(out && out.process){
        m.updated_at = out.process.updated_at || m.updated_at;
        var L = listState().list || [], i = L.findIndex(function(x){ return x.id === m.id; });
        var fresh = Object.assign({}, out.process, {steps: stepsPayload(m).map(function(s){ return Object.assign({}, s); })});
        if(i > -1) L[i] = Object.assign({}, L[i], fresh); else L.push(fresh);
      }
    }catch(e){
      parts.forEach(function(x){ save.dirty.add(x); });
      save.state = 'error'; save.err = e.message;
    }
    paintSave();
    if(save.dirty.size && save.state !== 'error'){ clearTimeout(save.timer); save.timer = setTimeout(flush, 700); }
  }
  function paintSave(){
    var el = $('#ppSaveState'), btn = $('#ppSaveBtn');
    var st = save.state;
    if(st !== 'saving' && st !== 'error' && save.dirty.size) st = 'pending';
    var t = st === 'pending' ? 'Unsaved changes'
      : st === 'saving' ? 'Saving…'
      : st === 'error' ? '⚠ Could not save' + (save.err ? ': ' + save.err : '')
      : st === 'saved' ? 'All changes saved · ' + ago(save.at)
      : 'All changes saved';
    if(el){ el.textContent = t; el.className = 'pp-save' + (st === 'error' ? ' is-error' : st === 'pending' ? ' is-warn' : ''); }
    if(btn){
      btn.disabled = !(st === 'pending' || st === 'error');
      btn.textContent = st === 'saving' ? 'Saving…' : st === 'error' ? 'Retry save' : st === 'pending' ? 'Save' : 'Saved';
    }
  }
  setInterval(function(){ if(save.state === 'saved') paintSave(); var u = $('#ppUpdated'); if(u && view.p) u.textContent = ago(view.p.updated_at) || '—'; }, 30000);
  window.addEventListener('beforeunload', function(e){ if(save.dirty.size){ e.preventDefault(); e.returnValue = ''; } });
  // Cmd/Ctrl+S on a process page saves now instead of opening the browser's "Save page".
  document.addEventListener('keydown', function(e){
    if(!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== 's') return;
    if(view.mode !== 'detail' || !view.p || !canEdit()) return;
    e.preventDefault(); clearTimeout(save.timer); flush();
  });

  // ---------- dialog ----------
  function dialog(opts){
    return new Promise(function(resolve){
      var wrap = document.createElement('div');
      wrap.className = 'pp-scrim';
      wrap.innerHTML = '<div class="pp-dialog" role="dialog" aria-modal="true" aria-labelledby="ppDlgT">' +
        '<div class="pp-dialog-title" id="ppDlgT">' + H(opts.title) + '</div>' +
        (opts.body ? '<div class="pp-dialog-body">' + H(opts.body) + '</div>' : '') +
        (opts.input ? '<input class="pp-input" id="ppDlgIn" type="text" placeholder="' + H(opts.input) + '">' : '') +
        '<div class="pp-dialog-actions"><button type="button" class="btn btn-ghost btn-sm" data-r="0">Cancel</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-r="1">' + H(opts.ok || 'OK') + '</button></div></div>';
      document.body.appendChild(wrap);
      var input = $('#ppDlgIn', wrap);
      var done = function(ok){ wrap.remove(); document.removeEventListener('keydown', key); resolve(ok ? (input ? input.value.trim() : true) : null); };
      var key = function(e){ if(e.key === 'Escape') done(false); if(e.key === 'Enter' && input && document.activeElement === input) done(true); };
      document.addEventListener('keydown', key);
      wrap.addEventListener('click', function(e){ if(e.target === wrap) done(false); var b = e.target.closest('[data-r]'); if(b) done(b.dataset.r === '1'); });
      (input || $('[data-r="0"]', wrap)).focus();
    });
  }

  // ---------- mounting ----------
  function mount(){
    var sec = document.getElementById('processes'); if(!sec) return null;
    sec.classList.add('pp-on');
    var r = document.getElementById('ppRoot');
    if(!r){
      r = document.createElement('div'); r.id = 'ppRoot';
      var anchor = sec.querySelector('.lf-page-sub') || sec.querySelector('.sec-head');
      if(anchor) anchor.insertAdjacentElement('afterend', r); else sec.prepend(r);
      r.addEventListener('click', onClick);
      r.addEventListener('input', onInput);
      r.addEventListener('change', onChange);
      r.addEventListener('keydown', onKey);
    }
    root = r;
    return r;
  }
  function render(){
    if(!mount()) return;
    document.getElementById('processes').classList.toggle('pp-detail-open', view.mode === 'detail');
    if(view.mode === 'detail' && view.p) renderDetail(); else renderList();
  }

  // ---------- list page ----------
  function renderList(){
    var L = (listState().list || []).slice().sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
    var q = norm(view.query);
    var rows = L.filter(function(p){ return !q || norm([p.name, p.owner_role, p.objective, p.category].join(' ')).indexOf(q) > -1; });
    var health = function(p){ try{ return computeProcessHealth({lastReviewed: p.last_reviewed, reviewCadenceMonths: p.review_cadence_months}); }catch(e){ return null; } };
    var hPill = function(h){ if(!h) return DASH; var c = h.level === 'green' ? 'is-pos' : h.level === 'yellow' ? 'is-warn' : 'is-neg'; return '<span class="pp-pill ' + c + '">' + H(h.label) + '</span>'; };
    var body = rows.map(function(p){
      var st = STATUS[p.status] || STATUS.published;
      var steps = p.steps || [];
      var d = steps.reduce(function(a, s){ return a + num(s.days); }, 0);
      return '<tr class="pp-row-link" data-open="' + H(p.id) + '" tabindex="0">' +
        '<td><div class="pp-step-title">' + H(p.name) + '</div><div class="pp-step-desc">' + H(processCatLabel(p.category)) + '</div></td>' +
        '<td>' + (p.owner_role ? H(p.owner_role) : DASH) + '</td>' +
        '<td class="pp-r mono">' + (steps.length || DASH) + '</td>' +
        '<td class="pp-r mono">' + (d ? fmtDays(d) : DASH) + '</td>' +
        '<td><span class="pp-pill ' + st.c + '">' + st.l + '</span></td>' +
        '<td>' + hPill(health(p)) + '</td>' +
        '<td class="pp-faint">' + (ago(p.updated_at) || '—') + '</td></tr>';
    }).join('');
    root.innerHTML =
      '<div class="pp-toolbar">' +
        '<input class="pp-input pp-search" type="search" placeholder="Search processes, roles…" value="' + H(view.query) + '" data-act="search" aria-label="Search processes">' +
        (canEdit() ? '<button type="button" class="btn btn-primary btn-sm" data-act="new">+ New process</button>' : '') +
      '</div>' +
      '<div class="pp-card">' +
        '<div class="pp-card-head"><div class="pp-card-title">Processes</div><div class="pp-card-sub">' + L.length + ' documented · click a row to open it</div></div>' +
        (rows.length ? '<div class="pp-table-wrap"><table class="pp-table"><thead><tr><th>Process</th><th>Owner</th><th class="pp-r">Steps</th><th class="pp-r">Duration</th><th>Status</th><th>Review</th><th>Updated</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
          '<div class="pp-table-foot"><span class="mono">' + rows.length + '</span> of <span class="mono">' + L.length + '</span></div>'
          : '<p class="pp-empty">' + (L.length ? 'No processes match that search.' : (canEdit() ? 'No processes documented yet. Use “New process” to document the first one.' : 'No processes documented yet.')) + '</p>') +
      '</div>';
  }
  function processCatLabel(c){ try{ return processCategoryLabel(c); }catch(e){ return c || 'Other'; } }

  // ---------- detail page ----------
  function lanesOf(m){
    var lanes = [], seen = {};
    var add = function(role){
      var k = norm(role) || '__none';
      if(seen[k]) return; seen[k] = true;
      var rr = m.roles_responsibilities.find(function(r){ return norm(r.role) === k; }) || {};
      lanes.push({k: k, role: role || 'Unassigned', person: rr.person || ''});
    };
    m.roles_responsibilities.forEach(function(r){ if((r.role || '').trim()) add(r.role.trim()); });
    m.steps.forEach(function(s){ add((s.role || '').trim()); });
    return lanes.filter(function(l){ return m.steps.some(function(s){ return (norm(s.role) || '__none') === l.k; }) || l.k !== '__none'; });
  }
  function issues(m){
    var out = [];
    if(!m.steps.length) out.push('no steps yet');
    var noRole = m.steps.filter(function(s){ return !(s.role || '').trim(); }).length;
    var noDel = m.steps.filter(function(s){ return s.node_type !== 'decision' && !(s.outputs || '').trim(); }).length;
    if(noDel) out.push(noDel + ' step' + (noDel > 1 ? 's' : '') + ' without deliverable');
    if(noRole) out.push(noRole + ' step' + (noRole > 1 ? 's' : '') + ' without role');
    if(!(m.objective || '').trim()) out.push('objective is empty');
    return out;
  }
  function renderDetail(){
    var m = view.p, edit = canEdit() && !view.preview;
    var st = STATUS[m.status] || STATUS.published;
    var iss = issues(m);
    var actions = '';
    if(canEdit()){
      actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="print">Export PDF</button>';
      actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="preview">' + (view.preview ? 'Exit preview' : 'Preview') + '</button>';
      if(!view.preview){
        // Explicit save: autosave keeps running, this makes it visible and lets people force it.
        actions += '<button type="button" class="btn btn-ghost btn-sm" id="ppSaveBtn" data-act="save-now" title="Changes save automatically · Cmd/Ctrl+S" disabled>Saved</button>';
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="settings" title="ID, category, version, last review, related processes">Settings</button>';
        if(m.status === 'draft') actions += '<button type="button" class="btn btn-primary btn-sm" data-act="to-review"' + (iss.length ? ' disabled title="Complete the items in the warning first"' : '') + '>Send to review</button>';
        if(m.status === 'review') actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="to-draft">Back to draft</button><button type="button" class="btn btn-primary btn-sm" data-act="publish">Publish</button>';
        if(m.status === 'published') actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="to-draft">Move to draft</button>';
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="delete-process">Delete</button>';
      }
    } else {
      actions += '<button type="button" class="btn btn-ghost btn-sm" data-act="print">Export PDF</button>';
    }
    var health = null; try{ health = computeProcessHealth({lastReviewed: m.last_reviewed, reviewCadenceMonths: m.review_cadence_months}); }catch(e){}
    var banner = '';
    if(edit && m.status !== 'published' && iss.length) banner = '<div class="pp-banner">⚠ To send to review: ' + H(iss.join(' · ')) + '</div>';
    else if(m.status === 'published' && health && health.level !== 'green') banner = '<div class="pp-banner' + (health.level === 'red' ? ' is-neg' : '') + '">⚠ ' + H(health.label) + ' · ' + (m.last_reviewed ? 'last reviewed ' + H(m.last_reviewed) : 'no review on record') + ' · reviews every ' + H(m.review_cadence_months == null ? 6 : m.review_cadence_months) + ' mo</div>';

    root.innerHTML =
      '<div class="pp-crumbs"><button type="button" class="pp-link" data-act="back">Processes</button><span class="pp-faint"> / </span><span>' + H(m.name) + '</span></div>' +
      '<div class="pp-head">' +
        '<div class="pp-head-copy">' +
          '<div class="pp-title-row">' + (edit
            ? '<input class="pp-title-input" data-f="name" value="' + H(m.name) + '" aria-label="Process name">'
            : '<h3 class="pp-title">' + H(m.name) + '</h3>') +
            '<span class="pp-pill ' + st.c + '">' + st.l + '</span></div>' +
          '<div class="pp-meta">Owner: ' + (m.owner_role ? H(m.owner_role) : '—') + ' · v' + H(m.version || '1.00') + ' · updated <span id="ppUpdated">' + (ago(m.updated_at) || '—') + '</span>' +
            (edit ? ' · <span id="ppSaveState" class="pp-save" role="status" aria-live="polite"></span>' : '') + '</div>' +
        '</div>' +
        '<div class="pp-actions">' + actions + '</div>' +
      '</div>' +
      banner +
      '<div class="pp-kpis" id="ppKpis"></div>' +
      '<div class="pp-cols"><div class="pp-card" id="ppObjective"></div><div class="pp-card" id="ppRoles"></div></div>' +
      '<div class="pp-card" id="ppFlow"></div>' +
      '<div id="ppStepEditor"></div>' +
      '<div class="pp-card" id="ppTable"></div>' +
      '<div class="pp-cols"><div class="pp-card" id="ppValidations"></div><div class="pp-card" id="ppResources"></div></div>';
    paintSave();
    paint(['kpis', 'objective', 'roles', 'flow', 'editor', 'table', 'validations', 'resources']);
  }
  function paint(regions){
    var m = view.p, edit = canEdit() && !view.preview;
    regions.forEach(function(r){
      var el;
      if(r === 'kpis' && (el = $('#ppKpis'))) el.innerHTML = kpisHtml(m);
      if(r === 'objective' && (el = $('#ppObjective'))) el.innerHTML = objectiveHtml(m, edit);
      if(r === 'roles' && (el = $('#ppRoles'))) el.innerHTML = rolesHtml(m, edit);
      if(r === 'flow' && (el = $('#ppFlow'))){ el.innerHTML = flowHtml(m, edit); drawConnectors(); }
      if(r === 'editor' && (el = $('#ppStepEditor'))) el.innerHTML = editorHtml(m, edit);
      if(r === 'table' && (el = $('#ppTable'))) el.innerHTML = tableHtml(m, edit);
      if(r === 'validations' && (el = $('#ppValidations'))) el.innerHTML = listCardHtml('validations', 'Validations', 'Checks that prove the process worked', m.validations.map(function(v){ return {t: v}; }), edit, '+ Add validation and Enter', 'pos');
      if(r === 'resources' && (el = $('#ppResources'))) el.innerHTML = listCardHtml('resources', 'Resources', 'Tools and files used · “Label | https://…”', m.resources.map(function(x){ return {t: x.label, url: x.url}; }), edit, '+ Add resource and Enter', '');
    });
  }
  function kpisHtml(m){
    var lanes = lanesOf(m).filter(function(l){ return l.k !== '__none'; });
    var days = m.steps.reduce(function(a, s){ return a + num(s.days); }, 0);
    var ctl = m.steps.filter(isControl).length;
    var noRole = m.steps.filter(function(s){ return !(s.role || '').trim(); }).length;
    var withPerson = m.roles_responsibilities.filter(function(r){ return (r.person || '').trim(); }).length;
    var k = function(label, value, note, tone){ return '<div class="pp-kpi' + (tone ? ' is-' + tone : '') + '"><div class="pp-kpi-label">' + label + '</div><div class="pp-kpi-value mono">' + value + '</div><div class="pp-kpi-note">' + note + '</div></div>'; };
    return k('Steps', m.steps.length || DASH, m.steps.length ? 'in ' + lanes.length + ' role' + (lanes.length === 1 ? '' : 's') : 'add the first step') +
      k('Estimated duration', days ? H(fmtDays(days)) : DASH, 'sequential sum of steps') +
      k('Roles', m.roles_responsibilities.length || DASH, noRole ? '⚠ ' + noRole + ' step' + (noRole > 1 ? 's' : '') + ' without role' : (m.roles_responsibilities.length ? withPerson + ' with a current person' : 'none yet'), noRole ? 'warn' : '') +
      k('Approvals', ctl, 'control points', ctl ? 'warn' : '');
  }
  function objectiveHtml(m, edit){
    var list = function(kind, items, mark, ph){
      return '<div><div class="pp-label">' + (kind === 'inc' ? 'Includes' : 'Does not include') + '</div><ul class="pp-list pp-scope">' +
        items.map(function(t, i){ return '<li><span class="pp-mark' + (kind === 'inc' ? ' is-pos' : '') + '">' + mark + '</span><span class="pp-li-t">' + H(t) + '</span>' +
          (edit ? '<button type="button" class="pp-x" data-act="del-' + kind + '" data-i="' + i + '" aria-label="Remove">×</button>' : '') + '</li>'; }).join('') +
        (items.length || edit ? '' : '<li>' + DASH + '</li>') + '</ul>' +
        (edit ? '<input class="pp-input pp-add" data-add="' + kind + '" placeholder="' + ph + '">' : '') + '</div>';
    };
    var related = ''; try{ related = processRelatedHtml(processRelations(m, listState().list)); }catch(e){}
    var freqOpts = '<option value="">—</option>' + Object.keys(FREQ()).map(function(k){ return '<option value="' + k + '"' + (m.frequency === k ? ' selected' : '') + '>' + H(FREQ()[k]) + '</option>'; }).join('');
    var body = view.editObjective && edit
      ? '<textarea class="pp-input pp-area" data-f="objective" rows="3" placeholder="What the process solves and when it is considered done">' + H(m.objective || '') + '</textarea>' +
        '<div class="pp-split pp-split-tight"><label class="pp-field"><span class="pp-label">Trigger</span><input class="pp-input" data-f="trigger_event" value="' + H(m.trigger_event || '') + '" placeholder="SOW signed, Every Friday EOD…"></label>' +
        '<label class="pp-field"><span class="pp-label">Frequency</span><select class="pp-input" data-f="frequency">' + freqOpts + '</select></label></div>' +
        '<label class="pp-field"><span class="pp-label">Scope notes</span><textarea class="pp-input pp-area" data-f="scope" rows="2" placeholder="Starts when · Ends when">' + H(m.scope || '') + '</textarea></label>'
      : '<p class="pp-text">' + (m.objective ? H(m.objective) : DASH) + '</p>' +
        ((m.trigger_event || m.frequency || m.scope) ? '<div class="pp-facts">' +
          (m.trigger_event ? '<div><span class="pp-label">Trigger</span><span>' + H(m.trigger_event) + '</span></div>' : '') +
          (FREQ()[m.frequency] ? '<div><span class="pp-label">Frequency</span><span>' + H(FREQ()[m.frequency]) + '</span></div>' : '') +
          (m.scope ? '<div><span class="pp-label">Scope</span><span>' + H(m.scope) + '</span></div>' : '') + '</div>' : '');
    return '<div class="pp-card-head pp-head-row"><div><div class="pp-card-title">Objective</div><div class="pp-card-sub">What this process solves and when it is considered done</div></div>' +
        (edit ? '<button type="button" class="btn btn-ghost btn-sm" data-act="edit-objective">' + (view.editObjective ? 'Done' : 'Edit') + '</button>' : '') + '</div>' +
      '<div class="pp-card-body">' + body +
        '<div class="pp-split">' + list('inc', m.scope_includes, '+', '+ Add item and Enter') + list('exc', m.scope_excludes, '–', '+ Add item and Enter') + '</div>' +
        related + '</div>';
  }
  function rolesHtml(m, edit){
    var rows = m.roles_responsibilities.map(function(r, i){
      var steps = m.steps.filter(function(s){ return norm(s.role) === norm(r.role); });
      var d = steps.reduce(function(a, s){ return a + num(s.days); }, 0);
      var owner = m.owner_role && norm(m.owner_role) === norm(r.role), co = m.corresponsable_role && norm(m.corresponsable_role) === norm(r.role);
      if(edit && view.editRole === i){
        return '<div class="pp-role-row is-editing">' +
          '<span class="pp-avatar">' + H(initials(r.role)) + '</span>' +
          '<div class="pp-role-edit">' +
            '<div class="pp-role-edit-grid">' +
              '<input class="pp-input" data-rf="role" data-i="' + i + '" value="' + H(r.role || '') + '" placeholder="Role (e.g. PMO)">' +
              '<input class="pp-input" data-rf="person" data-i="' + i + '" value="' + H(r.person || '') + '" placeholder="Current person (optional)">' +
            '</div>' +
            '<input class="pp-input" data-rf="responsibilities" data-i="' + i + '" value="' + H(r.responsibilities || '') + '" placeholder="[Role] — [verb] [object] [when]">' +
            '<div class="pp-role-edit-actions">' +
              '<button type="button" class="btn btn-ghost btn-sm' + (owner ? ' is-on' : '') + '" data-act="owner" data-i="' + i + '" aria-pressed="' + (owner ? 'true' : 'false') + '">Owner</button>' +
              '<button type="button" class="btn btn-ghost btn-sm' + (co ? ' is-on' : '') + '" data-act="co" data-i="' + i + '" aria-pressed="' + (co ? 'true' : 'false') + '">Co-responsible</button>' +
              '<span class="pp-grow"></span>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="del-role" data-i="' + i + '">Delete</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="done-role">Done</button>' +
            '</div></div></div>';
      }
      return '<div class="pp-role-row' + (edit ? ' is-clickable' : '') + '"' + (edit ? ' data-act="edit-role" data-i="' + i + '" tabindex="0"' : '') + '>' +
        '<span class="pp-avatar">' + H(initials(r.role)) + '</span>' +
        '<div class="pp-role-main"><div class="pp-role-name">' + H(r.role || '—') + (r.person ? ' <span class="pp-person">· ' + H(r.person) + '</span>' : '') +
          (owner ? '<span class="pp-pill is-brand">Owner</span>' : '') + (co ? '<span class="pp-pill">Co-responsible</span>' : '') + '</div>' +
          '<div class="pp-role-desc">' + (r.responsibilities ? H(r.responsibilities) : DASH) + '</div></div>' +
        '<div class="pp-role-count mono">' + steps.length + ' step' + (steps.length === 1 ? '' : 's') + '<br><span class="pp-faint">' + H(fmtDays(d)) + '</span></div></div>';
    }).join('');
    return '<div class="pp-card-head"><div class="pp-card-title">Roles &amp; responsibilities</div><div class="pp-card-sub">One lane per role · ' + (edit ? 'click a row to edit it' : 'roles, never names') + '</div></div>' +
      '<div class="pp-roles">' + (rows || '<p class="pp-empty">No roles documented yet.</p>') + '</div>' +
      (edit ? '<div class="pp-card-body pp-add-row"><input class="pp-input pp-add" data-add="role" placeholder="+ New role and Enter"></div>' : '');
  }

  // flow
  var CARD_W = 172, CARD_H = 74, COL = 196, LANE_H = 98, LABEL_W = 150;
  function flowHtml(m, edit){
    var days = m.steps.reduce(function(a, s){ return a + num(s.days); }, 0);
    var head = '<div class="pp-card-head pp-head-row"><div><div class="pp-card-title">Process flow</div><div class="pp-card-sub">' +
      m.steps.length + ' steps' + (days ? ' · ' + H(fmtDays(days).replace(' d', ' days')) : '') + ' · amber = approval / decision' +
      (edit ? ' · ← → navigate · Alt+← → move · Del deletes' : '') + '</div></div>' +
      '<div class="pp-flow-tools"><div class="lf-seg pp-seg" role="group" aria-label="Layout">' +
        '<button type="button" data-act="layout" data-v="lanes" class="' + (view.layout === 'lanes' ? 'active' : '') + '" aria-pressed="' + (view.layout === 'lanes') + '">By role</button>' +
        '<button type="button" data-act="layout" data-v="linear" class="' + (view.layout === 'linear' ? 'active' : '') + '" aria-pressed="' + (view.layout === 'linear') + '">Linear</button></div>' +
        (edit ? '<button type="button" class="btn btn-primary btn-sm" data-act="add-step">+ Add step</button>' : '') + '</div></div>';
    if(!m.steps.length) return head + '<p class="pp-empty">No steps yet' + (edit ? ' — use “+ Add step”.' : '.') + '</p>';
    var card = function(s, i, style){
      var ctl = isControl(s), sel = view.sel === s._k;
      var who = s.role ? H(s.role) : '<span class="pp-faint">no role</span>';
      var lane = m.roles_responsibilities.find(function(r){ return norm(r.role) === norm(s.role); });
      if(view.layout === 'lanes' && lane && lane.person) who = H(lane.person);
      var meta = (s.days ? '<span class="mono">' + H(fmtDays(num(s.days))) + '</span> · ' : '') + who;
      var badges = (ctl ? '<span class="pp-pill is-warn">' + (s.node_type === 'decision' ? 'Decision' : 'Approval') + '</span>' : '') + ((s.has_auto || s.automation_url) ? '<span class="pp-auto" title="Automated step">⚡</span>' : '');
      return '<button type="button" class="pp-node' + (ctl ? ' is-ctl' : '') + (sel ? ' is-sel' : '') + '" data-k="' + s._k + '" data-act="select" style="' + style + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
        '<span class="pp-node-top"><span class="pp-node-num mono">' + pad(i) + '</span>' + badges + '</span>' +
        '<span class="pp-node-title">' + H(s.title || 'Untitled step') + '</span>' +
        '<span class="pp-node-meta">' + meta + '</span></button>';
    };
    if(view.layout === 'linear'){
      return head + '<div class="pp-flow pp-flow-linear" data-flow>' + m.steps.map(function(s, i){ return card(s, i, '') + (i < m.steps.length - 1 ? '<span class="pp-arrow" aria-hidden="true">→</span>' : ''); }).join('') + '</div>';
    }
    var lanes = lanesOf(m), li = {};
    lanes.forEach(function(l, i){ li[l.k] = i; });
    var W = LABEL_W + 20 + m.steps.length * COL + 10, Hh = lanes.length * LANE_H;
    var lanesHtml = lanes.map(function(l, i){
      return '<div class="pp-lane" style="top:' + (i * LANE_H) + 'px;height:' + LANE_H + 'px"><div class="pp-lane-label" style="width:' + LABEL_W + 'px"><div class="pp-lane-role">' + H(l.role) + '</div>' + (l.person ? '<div class="pp-lane-person">' + H(l.person) + '</div>' : '') + '</div></div>';
    }).join('');
    var nodes = m.steps.map(function(s, i){
      var row = li[norm(s.role) || '__none'] || 0;
      return card(s, i, 'position:absolute;left:' + (LABEL_W + 20 + i * COL) + 'px;top:' + (row * LANE_H + (LANE_H - CARD_H) / 2) + 'px;width:' + CARD_W + 'px;height:' + CARD_H + 'px');
    }).join('');
    return head + '<div class="pp-flow-scroll"><div class="pp-flow pp-flow-lanes" data-flow style="width:' + W + 'px;height:' + Hh + 'px">' + lanesHtml +
      '<svg class="pp-wires" width="' + W + '" height="' + Hh + '" aria-hidden="true"></svg>' + nodes + '</div></div>';
  }
  function drawConnectors(){
    var svg = $('.pp-wires', root); if(!svg || view.layout !== 'lanes') return;
    var m = view.p, lanes = lanesOf(m), li = {}; lanes.forEach(function(l, i){ li[l.k] = i; });
    var cx = function(i){ return LABEL_W + 20 + i * COL; }, cy = function(s){ return (li[norm(s.role) || '__none'] || 0) * LANE_H + LANE_H / 2; };
    var pos = {}; m.steps.forEach(function(s, i){ pos[s._k] = i; });
    var out = '<defs><marker id="ppArr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--muted)"/></marker>' +
      '<marker id="ppArrNo" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--forecast)"/></marker></defs>';
    m.steps.forEach(function(s, i){
      if(i === m.steps.length - 1) return;
      var dec = s.node_type === 'decision', n = m.steps[i + 1];
      if(dec && s._yes && s._yes !== n._k && s._no !== n._k) return;
      var x1 = cx(i) + CARD_W, y1 = cy(s), x2 = cx(i + 1), y2 = cy(n), mx = x1 + (x2 - x1) / 2;
      out += '<path d="M' + x1 + ',' + y1 + ' H' + mx + ' V' + y2 + ' H' + (x2 - 2) + '" fill="none" stroke="var(--border-strong)" stroke-width="1.5" marker-end="url(#ppArr)"/>';
      if(dec) out += '<text x="' + (mx + 4) + '" y="' + (y1 - 5) + '" font-size="10" font-weight="600" fill="' + (s._no === n._k ? 'var(--forecast)' : 'var(--pos)') + '">' + (s._no === n._k ? 'No' : 'Yes') + '</text>';
    });
    m.steps.forEach(function(s, i){
      if(s.node_type !== 'decision') return;
      [['Yes', s._yes], ['No', s._no]].forEach(function(b){
        var t = b[1]; if(!t) return;
        var j = t === 'END' ? m.steps.length : pos[t]; if(j == null || j === i + 1) return;
        var x1 = cx(i) + CARD_W / 2, y1 = cy(s) + CARD_H / 2, x2 = j >= m.steps.length ? cx(m.steps.length - 1) + CARD_W : cx(j) + CARD_W / 2;
        var y2 = j >= m.steps.length ? cy(m.steps[m.steps.length - 1]) : cy(m.steps[j]) + CARD_H / 2;
        var yy = Math.max(y1, y2) + 18, no = b[0] === 'No';
        out += '<path d="M' + x1 + ',' + y1 + ' V' + yy + ' H' + x2 + ' V' + (y2 + 2) + '" fill="none" stroke="' + (no ? 'var(--forecast)' : 'var(--pos)') + '" stroke-width="1.4"' + (no ? ' stroke-dasharray="5,4"' : '') + ' marker-end="url(#ppArr' + (no ? 'No' : '') + ')"/>' +
          '<text x="' + ((x1 + x2) / 2) + '" y="' + (yy - 4) + '" font-size="10" font-weight="600" text-anchor="middle" fill="' + (no ? 'var(--forecast)' : 'var(--pos)') + '">' + b[0] + (t === 'END' ? ' → End' : '') + '</text>';
      });
    });
    svg.innerHTML = out;
  }

  // step editor
  function editorHtml(m, edit){
    var i = m.steps.findIndex(function(s){ return s._k === view.sel; });
    if(i < 0) return '';
    var s = m.steps[i];
    var roles = []; m.roles_responsibilities.forEach(function(r){ if((r.role || '').trim() && roles.indexOf(r.role.trim()) < 0) roles.push(r.role.trim()); });
    if(s.role && roles.indexOf(s.role) < 0) roles.push(s.role);
    // Company roles not yet in this process
    if(edit) loadCatalog();
    var known = roles.map(norm);
    var company = catalog.roles.filter(function(r){ return known.indexOf(norm(r)) < 0; });
    var when = s.day ? [DAYS[s.day] || s.day, s.time_of_day].filter(Boolean).join(' · ') : '';
    if(!edit){
      return '<div class="pp-card"><div class="pp-card-head"><div class="pp-card-title"><span class="mono pp-faint">' + pad(i) + '</span> ' + H(s.title) + '</div>' +
        '<div class="pp-card-sub">' + [s.role, TYPE_LABEL[s.node_type] || 'Task', s.days ? fmtDays(num(s.days)) : '', when].filter(Boolean).map(H).join(' · ') + '</div></div>' +
        '<div class="pp-card-body"><p class="pp-text">' + (s.desc ? H(s.desc) : DASH) + '</p>' +
        '<div class="pp-facts"><div><span class="pp-label">Deliverable</span><span>' + (s.outputs ? H(s.outputs) : DASH) + '</span></div>' +
        (s.form_url ? '<div><span class="pp-label">Link</span><a href="' + H(s.form_url) + '" target="_blank" rel="noopener">' + H(s.form_url) + ' ↗</a></div>' : '') +
        (s.automation_url ? '<div><span class="pp-label">Automation</span><a href="' + H(s.automation_url) + '" target="_blank" rel="noopener">' + H(s.automation_url) + ' ↗</a></div>' : '') + '</div></div></div>';
    }
    var opt = function(v, l, cur){ return '<option value="' + H(v) + '"' + (cur === v ? ' selected' : '') + '>' + H(l) + '</option>'; };
    var targets = function(cur){ return '<option value="">Next step</option>' + m.steps.map(function(t, j){ return t._k === s._k ? '' : opt(t._k, pad(j) + ' · ' + (t.title || 'Untitled'), cur); }).join('') + opt('END', 'End of process', cur); };
    var dec = s.node_type === 'decision';
    return '<div class="pp-card pp-editor"><div class="pp-card-head pp-head-row"><div><div class="pp-card-title">Step <span class="mono">' + pad(i) + '</span></div><div class="pp-card-sub">Action verb + object + where · one action per step</div></div>' +
      '<div class="pp-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="move" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move left">←</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="move" data-d="1"' + (i === m.steps.length - 1 ? ' disabled' : '') + ' aria-label="Move right">→</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="del-step">Delete</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="close-step">Close</button></div></div>' +
      '<div class="pp-card-body pp-form">' +
        '<label class="pp-field pp-span2"><span class="pp-label">Step</span><input class="pp-input" data-sf="title" value="' + H(s.title || '') + '" placeholder="Create the Epic in Azumo Assignments"></label>' +
        '<label class="pp-field"><span class="pp-label">Role</span><select class="pp-input" data-sf="role">' + opt('', '— role —', s.role || '') +
          (company.length && roles.length ? '<optgroup label="This process">' : '') + roles.map(function(r){ return opt(r, r, s.role); }).join('') + (company.length && roles.length ? '</optgroup>' : '') +
          (company.length ? '<optgroup label="Company roles">' + company.map(function(r){ return opt(r, r, s.role); }).join('') + '</optgroup>' : '') +
          '</select></label>' +
        '<label class="pp-field"><span class="pp-label">Type</span><select class="pp-input" data-sf="node_type">' + TYPES.map(function(t){ return opt(t.v, t.l, s.node_type || 'task'); }).join('') +
          (TYPE_LABEL[s.node_type] && !TYPES.some(function(t){ return t.v === s.node_type; }) ? opt(s.node_type, TYPE_LABEL[s.node_type], s.node_type) : '') + '</select></label>' +
        '<label class="pp-field"><span class="pp-label">Deliverable</span><input class="pp-input" data-sf="outputs" value="' + H(s.outputs || '') + '" placeholder="Signed contract, staffing confirmed…"></label>' +
        '<label class="pp-field"><span class="pp-label">Days</span><input class="pp-input mono" data-sf="days" type="number" min="0" step="0.5" value="' + H(s.days == null ? '' : s.days) + '" placeholder="—"></label>' +
        '<label class="pp-field pp-span2"><span class="pp-label">Description (optional)</span><textarea class="pp-input pp-area" data-sf="desc" rows="2" placeholder="When · Input · Do · Output">' + H(s.desc || '') + '</textarea></label>' +
        (dec ? '<label class="pp-field"><span class="pp-label">If yes →</span><select class="pp-input" data-sf="_yes">' + targets(s._yes || '') + '</select></label>' +
               '<label class="pp-field"><span class="pp-label">If no →</span><select class="pp-input" data-sf="_no">' + opt('', '— no “No” path —', s._no || '') + m.steps.map(function(t, j){ return t._k === s._k ? '' : opt(t._k, pad(j) + ' · ' + (t.title || 'Untitled'), s._no || ''); }).join('') + opt('END', 'End of process', s._no || '') + '</select></label>' : '') +
        '<label class="pp-field"><span class="pp-label">Day</span><select class="pp-input" data-sf="day">' + opt('', '—', s.day || '') + ['Daily', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(function(d){ return opt(d, DAYS[d], s.day); }).join('') + '</select></label>' +
        '<label class="pp-field"><span class="pp-label">Time</span><select class="pp-input" data-sf="time_of_day">' + opt('', '—', s.time_of_day || '') + ['Morning', 'Afternoon', 'Evening'].map(function(d){ return opt(d, d, s.time_of_day); }).join('') + '</select></label>' +
        '<label class="pp-field"><span class="pp-label">Link (tool or form)</span><input class="pp-input" data-sf="form_url" type="url" value="' + H(s.form_url || '') + '" placeholder="https://…"></label>' +
        '<label class="pp-field"><span class="pp-label">Automation link</span><input class="pp-input" data-sf="automation_url" type="url" value="' + H(s.automation_url || '') + '" placeholder="https://…"></label>' +
        '<label class="pp-check"><input type="checkbox" data-sf="has_auto"' + ((s.has_auto || s.automation_url) ? ' checked' : '') + '> ⚡ Done by a system (automated)</label>' +
        '<label class="pp-check"><input type="checkbox" data-sf="has_docs"' + (s.has_docs ? ' checked' : '') + '> 📄 Produces or needs a document</label>' +
      '</div></div>';
  }
  function tableHtml(m, edit){
    var days = m.steps.reduce(function(a, s){ return a + num(s.days); }, 0);
    var ctl = m.steps.filter(isControl).length;
    var noDel = m.steps.filter(function(s){ return s.node_type !== 'decision' && !(s.outputs || '').trim(); }).length;
    var rows = m.steps.map(function(s, i){
      var lane = m.roles_responsibilities.find(function(r){ return norm(r.role) === norm(s.role); });
      var t = s.node_type || 'task', ctlS = isControl(s);
      var branch = ''; try{ branch = processBranchText(Object.assign({}, s, {yes_to: s._yes === 'END' ? 0 : (s._yes ? m.steps.findIndex(function(x){ return x._k === s._yes; }) + 1 : null), returns_to: s._no === 'END' ? 0 : (s._no ? m.steps.findIndex(function(x){ return x._k === s._no; }) + 1 : null)}), stepsPayload(m)); }catch(e){}
      return '<tr class="pp-row-link' + (view.sel === s._k ? ' is-sel' : '') + '" data-act="select" data-k="' + s._k + '" tabindex="0">' +
        '<td class="pp-num mono">' + pad(i) + '</td>' +
        '<td class="pp-step"><div class="pp-step-title">' + H(s.title || 'Untitled step') + ((s.has_auto || s.automation_url) ? ' <span title="Automated step">⚡</span>' : '') + '</div>' + (s.desc ? '<div class="pp-step-desc">' + H(s.desc) + '</div>' : '') + branch + '</td>' +
        '<td>' + (lane && lane.person ? '<div class="pp-ink">' + H(lane.person) + '</div><div class="pp-step-desc">' + H(s.role) + '</div>' : (s.role ? '<span class="pp-ink">' + H(s.role) + '</span>' : DASH)) + '</td>' +
        '<td>' + (s.outputs ? H(s.outputs) : (t === 'decision' ? DASH : '<span class="pp-warn-t">⚠ missing</span>')) + '</td>' +
        '<td><span class="pp-pill' + (ctlS ? ' is-warn' : '') + '">' + H(TYPE_LABEL[t] || 'Task') + '</span></td>' +
        '<td class="pp-r mono">' + (s.days ? H(String(num(s.days))) : DASH) + '</td></tr>';
    }).join('');
    return '<div class="pp-card-head"><div class="pp-card-title">Step detail</div><div class="pp-card-sub">Same order as the flow · click a row to select it</div></div>' +
      (m.steps.length ? '<div class="pp-table-wrap"><table class="pp-table"><thead><tr><th>#</th><th>Step</th><th>Role</th><th>Deliverable</th><th>Type</th><th class="pp-r">Days</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="pp-table-foot"><span class="mono">' + m.steps.length + '</span> steps · <span class="mono">' + (days ? Math.round(days * 10) / 10 : 0) + '</span> estimated days · <span class="mono">' + ctl + '</span> approval' + (ctl === 1 ? '' : 's') +
        (noDel ? ' · <span class="pp-warn-t">⚠ ' + noDel + ' without deliverable</span>' : '') + '</div>'
        : '<p class="pp-empty">No steps yet.</p>');
  }
  function listCardHtml(kind, title, sub, items, edit, ph, tone){
    return '<div class="pp-card-head"><div class="pp-card-title">' + title + '</div><div class="pp-card-sub">' + sub + '</div></div><div class="pp-card-body">' +
      (items.length ? '<ul class="pp-list">' + items.map(function(it, i){
        return '<li><span class="pp-mark' + (tone ? ' is-' + tone : '') + '">' + (tone ? '✓' : '·') + '</span><span class="pp-li-t">' +
          (it.url ? '<a href="' + H(it.url) + '" target="_blank" rel="noopener">' + H(it.t) + ' ↗</a>' : H(it.t)) + '</span>' +
          (edit ? '<button type="button" class="pp-x" data-act="del-' + kind + '" data-i="' + i + '" aria-label="Remove">×</button>' : '') + '</li>';
      }).join('') + '</ul>' : (edit ? '' : '<p class="pp-text">' + DASH + '</p>')) +
      (edit ? '<input class="pp-input pp-add" data-add="' + kind + '" placeholder="' + ph + '">' : '') + '</div>';
  }

  // ---------- events ----------
  function open(id){
    var p = (listState().list || []).find(function(x){ return x.id === id; });
    if(!p) return;
    view.mode = 'detail'; view.id = id; view.p = toModel(p); view.sel = null; view.preview = false; view.editObjective = false; view.editRole = -1;
    save.state = 'idle'; save.dirty.clear();
    render();
    var sec = document.getElementById('processes'); if(sec) sec.scrollIntoView({block: 'start'});
  }
  async function leave(){ if(save.dirty.size){ clearTimeout(save.timer); await flush(); } view.mode = 'list'; view.p = null; view.id = null; render(); }
  function selectStep(k, focus){
    view.sel = view.sel === k && !focus ? null : k;
    paint(['flow', 'editor', 'table']);
    var n = view.sel && root.querySelector('.pp-node[data-k="' + view.sel + '"]');
    if(n){ n.focus({preventScroll: !focus}); if(focus) n.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
  }
  function moveStep(d){
    var m = view.p, i = m.steps.findIndex(function(s){ return s._k === view.sel; }), j = i + d;
    if(i < 0 || j < 0 || j >= m.steps.length) return;
    var t = m.steps[i]; m.steps[i] = m.steps[j]; m.steps[j] = t;
    touch(['steps']); paint(['flow', 'editor', 'table', 'kpis']);
    var n = root.querySelector('.pp-node[data-k="' + view.sel + '"]'); if(n) n.focus();
  }
  async function deleteStep(){
    var m = view.p, i = m.steps.findIndex(function(s){ return s._k === view.sel; }); if(i < 0) return;
    var ok = await dialog({title: 'Delete step ' + pad(i) + '?', body: '“' + (m.steps[i].title || 'Untitled step') + '” will be removed from this process.', ok: 'Delete'});
    if(!ok) return;
    var k = m.steps[i]._k; m.steps.splice(i, 1);
    m.steps.forEach(function(s){ if(s._yes === k) s._yes = null; if(s._no === k) s._no = null; });
    view.sel = m.steps[Math.min(i, m.steps.length - 1)] ? m.steps[Math.min(i, m.steps.length - 1)]._k : null;
    touch(['steps']); paint(['kpis', 'roles', 'flow', 'editor', 'table']); refreshBanner();
  }
  function refreshBanner(){ if(view.p && root) { var y = window.scrollY; renderDetail(); window.scrollTo(0, y); } }
  async function setStatus(s){
    if(s === 'review' && issues(view.p).length) return;
    view.p.status = s; touch(['process']); clearTimeout(save.timer); await flush(); refreshBanner();
  }
  async function newProcess(){
    var name = await dialog({title: 'New process', body: 'Name it as an outcome, with a verb: “Assign a person to a project”.', input: 'Process name', ok: 'Create'});
    if(!name) return;
    var p = {id: slug(name), name: name, status: 'draft', category: 'other', version: '1.00', steps: [], roles_responsibilities: [], validations: [], resources: [], scope_includes: [], scope_excludes: []};
    try{
      var out = await api('', p);
      var L = listState().list; L.push(Object.assign({}, out.process || p, {steps: []}));
      open(p.id);
    }catch(e){ await dialog({title: 'Could not create the process', body: e.message, ok: 'OK'}); }
  }
  async function deleteProcess(){
    var m = view.p;
    var ok = await dialog({title: 'Delete “' + m.name + '”?', body: 'This removes its steps, validations and resources too.', ok: 'Delete'});
    if(!ok) return;
    try{
      var r = await fetch('/api/processes?id=' + encodeURIComponent(m.id), {method: 'DELETE', credentials: 'same-origin'});
      if(!r.ok) throw new Error('http ' + r.status);
      var L = listState().list, i = L.findIndex(function(x){ return x.id === m.id; }); if(i > -1) L.splice(i, 1);
      save.dirty.clear(); view.mode = 'list'; view.p = null; render();
    }catch(e){ await dialog({title: 'Could not delete the process', body: e.message, ok: 'OK'}); }
  }

  function onClick(e){
    var a = e.target.closest('[data-act],[data-open]'); if(!a || !root.contains(a)) return;
    if(a.dataset.open){ open(a.dataset.open); return; }
    var act = a.dataset.act, m = view.p, i = a.dataset.i != null ? Number(a.dataset.i) : -1;
    switch(act){
      case 'new': newProcess(); break;
      case 'back': leave(); break;
      case 'print': window.print(); break;
      case 'preview': view.preview = !view.preview; view.sel = null; renderDetail(); break;
      case 'settings': if(typeof openProcessForm === 'function'){ var os = function(){ openProcessForm(m.id, {settingsOnly: true}); }; if(save.dirty.size){ clearTimeout(save.timer); flush().then(os); } else os(); } break;
      case 'save-now': clearTimeout(save.timer); flush(); break;
      case 'to-review': setStatus('review'); break;
      case 'publish': setStatus('published'); break;
      case 'to-draft': setStatus('draft'); break;
      case 'retry': clearTimeout(save.timer); flush(); break;
      case 'delete-process': deleteProcess(); break;
      case 'edit-objective': view.editObjective = !view.editObjective; paint(['objective']); break;
      case 'del-inc': m.scope_includes.splice(i, 1); touch(['process']); paint(['objective']); break;
      case 'del-exc': m.scope_excludes.splice(i, 1); touch(['process']); paint(['objective']); break;
      case 'del-validations': m.validations.splice(i, 1); touch(['validations']); paint(['validations']); break;
      case 'del-resources': m.resources.splice(i, 1); touch(['resources']); paint(['resources']); break;
      case 'edit-role': if(e.target.closest('input,button:not([data-act="edit-role"])')) return; view.editRole = i; paint(['roles']); var f = root.querySelector('[data-rf="role"][data-i="' + i + '"]'); if(f) f.focus(); break;
      case 'done-role': view.editRole = -1; paint(['roles', 'flow', 'table', 'kpis']); refreshBanner(); break;
      case 'owner': m.owner_role = norm(m.owner_role) === norm(m.roles_responsibilities[i].role) ? null : m.roles_responsibilities[i].role; touch(['process']); refreshBanner(); break;
      case 'co': m.corresponsable_role = norm(m.corresponsable_role) === norm(m.roles_responsibilities[i].role) ? null : m.roles_responsibilities[i].role; touch(['process']); paint(['roles']); break;
      case 'del-role': m.roles_responsibilities.splice(i, 1); view.editRole = -1; touch(['process']); paint(['roles', 'flow', 'kpis', 'editor']); break;
      case 'layout': view.layout = a.dataset.v; paint(['flow']); break;
      case 'add-step':
        var role = '';
        var cur = m.steps.find(function(s){ return s._k === view.sel; });
        if(cur) role = cur.role || ''; else if(m.roles_responsibilities[0]) role = m.roles_responsibilities[0].role || '';
        var ns = {_k: 'k' + Date.now(), title: '', role: role, node_type: 'task', desc: '', outputs: '', days: null};
        var at = cur ? m.steps.indexOf(cur) + 1 : m.steps.length;
        m.steps.splice(at, 0, ns); view.sel = ns._k;
        touch(['steps']); paint(['kpis', 'flow', 'editor', 'table', 'roles']);
        var tf = root.querySelector('[data-sf="title"]'); if(tf) tf.focus();
        break;
      case 'select': selectStep(a.dataset.k); break;
      case 'move': moveStep(Number(a.dataset.d)); break;
      case 'del-step': deleteStep(); break;
      case 'close-step': view.sel = null; paint(['flow', 'editor', 'table']); break;
    }
  }
  function onInput(e){
    var t = e.target, m = view.p;
    if(t.dataset.act === 'search'){ view.query = t.value; var pos = t.selectionStart; renderList(); var s = root.querySelector('.pp-search'); if(s){ s.focus(); try{ s.setSelectionRange(pos, pos); }catch(_){} } return; }
    if(!m) return;
    if(t.dataset.f){
      m[t.dataset.f] = t.value; touch(['process']);
      if(t.dataset.f === 'name'){ var c = root.querySelector('.pp-crumbs span:last-child'); if(c) c.textContent = t.value; }
      return;
    }
    if(t.dataset.rf){
      var r = m.roles_responsibilities[Number(t.dataset.i)]; if(!r) return;
      if(t.dataset.rf === 'role'){
        var old = r.role;
        m.steps.forEach(function(s){ if(norm(s.role) === norm(old) && old) s.role = t.value; });
        if(old && norm(m.owner_role) === norm(old)) m.owner_role = t.value;
        if(old && norm(m.corresponsable_role) === norm(old)) m.corresponsable_role = t.value;
        touch(['steps']);
      }
      r[t.dataset.rf] = t.value; touch(['process']);
      paint(['flow', 'table', 'kpis']);
      return;
    }
    if(t.dataset.sf && t.type !== 'checkbox' && t.tagName !== 'SELECT'){
      var s = m.steps.find(function(x){ return x._k === view.sel; }); if(!s) return;
      s[t.dataset.sf] = t.dataset.sf === 'days' ? (t.value === '' ? null : t.value) : t.value;
      if(t.dataset.sf === 'automation_url' && t.value) s.has_auto = true;
      touch(['steps']); paint(['flow', 'table', 'kpis']);
    }
  }
  function onChange(e){
    var t = e.target, m = view.p; if(!m) return;
    if(t.dataset.f && t.tagName === 'SELECT'){ m[t.dataset.f] = t.value || null; touch(['process']); return; }
    if(t.dataset.sf && (t.type === 'checkbox' || t.tagName === 'SELECT')){
      var s = m.steps.find(function(x){ return x._k === view.sel; }); if(!s) return;
      var f = t.dataset.sf;
      if(t.type === 'checkbox'){ s[f] = t.checked; if(f === 'has_auto' && !t.checked) s.automation_url = s.automation_url || null; }
      else if(f === '_no'){ s._no = t.value || null; }
      else if(f === '_yes'){ s._yes = t.value || null; }
      else s[f] = t.value || (f === 'node_type' ? 'task' : '');
      // A company role picked for a step becomes a role of this process (Roles & responsibilities)
      if(f === 'role' && t.value && !m.roles_responsibilities.some(function(r){ return norm(r.role) === norm(t.value); })){
        m.roles_responsibilities.push({role: t.value, responsibilities: '', person: ''});
        touch(['process']); paint(['roles']);
      }
      touch(['steps']);
      paint(f === 'node_type' ? ['kpis', 'flow', 'editor', 'table'] : ['flow', 'table', 'kpis']);
      if(f === 'node_type' || f === 'role') refreshBannerSoft();
    }
  }
  function refreshBannerSoft(){ var b = root.querySelector('.pp-banner'); var iss = issues(view.p); if(b && view.p.status !== 'published'){ if(iss.length) b.textContent = '⚠ To send to review: ' + iss.join(' · '); else b.remove(); } }
  function onKey(e){
    var t = e.target, m = view.p;
    if(t.classList && t.classList.contains('pp-add') && e.key === 'Enter'){
      e.preventDefault();
      var v = t.value.trim(); if(!v || !m) return;
      var kind = t.dataset.add;
      if(kind === 'inc'){ m.scope_includes.push(v); touch(['process']); paint(['objective']); }
      if(kind === 'exc'){ m.scope_excludes.push(v); touch(['process']); paint(['objective']); }
      if(kind === 'role'){ m.roles_responsibilities.push({role: v, responsibilities: '', person: ''}); touch(['process']); paint(['roles', 'flow', 'kpis', 'editor']); }
      if(kind === 'validations'){ m.validations.push(v); touch(['validations']); paint(['validations']); }
      if(kind === 'resources'){ var parts = v.split('|'); m.resources.push({label: parts[0].trim(), url: (parts[1] || '').trim() || null, kind: 'resource'}); touch(['resources']); paint(['resources']); }
      var again = root.querySelector('.pp-add[data-add="' + kind + '"]'); if(again) again.focus();
      return;
    }
    if(t.classList && t.classList.contains('pp-row-link') && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); t.click(); return; }
    if(t.dataset && t.dataset.act === 'edit-role' && e.key === 'Enter'){ t.click(); return; }
    if(t.classList && t.classList.contains('pp-node') && m){
      var i = m.steps.findIndex(function(s){ return s._k === t.dataset.k; });
      if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
        e.preventDefault();
        var d = e.key === 'ArrowRight' ? 1 : -1;
        if(e.altKey && canEdit() && !view.preview){ view.sel = t.dataset.k; moveStep(d); return; }
        var n = m.steps[i + d]; if(n) selectStep(n._k, true);
      }
      if((e.key === 'Delete' || e.key === 'Backspace') && canEdit() && !view.preview){ e.preventDefault(); view.sel = t.dataset.k; deleteStep(); }
    }
  }

  // ---------- public API (called from index.html) ----------
  window.ProcessPortal = {
    onList: function(){
      if(view.mode === 'detail' && view.id){
        var p = (listState().list || []).find(function(x){ return x.id === view.id; });
        if(p && !save.dirty.size && save.state !== 'saving'){ var sel = view.sel; view.p = toModel(p); var keep = view.p.steps[ (view.p.steps.findIndex(function(s){ return s._k === sel; })) ]; view.sel = keep ? keep._k : null; }
        if(!p){ view.mode = 'list'; view.p = null; }
      }
      render();
      return true;
    },
    open: open
  };
  if(document.readyState !== 'loading') { try{ if(listState().loaded) render(); }catch(e){} }
  else document.addEventListener('DOMContentLoaded', function(){ try{ if(listState().loaded) render(); }catch(e){} });
})();
