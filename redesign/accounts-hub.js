/* Accounts hub + My Portfolio (IA proposal 1b / 1c).
   Accounts = one page per client: overview, team, status reports, terms per SOW, documents.
   My Portfolio = PM home: to-dos, my accounts, my people. Reads the board's globals
   (latest, clientProjects, psaProjectStatusData…) and reuses its Jira forms. */
(function(){
  var S = { view:'list', key:'', tab:'overview', q:'', filter:'all', docFilter:'All', pm:null, draft:null, docForm:false, docs:null, docsLoading:false, msg:'' };
  var DOC_TYPES = ['SOW','Transcript','Report','Other'];
  var DOC_ICON = {SOW:'contract', Transcript:'graphic_eq', Report:'summarize', Other:'link'};
  var TERMS = [
    {field:'tracking', label:'Tracking', options:['Hourly','Day Rate']},
    {field:'cycle', label:'Billing cycle', options:['Week','Month','Milestone']},
    {field:'project_type', label:'Type of project', options:['T&M','Fixed']}
  ];
  var CADENCE_DAYS = 14;

  function e(s){ return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function k(s){ return typeof clientTermsKey === 'function' ? clientTermsKey(s) : String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function snap(){ try{ return latest || null; }catch(_){ return null; } }
  function canEdit(){ try{ return canRunRefresh(); }catch(_){ return false; } }
  function role(){ try{ return effectiveUserRole(); }catch(_){ return ''; } }
  function userName(){ try{ var u = (typeof effectiveSessionUser === 'function' && effectiveSessionUser()) || currentUser; return fullNameFromUser(u) || (u && u.name) || ''; }catch(_){ return ''; } }
  function terms(key){ try{ return clientProjects.get(key) || []; }catch(_){ return []; } }
  function psaAll(){ try{ return psaProjectStatusData || []; }catch(_){ return []; } }
  function ico(name){ return '<span class="msi ah-ico" aria-hidden="true">' + name + '</span>'; }
  function daysFrom(iso){ if(!iso) return null; var d = new Date(String(iso).slice(0,10) + 'T12:00:00'); return isNaN(d) ? null : Math.round((d - new Date()) / 864e5); }
  function fmt(iso){ if(!iso) return '—'; var d = new Date(String(iso).slice(0,10) + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US',{month:'short', day:'numeric', year:'numeric'}); }
  function monthEnd(ym){ var p = String(ym).split('-'); if(p.length < 2) return ''; var d = new Date(Number(p[0]), Number(p[1]), 0); return d.toISOString().slice(0,10); }
  function initials(n){ return String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(function(w){ return w[0]; }).join('').toUpperCase(); }
  function dueTone(d){ return d === null ? '' : d < 0 ? 'neg' : d <= 30 ? 'warn' : ''; }
  function dueText(iso){ var d = daysFrom(iso); if(d === null) return '—'; if(d < 0) return 'Overdue · ' + fmt(iso); if(d === 0) return 'Ends today'; return 'Ends ' + fmt(iso); }

  /* ---------- data ---------- */
  function rowsFor(snapshot){
    var out = [];
    (snapshot.assignment_rows || []).forEach(function(r){ out.push(r); });
    Object.keys(snapshot.forecast || {}).forEach(function(m){
      (snapshot.forecast[m] || []).forEach(function(r){ out.push(Object.assign({due: monthEnd(m)}, r)); });
    });
    (snapshot.expiring_60d || []).forEach(function(r){ out.push(r); });
    return out;
  }
  function peopleFor(client, rows, pending){
    var ck = k(client), map = new Map();
    rows.forEach(function(r){
      if(!r || !r.client || k(r.client) !== ck) return;
      var name = r.assignee || r.name; if(!name) return;
      var id = name.toLowerCase(), cur = map.get(id);
      if(!cur) map.set(id, {name:name, position:r.epic_position || r.position || '—', due:r.due || '', key:r.key || '', billing:r.billing});
      else if(r.due && (!cur.due || r.due < cur.due)){ cur.due = r.due; if(r.key) cur.key = r.key; }
    });
    pending.forEach(function(r){
      if(!r || k(r.client) !== ck) return;
      var id = String(r.assignee||'').toLowerCase();
      map.set(id, Object.assign({}, map.get(id) || {}, {name:r.assignee, position:r.position || '—', pending:true, start:r.start, key:r.key}));
    });
    return [...map.values()].sort(function(a,b){ return String(a.due||'9999').localeCompare(String(b.due||'9999')) || a.name.localeCompare(b.name); });
  }
  function psaFor(client){
    var ck = k(client);
    return psaAll().filter(function(p){ return !p.isClosed && k(p.epicName || '').indexOf(ck) === 0; })[0] || null;
  }
  function accounts(){
    var s = snap(); if(!s) return [];
    var names = new Map();
    function add(c){ if(!c || c === 'Bench' || c === 'Azumo') return; var key = k(c); if(key && !names.has(key)) names.set(key, c); }
    (s.active_clients || []).forEach(function(c){ add(typeof c === 'string' ? c : c.client); });
    (s.account_coverage || []).forEach(function(c){ add(c.client); });
    var rows = rowsFor(s), pending = s.pending_list || [];
    return [...names.entries()].map(function(pair){
      var key = pair[0], client = pair[1];
      var cov = (s.account_coverage || []).find(function(c){ return k(c.client) === key; }) || {};
      var people = peopleFor(client, rows, pending);
      var pmRow = people.find(function(p){ return /project manager|^pm$/i.test(p.position || ''); });
      var psa = psaFor(client);
      var last = psa && psa.lastReport ? psa.lastReport.date : null;
      var since = last ? -daysFrom(last) : null;
      var t = terms(key);
      return {
        key:key, client:client, people:people,
        pm: cov.pm_assigned || (psa && psa.pmAssigned && psa.pmAssigned.name) || (pmRow && pmRow.name) || '',
        csm: cov.csm_assigned || '', tl: cov.tl_assigned || '', status: cov.status || 'Active',
        psa:psa, lastReport:last, since:since,
        reportState: since === null ? 'none' : since > 30 ? 'stale' : since >= CADENCE_DAYS - 4 ? 'due' : 'ok',
        terms:t, docs: docsFor(key),
        ending: people.filter(function(p){ var d = daysFrom(p.due); return !p.pending && d !== null && d <= 30; }).length
      };
    }).sort(function(a,b){ return a.client.localeCompare(b.client); });
  }
  function account(key){ return accounts().find(function(a){ return a.key === key; }) || null; }

  /* ---------- documents (stored as notes tagged account-doc) ---------- */
  function docsFor(key){ return (S.docs || []).filter(function(d){ return d.client_key === key; }); }
  function parseDoc(n){
    if(!n) return null;
    var tags = n.tags || [];
    if(n.type === 'account_doc') return n;
    if(tags.indexOf('account-doc') === -1) return null;
    try{ var b = JSON.parse(n.body || '{}'); b.id = n.id; return b; }catch(_){ return null; }
  }
  function loadDocs(force){
    if(S.docsLoading || (S.docs && !force)) return Promise.resolve();
    if(location.protocol === 'file:'){ S.docs = S.docs || []; return Promise.resolve(); }
    S.docsLoading = true;
    return fetch('/api/notes', {cache:'no-store', credentials:'same-origin'})
      .then(function(r){ return r.ok ? r.json() : {notes:[]}; })
      .then(function(j){ S.docs = (j.notes || []).map(parseDoc).filter(Boolean); })
      .catch(function(){ S.docs = S.docs || []; })
      .finally(function(){ S.docsLoading = false; render(); });
  }
  function sourceOf(url){
    var u = String(url||'').toLowerCase();
    if(u.indexOf('granola') > -1) return 'Granola';
    if(u.indexOf('docs.google') > -1 || u.indexOf('drive.google') > -1) return 'Drive';
    if(u.indexOf('notion') > -1) return 'Notion';
    if(u.indexOf('atlassian') > -1 || u.indexOf('jira') > -1) return 'Jira';
    if(u.indexOf('sharepoint') > -1 || u.indexOf('onedrive') > -1) return 'OneDrive';
    return u ? 'Link' : '—';
  }
  function saveDoc(){
    var a = account(S.key); if(!a) return;
    var val = function(id){ return (document.getElementById(id) || {}).value || ''; };
    var doc = {client_key:a.key, client:a.client, doc_type:val('ahDocType') || 'Other', title:val('ahDocTitle').trim(), url:val('ahDocUrl').trim(), date:val('ahDocDate'), created_by:userName(), created_at:new Date().toISOString()};
    if(!doc.title || !doc.url){ S.msg = 'Title and link are required.'; render(); return; }
    doc.source = sourceOf(doc.url);
    fetch('/api/notes', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({title:'Account document: ' + doc.title, body:JSON.stringify(doc), tags:['account-doc', 'client:' + a.key]})})
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); })
      .then(function(){ S.docForm = false; S.msg = ''; return loadDocs(true); })
      .catch(function(err){ S.msg = 'Could not save: ' + err.message; render(); });
  }
  function deleteDoc(id){
    if(!id || !confirm('Remove this document link?')) return;
    fetch('/api/notes?id=' + encodeURIComponent(id), {method:'DELETE', credentials:'same-origin'}).finally(function(){ loadDocs(true); });
  }

  /* ---------- terms ---------- */
  function startDraft(a){ S.draft = (a.terms || []).map(function(p){ return {project:p.project || '', tracking:p.tracking || '', cycle:p.cycle || '', project_type:p.project_type || ''}; }); }
  function saveTerms(){
    var a = account(S.key); if(!a || !S.draft) return;
    var projects = S.draft.map(function(p){ return Object.assign({}, p, {project:String(p.project||'').trim()}); }).filter(function(p){ return p.project; });
    S.msg = 'Saving…'; render();
    fetch('/api/notes', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({type:'client_projects', client_key:a.key, client:a.client, projects:projects})})
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
      .then(function(j){ try{ clientProjects.set(a.key, j.client_projects || []); }catch(_){} S.draft = null; S.msg = 'Saved'; render(); setTimeout(function(){ S.msg = ''; render(); }, 1800); })
      .catch(function(err){ S.msg = 'Could not save: ' + err.message; render(); });
  }

  /* ---------- shared bits ---------- */
  function reportBadge(a){
    if(a.reportState === 'none') return '<span class="ah-pill neg">No report yet</span>';
    if(a.reportState === 'stale') return '<span class="ah-pill neg">Report overdue · ' + a.since + 'd</span>';
    if(a.reportState === 'due') return '<span class="ah-pill warn">Report due · ' + a.since + 'd ago</span>';
    return '<span class="ah-pill pos">Report ' + a.since + 'd ago</span>';
  }
  function termsChips(t){
    if(!t.length) return '<span class="ah-chip muted">Terms not set</span>';
    if(t.length === 1){ var p = t[0]; return [p.tracking, p.cycle, p.project_type].filter(Boolean).map(function(x){ return '<span class="ah-chip">' + e(x) + '</span>'; }).join('') || '<span class="ah-chip muted">Terms not set</span>'; }
    var uniq = function(f){ return [...new Set(t.map(function(p){ return p[f]; }).filter(Boolean))].join(' + '); };
    return '<span class="ah-chip">' + t.length + ' SOWs</span>' + ['project_type','cycle'].map(function(f){ var u = uniq(f); return u ? '<span class="ah-chip">' + e(u) + '</span>' : ''; }).join('');
  }
  function ragChips(r){
    if(!r) return '';
    return [['Project','projectStatus'],['Team','teamStatus'],['Client','clientStatus'],['Budget','budgetStatus']].map(function(d){
      var v = String(r[d[1]] || '').toLowerCase();
      return '<span class="ah-rag ' + (['green','yellow','red'].indexOf(v) > -1 ? v : '') + '" title="' + d[0] + ': ' + e(r[d[1]] || '—') + '">' + d[0] + '</span>';
    }).join('');
  }
  function emptyState(icon, title, sub, cta){
    return '<div class="ah-empty">' + ico(icon) + '<div class="ah-empty-title">' + e(title) + '</div>' + (sub ? '<div class="ah-empty-sub">' + e(sub) + '</div>' : '') + (cta || '') + '</div>';
  }

  /* ---------- Accounts: list ---------- */
  function renderList(host){
    var all = accounts();
    var q = S.q.trim().toLowerCase();
    var list = all.filter(function(a){
      if(q && (a.client + ' ' + a.pm + ' ' + a.people.map(function(p){ return p.name; }).join(' ')).toLowerCase().indexOf(q) === -1) return false;
      if(S.filter === 'report') return a.reportState === 'stale' || a.reportState === 'none' || a.reportState === 'due';
      if(S.filter === 'terms') return !a.terms.length;
      if(S.filter === 'ending') return a.ending > 0;
      return true;
    });
    var count = function(f){ return all.filter(f).length; };
    var filters = [
      ['all', 'All', all.length],
      ['report', 'Report due / overdue', count(function(a){ return a.reportState !== 'ok'; })],
      ['ending', 'Assignments ending ≤30d', count(function(a){ return a.ending > 0; })],
      ['terms', 'Terms not set', count(function(a){ return !a.terms.length; })]
    ];
    host.innerHTML =
      '<div class="ah-toolbar">' +
        '<label class="harvest-search ah-search">' + ico('search') + '<input type="search" placeholder="Search account, PM or person" value="' + e(S.q) + '" oninput="AH.search(this.value)"/></label>' +
        '<div class="ah-filters">' + filters.map(function(f){ return '<button type="button" class="action-filter ' + (S.filter === f[0] ? 'active' : '') + '" onclick="AH.filter(\'' + f[0] + '\')">' + e(f[1]) + ' <span class="ah-count">' + f[2] + '</span></button>'; }).join('') + '</div>' +
      '</div>' +
      (list.length ? '<div class="ah-grid">' + list.map(accountCard).join('') + '</div>' : emptyState('domain', 'No accounts match these filters', 'Clear the search or pick another filter.'));
    var input = host.querySelector('.ah-search input');
    if(input && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.ahFocus){ input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
  function accountCard(a){
    return '<button type="button" class="ah-card" onclick="AH.open(\'' + a.key + '\')">' +
      '<div class="ah-card-top"><span class="ah-avatar">' + e(initials(a.client)) + '</span><div class="ah-card-name"><b>' + e(a.client) + '</b><span>' + (a.pm ? 'PM ' + e(a.pm) : 'No PM assigned') + '</span></div></div>' +
      '<div class="ah-chips">' + termsChips(a.terms) + '</div>' +
      '<div class="ah-card-foot">' + reportBadge(a) + '<span class="ah-meta">' + a.people.length + ' people' + (a.ending ? ' · <b class="warn">' + a.ending + ' ending</b>' : '') + ' · ' + a.docs.length + ' docs</span></div>' +
    '</button>';
  }

  /* ---------- Accounts: detail ---------- */
  function renderDetail(host){
    var a = account(S.key);
    if(!a){ S.view = 'list'; return renderList(host); }
    var tabs = [['overview','Overview',''],['team','Team',a.people.length],['reports','Status reports',a.psa ? (a.psa.reports || []).length : 0],['terms','Terms',a.terms.length],['docs','Documents',a.docs.length]];
    var body = {overview:tabOverview, team:tabTeam, reports:tabReports, terms:tabTerms, docs:tabDocs}[S.tab] || tabOverview;
    host.innerHTML =
      '<div class="ah-crumbs"><button type="button" onclick="AH.back()">' + ico('arrow_back') + 'Accounts</button><span>/</span><b>' + e(a.client) + '</b></div>' +
      '<div class="ah-head">' +
        '<div class="ah-head-id"><span class="ah-avatar lg">' + e(initials(a.client)) + '</span><div><div class="ah-head-name">' + e(a.client) + ' <span class="ah-pill pos">' + e(a.status) + '</span></div>' +
          '<div class="ah-roles">' + [['PM',a.pm],['CSM',a.csm],['TL',a.tl]].map(function(r){ return '<span>' + r[0] + ' ' + (r[1] ? '<b>' + e(r[1]) + '</b>' : '<b class="neg">Missing</b>') + '</span>'; }).join('') + '</div></div></div>' +
        '<div class="btn-row"><button class="btn btn-primary btn-sm" type="button" onclick="AH.newReport()">' + ico('add') + 'New status report</button></div>' +
      '</div>' +
      '<div class="ah-tabs" role="tablist">' + tabs.map(function(t){ return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="ah-tab ' + (S.tab === t[0] ? 'active' : '') + '" onclick="AH.tab(\'' + t[0] + '\')">' + e(t[1]) + (t[2] !== '' ? '<span class="ah-count">' + t[2] + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="ah-body">' + body(a) + '</div>';
  }
  function tabOverview(a){
    var nextDue = a.lastReport ? CADENCE_DAYS - a.since : null;
    var kpis = [
      ['People assigned', a.people.length, a.ending ? a.ending + ' ending in 30 days or overdue' : 'No assignments ending soon', a.ending ? 'warn' : ''],
      ['Last status report', a.lastReport ? a.since + ' days' : '—', a.lastReport ? (nextDue < 0 ? 'Next one overdue by ' + (-nextDue) + 'd' : 'Next due in ' + nextDue + 'd') : 'No report filed yet', a.reportState === 'ok' ? '' : (a.reportState === 'due' ? 'warn' : 'neg')],
      ['SOWs', a.terms.length, a.terms.length ? 'Terms set' : 'Terms not set', a.terms.length ? '' : 'warn'],
      ['Documents', a.docs.length, a.docs.length ? 'Latest: ' + e(a.docs.slice().sort(function(x,y){ return String(y.date||y.created_at).localeCompare(String(x.date||x.created_at)); })[0].title) : 'No documents linked', '']
    ];
    var activity = [];
    (a.psa && a.psa.reports || []).forEach(function(r){ activity.push({icon:'summarize', text:'Status report ' + (r.key || '') + ' filed', date:r.date}); });
    a.docs.forEach(function(d){ activity.push({icon:DOC_ICON[d.doc_type] || 'link', text:(d.doc_type || 'Document') + ' added: ' + d.title, date:d.date || String(d.created_at||'').slice(0,10)}); });
    a.people.filter(function(p){ return p.pending; }).forEach(function(p){ activity.push({icon:'hourglass_top', text:'Assignment pending: ' + p.name + ' (' + p.position + ')', date:p.start}); });
    activity.sort(function(x,y){ return String(y.date||'').localeCompare(String(x.date||'')); });
    return '<div class="ah-kpis">' + kpis.map(function(x){ return '<div class="ah-kpi"><div class="ah-kpi-lbl">' + x[0] + '</div><div class="ah-kpi-val">' + x[1] + '</div><div class="ah-kpi-sub ' + x[3] + '">' + x[2] + '</div></div>'; }).join('') + '</div>' +
      '<div class="ah-split">' +
        '<div class="ah-panel"><div class="ah-panel-head"><b>Commercial terms</b><button type="button" class="ah-link" onclick="AH.tab(\'terms\')">' + (canEdit() ? 'Edit per SOW' : 'View') + '</button></div>' +
          (a.terms.length ? a.terms.map(function(p){ return '<div class="ah-row"><span>' + e(p.project) + '</span><span class="ah-chips">' + [p.tracking,p.cycle,p.project_type].map(function(x){ return '<span class="ah-chip ' + (x ? '' : 'muted') + '">' + e(x || 'Not set') + '</span>'; }).join('') + '</span></div>'; }).join('')
            : emptyState('request_quote', 'No SOWs loaded', 'Add each SOW with its tracking, billing cycle and project type.', canEdit() ? '<button class="btn btn-ghost btn-sm" type="button" onclick="AH.tab(\'terms\')">Add SOW</button>' : '')) +
        '</div>' +
        '<div class="ah-panel"><div class="ah-panel-head"><b>Recent activity</b></div>' +
          (activity.length ? activity.slice(0,6).map(function(x){ return '<div class="ah-activity">' + ico(x.icon) + '<div><span>' + e(x.text) + '</span><small>' + fmt(x.date) + '</small></div></div>'; }).join('') : emptyState('history', 'Nothing yet', 'Reports, documents and assignment requests show up here.')) +
        '</div>' +
      '</div>';
  }
  function tabTeam(a){
    if(!a.people.length) return emptyState('group', 'Nobody assigned yet', 'No active or upcoming assignments for this account.');
    return '<div class="tbl-wrap ah-table"><table><thead><tr><th>Assignee</th><th>Position</th><th>Status</th><th>End date</th><th></th></tr></thead><tbody>' +
      a.people.map(function(p, i){
        var d = daysFrom(p.due);
        return '<tr><td><b>' + e(p.name) + '</b></td><td>' + e(p.position) + '</td>' +
          '<td>' + (p.pending ? '<span class="ah-pill warn">Pending · starts ' + fmt(p.start) + '</span>' : '<span class="ah-pill pos">Active</span>') + '</td>' +
          '<td class="' + dueTone(d) + '">' + (p.pending ? '—' : dueText(p.due)) + '</td>' +
          '<td class="ah-td-act"><button type="button" class="btn btn-ghost btn-sm" onclick="AH.extendAssignment(' + i + ')">' + ico('event_repeat') + 'Extend</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function tabReports(a){
    var psa = a.psa;
    if(!psaAll().length) return emptyState('hourglass_top', 'Loading status reports…', '');
    if(!psa) return emptyState('link_off', 'No PSA project linked', 'This account has no project in Jira PSA, so reports cannot be filed yet.');
    var reps = psa.reports || [];
    var nextDue = a.lastReport ? CADENCE_DAYS - a.since : null;
    var banner = a.reportState === 'ok' ? '' :
      '<div class="ah-banner ' + (a.reportState === 'due' ? 'warn' : 'neg') + '">' + ico('schedule') + (a.lastReport ? (nextDue < 0 ? 'Report overdue by ' + (-nextDue) + ' days' : 'Next report due in ' + nextDue + ' days') : 'No status report filed for this account yet') + ' · cadence every ' + CADENCE_DAYS + ' days' +
      '<button class="btn btn-primary btn-sm" type="button" onclick="AH.newReport()">Write report</button></div>';
    return banner + (reps.length ? '<div class="tbl-wrap ah-table"><table><thead><tr><th>Date</th><th>Report</th><th>Status</th><th></th></tr></thead><tbody>' +
      reps.map(function(r, i){
        var open = isRepOpen(r.key, i);
        var jira = (typeof jiraIssueUrl === 'function' && jiraIssueUrl(r.key)) || '';
        return '<tr class="ah-row-click" style="cursor:pointer" onclick="AH.toggleReport(\'' + e(r.key || '') + '\')"><td>' + fmt(r.date) + '</td><td>' + e(r.summary || r.reportType || 'Status report') + '</td><td><span class="ah-rags">' + ragChips(r) + '</span></td><td class="ah-td-act"><button type="button" class="btn btn-ghost btn-sm" aria-expanded="' + open + '">' + ico(open ? 'expand_less' : 'expand_more') + (open ? 'Hide' : 'View') + '</button></td></tr>' +
          (open ? '<tr class="ah-rep-detail"><td colspan="4" style="padding:12px 16px 16px;background:var(--surface-1,transparent)">' + repBody(r.key) +
            (jira ? '<div style="margin-top:6px"><a class="ah-meta" href="' + e(jira) + '" target="_blank" rel="noopener noreferrer">Open ' + e(r.key) + ' in Jira</a></div>' : '') + '</td></tr>' : '');
      }).join('') +
      '</tbody></table></div>' : '');
  }
  function tabTerms(a){
    var edit = canEdit();
    if(edit && !S.draft) startDraft(a);
    var rows = edit ? S.draft : a.terms;
    var seg = function(i, f){
      return '<div class="ah-field"><span>' + e(f.label) + '</span><div class="lf-seg ah-seg">' + f.options.map(function(o){
        var on = rows[i][f.field] === o;
        return edit ? '<button type="button" class="' + (on ? 'active' : '') + '" onclick="AH.setTerm(' + i + ',\'' + f.field + '\',\'' + o + '\')">' + e(o) + '</button>' : '<button type="button" disabled class="' + (on ? 'active' : '') + '">' + e(o) + '</button>';
      }).join('') + '</div></div>';
    };
    var dirty = edit && JSON.stringify(S.draft) !== JSON.stringify((a.terms||[]).map(function(p){ return {project:p.project||'', tracking:p.tracking||'', cycle:p.cycle||'', project_type:p.project_type||''}; }));
    return '<div class="ah-note">One row per SOW. An account can have several SOWs with different terms.</div>' +
      (rows.length ? rows.map(function(p, i){
        return '<div class="ah-sow">' +
          '<div class="ah-field ah-sow-name"><span>SOW / project</span>' + (edit ? '<input type="text" value="' + e(p.project) + '" placeholder="[SOW n] Software Development Services – …" oninput="AH.setTerm(' + i + ',\'project\',this.value,true)"/>' : '<b>' + e(p.project) + '</b>') + '</div>' +
          TERMS.map(function(f){ return seg(i, f); }).join('') +
          (edit ? '<button type="button" class="btn btn-ghost btn-sm ah-icon-btn" title="Remove SOW" onclick="AH.removeSow(' + i + ')">' + ico('delete') + '</button>' : '') +
        '</div>';
      }).join('') : emptyState('request_quote', 'No SOWs loaded for this account', edit ? 'Add the first SOW below.' : 'PMO sets these terms.')) +
      (edit ? '<div class="ah-actions"><button class="btn btn-ghost btn-sm" type="button" onclick="AH.addSow()">' + ico('add') + 'Add SOW</button><span class="ah-msg">' + e(S.msg) + '</span>' +
        (dirty ? '<button class="btn btn-ghost btn-sm" type="button" onclick="AH.resetTerms()">Discard</button><button class="btn btn-primary btn-sm" type="button" onclick="AH.saveTerms()">Save terms</button>' : '') + '</div>' : '');
  }
  function tabDocs(a){
    if(S.docs === null){ loadDocs(); return emptyState('hourglass_top', 'Loading documents…', ''); }
    var all = a.docs;
    var list = S.docFilter === 'All' ? all : all.filter(function(d){ return d.doc_type === S.docFilter; });
    var form = S.docForm ? '<div class="ah-docform">' +
      '<div class="ah-field"><span>Type</span><select id="ahDocType">' + DOC_TYPES.map(function(t){ return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="ah-field grow"><span>Title</span><input id="ahDocTitle" type="text" placeholder="e.g. SOW #5 – App redesign"/></div>' +
      '<div class="ah-field grow"><span>Link</span><input id="ahDocUrl" type="url" placeholder="Drive, Notion, Granola… https://"/></div>' +
      '<div class="ah-field"><span>Date</span><input id="ahDocDate" type="date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
      '<div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" onclick="AH.toggleDocForm(false)">Cancel</button><button class="btn btn-primary btn-sm" type="button" onclick="AH.saveDoc()">Save link</button></div>' +
      (S.msg ? '<div class="ah-msg neg">' + e(S.msg) + '</div>' : '') + '</div>' : '';
    return '<div class="ah-toolbar">' +
        '<div class="ah-filters">' + ['All'].concat(DOC_TYPES).map(function(t){ var n = t === 'All' ? all.length : all.filter(function(d){ return d.doc_type === t; }).length; return '<button type="button" class="action-filter ' + (S.docFilter === t ? 'active' : '') + '" onclick="AH.docFilter(\'' + t + '\')">' + e(t === 'Transcript' ? 'Transcripts' : t === 'Report' ? 'Reports' : t === 'SOW' ? 'SOWs' : t) + ' <span class="ah-count">' + n + '</span></button>'; }).join('') + '</div>' +
        (S.docForm ? '' : '<button class="btn btn-ghost btn-sm" type="button" onclick="AH.toggleDocForm(true)">' + ico('add_link') + 'Add document link</button>') +
      '</div>' + form +
      (list.length ? '<div class="ah-docs">' + list.slice().sort(function(x,y){ return String(y.date||'').localeCompare(String(x.date||'')); }).map(function(d){
        return '<div class="ah-doc"><div class="ah-doc-top"><span class="ah-chip">' + ico(DOC_ICON[d.doc_type] || 'link') + e(d.doc_type || 'Other') + '</span><span class="ah-meta">' + e(d.source || sourceOf(d.url)) + '</span></div>' +
          '<a class="ah-doc-title" href="' + e(d.url) + '" target="_blank" rel="noopener noreferrer">' + e(d.title) + '</a>' +
          '<div class="ah-doc-foot"><span class="ah-meta">' + fmt(d.date) + (d.created_by ? ' · ' + e(d.created_by) : '') + '</span>' + (canEdit() && d.id ? '<button type="button" class="ah-link muted" onclick="AH.deleteDoc(\'' + e(d.id) + '\')">Remove</button>' : '') + '</div></div>';
      }).join('') + '</div>' : emptyState('folder_open', all.length ? 'No ' + S.docFilter.toLowerCase() + ' documents' : 'No documents linked yet', 'Link SOWs, Granola transcripts, reports and anything else the team needs for this account.', S.docForm ? '' : '<button class="btn btn-primary btn-sm" type="button" onclick="AH.toggleDocForm(true)">Add document link</button>'));
  }

  /* ---------- My Portfolio ---------- */
  function renderPortfolio(host){
    var all = accounts();
    var pms = [...new Set(all.map(function(a){ return a.pm; }).filter(Boolean))].sort();
    var me = userName();
    var isPm = ['pm','csm','tl'].indexOf(role()) > -1;
    if(S.pm === null) S.pm = isPm ? me : (pms.indexOf(me) > -1 ? me : '');
    var scope = S.pm ? all.filter(function(a){ return k(a.pm) === k(S.pm) || k(a.csm) === k(S.pm) || k(a.tl) === k(S.pm); }) : all;
    var people = [];
    scope.forEach(function(a){ a.people.forEach(function(p){ people.push(Object.assign({account:a.client, accountKey:a.key}, p)); }); });
    people.sort(function(x,y){ return String(x.due||'9999').localeCompare(String(y.due||'9999')); });
    var todos = [];
    scope.forEach(function(a){
      if(a.reportState === 'stale' || a.reportState === 'none') todos.push({sev:0, icon:'event_busy', tone:'neg', title:'Status report overdue — ' + a.client, sub: a.lastReport ? 'Last report ' + a.since + ' days ago' : 'No report filed yet', cta:'Write report', act:"AH.newReport('" + a.key + "')"});
      else if(a.reportState === 'due') todos.push({sev:2, icon:'schedule', tone:'warn', title:'Status report due — ' + a.client, sub:'Last report ' + a.since + ' days ago · every ' + CADENCE_DAYS + ' days', cta:'Write report', act:"AH.newReport('" + a.key + "')"});
      var ending = a.people.filter(function(p){ var d = daysFrom(p.due); return !p.pending && d !== null && d <= 30; });
      if(ending.length){ var over = ending.filter(function(p){ return daysFrom(p.due) < 0; }).length;
        todos.push({sev:over ? 1 : 3, icon:'event_repeat', tone:over ? 'neg' : 'warn', title:ending.length + (ending.length === 1 ? ' assignment ' : ' assignments ') + (over ? 'past end date' : 'ending in 30 days') + ' — ' + a.client, sub:ending.slice(0,3).map(function(p){ return p.name; }).join(', ') + (ending.length > 3 ? ' +' + (ending.length - 3) : ''), cta:'Review team', act:"AH.open('" + a.key + "','team')"}); }
      a.people.filter(function(p){ return p.pending; }).forEach(function(p){ todos.push({sev:4, icon:'hourglass_top', tone:'', title:'Assignment pending — ' + a.client, sub:(p.key ? p.key + ' · ' : '') + p.name + ' · ' + p.position + (p.start ? ' · starts ' + fmt(p.start) : ''), cta:'Open account', act:"AH.open('" + a.key + "','team')"}); });
      if(!a.terms.length) todos.push({sev:5, icon:'request_quote', tone:'', title:'Commercial terms not set — ' + a.client, sub:'Tracking, billing cycle and project type per SOW', cta:'Set terms', act:"AH.open('" + a.key + "','terms')"});
    });
    todos.sort(function(x,y){ return x.sev - y.sev; });
    var showAll = S.todosAll, shown = showAll ? todos : todos.slice(0, 6);
    var hour = new Date().getHours(), greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    host.innerHTML =
      '<div class="ah-port-head"><div><div class="ah-eyebrow">My portfolio</div><h2 class="ah-h2">' + greet + (me ? ', ' + e(me.split(' ')[0]) : '') + '</h2>' +
        '<div class="ah-meta">' + scope.length + ' accounts · ' + people.length + ' people · ' + todos.length + ' things need attention</div></div>' +
        '<div class="btn-row">' +
          (!isPm ? '<div class="filter-field ah-pm-pick"><label for="ahPmPick">Viewing</label><select id="ahPmPick" onchange="AH.pickPm(this.value)"><option value="">All accounts (PMO)</option>' + pms.map(function(p){ return '<option value="' + e(p) + '"' + (p === S.pm ? ' selected' : '') + '>' + e(p) + '</option>'; }).join('') + '</select></div>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" onclick="AH.requestAssignment(true)">' + ico('person_add') + 'New assignment</button>' +
          '<button class="btn btn-primary btn-sm" type="button" onclick="AH.newReport(null,true)">' + ico('add') + 'New status report</button>' +
        '</div></div>' +
      '<div class="ah-panel"><div class="ah-panel-head"><b>Needs attention</b><span class="ah-count">' + todos.length + '</span></div>' +
        (shown.length ? shown.map(function(t){ return '<div class="ah-todo">' + '<span class="ah-todo-ico ' + t.tone + '">' + ico(t.icon) + '</span><div><b>' + e(t.title) + '</b><small>' + e(t.sub) + '</small></div><button type="button" class="btn btn-ghost btn-sm" onclick="' + t.act + '">' + e(t.cta) + '</button></div>'; }).join('') +
          (todos.length > 6 ? '<button type="button" class="ah-link ah-more" onclick="AH.toggleTodos()">' + (showAll ? 'Show less' : 'Show all ' + todos.length) + '</button>' : '')
          : emptyState('task_alt', 'All clear', 'No overdue reports or assignments ending soon.')) +
      '</div>' +
      '<div class="ah-split">' +
        '<div><div class="ah-panel-head plain"><b>My accounts</b><button type="button" class="ah-link" onclick="activateModuleTab(\'accountsHub\')">All accounts</button></div>' +
          (scope.length ? '<div class="ah-grid one">' + scope.map(accountCard).join('') + '</div>' : emptyState('domain', 'No accounts for ' + (S.pm || 'you'), 'Accounts appear here when you are PM, CSM or TL in Jira PSA.')) + '</div>' +
        '<div><div class="ah-panel-head plain"><b>My people</b><button type="button" class="ah-link" onclick="activateModuleTab(\'opsViews\')">All people</button></div>' +
          (people.length ? '<div class="tbl-wrap ah-table"><table><thead><tr><th>Person</th><th>End date</th><th></th></tr></thead><tbody>' + people.slice(0, 14).map(function(p){
            var d = daysFrom(p.due);
            return '<tr><td><b>' + e(p.name) + '</b><small class="ah-sub">' + e(p.account) + ' · ' + e(p.position) + '</small></td><td class="' + dueTone(d) + '">' + (p.pending ? 'Pending' : dueText(p.due)) + '</td>' +
              '<td class="ah-td-act"><button type="button" class="ah-link" onclick="AH.open(\'' + p.accountKey + '\',\'team\')">Open</button></td></tr>';
          }).join('') + '</tbody></table></div>' + (people.length > 14 ? '<div class="ah-meta ah-more-note">+' + (people.length - 14) + ' more in the account pages</div>' : '') : emptyState('group', 'No people in scope', '')) + '</div>' +
      '</div>';
  }

  /* ---------- render + actions ---------- */
  function render(){
    var hub = document.getElementById('accountsHubBody');
    var port = document.getElementById('myPortfolioBody');
    var active = document.querySelector('main > section.tab-section-active');
    var id = active && active.id;
    if(id === 'accountsHub' && hub){ (S.view === 'detail' ? renderDetail : renderList)(hub); }
    if(id === 'myPortfolio' && port){ renderPortfolio(port); }
  }
  function ensureData(){
    try{ if(!psaProjectStatusLoaded) loadPsaProjectStatus().then(render); }catch(_){}
    try{ if(typeof loadClientProjects === 'function') loadClientProjects().then(render); }catch(_){}
    loadDocs();
  }
  var AH = window.AH = {
    render: render,
    open: function(key, tab){ S.view = 'detail'; S.key = key; S.tab = tab || 'overview'; S.draft = null; S.docForm = false; S.msg = ''; S.docFilter = 'All';
      var sec = document.getElementById('accountsHub');
      if(sec && !sec.classList.contains('tab-section-active')) activateModuleTab('accountsHub'); else { render(); window.scrollTo({top:0, behavior:'smooth'}); } },
    back: function(){ S.view = 'list'; S.draft = null; render(); },
    tab: function(t){ S.tab = t; S.msg = ''; if(t !== 'terms') S.draft = null; render(); },
    search: function(v){ S.q = v; render(); var i = document.querySelector('#accountsHubBody .ah-search input'); if(i){ i.focus(); i.setSelectionRange(v.length, v.length); } },
    filter: function(f){ S.filter = f; render(); },
    docFilter: function(f){ S.docFilter = f; render(); },
    pickPm: function(v){ S.pm = v; render(); },
    toggleTodos: function(){ S.todosAll = !S.todosAll; render(); },
    toggleDocForm: function(on){ S.docForm = on; S.msg = ''; render(); if(on) setTimeout(function(){ var t = document.getElementById('ahDocTitle'); if(t) t.focus(); }, 0); },
    saveDoc: saveDoc, deleteDoc: deleteDoc, saveTerms: saveTerms,
    setTerm: function(i, f, v, typing){ if(!S.draft || !S.draft[i]) return; S.draft[i][f] = v; if(!typing) render(); else { var btns = document.querySelector('#accountsHubBody .ah-actions'); if(btns && !btns.querySelector('.btn-primary')) render(); var inp = document.querySelectorAll('#accountsHubBody .ah-sow-name input')[i]; if(inp && document.activeElement !== inp){ inp.focus(); inp.setSelectionRange(v.length, v.length); } } },
    addSow: function(){ if(!S.draft) S.draft = []; S.draft.push({project:'', tracking:'', cycle:'', project_type:''}); render(); var all = document.querySelectorAll('#accountsHubBody .ah-sow-name input'); if(all.length) all[all.length - 1].focus(); },
    removeSow: function(i){ if(S.draft){ S.draft.splice(i, 1); render(); } },
    resetTerms: function(){ S.draft = null; S.msg = ''; render(); },
    newReport: function(key, generic){
      var a = key ? account(key) : (generic ? null : account(S.key));
      var go = function(){ var acc = a && account(a.key); openPsaReportModal(acc && acc.psa ? acc.psa.epicKey : ''); };
      try{ if(!psaProjectStatusLoaded) loadPsaProjectStatus().then(go); else go(); }catch(_){ go(); }
    },
    toggleReport: function(key){
      if(!key) return;
      var reps = (account(S.key) && account(S.key).psa && account(S.key).psa.reports) || [];
      var idx = reps.findIndex(function(r){ return r.key === key; });
      var open = isRepOpen(key, idx);
      RPO[key] = !open;
      render();
      if(RPO[key]) loadReport(key);
    },
    requestAssignment: function(generic){ var a = generic ? null : account(S.key); openAaAssignmentModal(a ? {client:a.client} : {}); },
    extendAssignment: function(i){
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
    changeAssignment: function(i){ var a = account(S.key); if(!a) return; var p = a.people[i]; openAaAssignmentModal({client:a.client, personName:p && p.name}); }
  };

  /* ---------- status reports: inline detail (replaces the link out to Jira) ---------- */
  var RPO = {}, RPD = {};
  function isRepOpen(key, idx){ return key in RPO ? RPO[key] : idx === 0; }   // newest report opens by default
  function loadReport(key){
    var c = RPD[key];
    if(c && (c.state === 'ok' || c.state === 'loading')) return;
    RPD[key] = {state:'loading'};
    fetch('/api/psa-reports?details=' + encodeURIComponent(key), {cache:'no-store', credentials:'same-origin'})
      .then(function(res){ return res.json().catch(function(){ return {}; }).then(function(j){ if(!res.ok) throw new Error(j.error || ('HTTP ' + res.status)); return j; }); })
      .then(function(j){ RPD[key] = {state:'ok', details:j.details || []}; if(S.tab === 'reports') render(); })
      .catch(function(err){ RPD[key] = {state:'error', error:err.message}; if(S.tab === 'reports') render(); });
  }
  function repBody(key){
    var c = RPD[key];
    if(!c){ loadReport(key); c = RPD[key]; }
    if(c.state === 'loading') return '<div class="ah-meta">Loading report…</div>';
    if(c.state === 'error') return '<div class="ah-meta" style="color:var(--neg)">Could not load the report: ' + e(c.error) + '</div>';
    if(!c.details.length) return '<div class="ah-meta">No comments in this report.</div>';
    return c.details.map(function(d){
      var url = /^https?:\/\//i.test(d.text || '');
      var body = url ? '<a href="' + e(d.text) + '" target="_blank" rel="noopener noreferrer">' + e(d.text) + '</a>' : e(d.text);
      return '<div style="margin:0 0 12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:2px">' + e(d.label) + '</div><div style="white-space:pre-wrap;font-size:13px;line-height:1.5">' + body + '</div></div>';
    }).join('');
  }

  /* ---------- extend assignment (new end date → updates the AA Assignment in Jira) ---------- */
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

  // Hook into the board: re-render when our sections activate or data changes.
  var origActivate = window.activateModuleTab;
  if(typeof origActivate === 'function'){
    window.activateModuleTab = function(id, options){
      var r = origActivate.apply(this, arguments);
      if(id === 'accountsHub' || id === 'myPortfolio'){ ensureData(); render(); }
      return r;
    };
  }
  document.addEventListener('pmo-psa-updated', render);
  // Client names elsewhere in the board open the account page instead of the old profile modal.
  window.openClientProfile = function(key){ AH.open(key, 'terms'); };
  // If the board already activated one of our sections before this file loaded.
  setTimeout(function(){
    var a = document.querySelector('main > section.tab-section-active');
    if(a && (a.id === 'accountsHub' || a.id === 'myPortfolio')){ ensureData(); render(); }
  }, 0);
})();
