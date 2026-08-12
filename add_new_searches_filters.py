#!/usr/bin/env python3
"""
add_new_searches_filters.py - v2
Agrega filtros de Priority, Client y Status al New Searches Triage.
CORRER DESPUES de add_new_searches_rate_startdate.py
"""

FILE = "index.html"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_1 = """      <div class="tbl-head" style="border-top:1px solid var(--brd)">
        <h3>New Searches Triage modeled table</h3>
        <div class="tbl-actions">
          <span class="badge badge-blue">Native PMO view</span>
        </div>
      </div>
      <div class="fc-table-wrap">"""
new_1 = """      <div class="tbl-head" style="border-top:1px solid var(--brd)">
        <h3>New Searches Triage modeled table</h3>
        <div class="tbl-actions">
          <span class="badge badge-blue">Native PMO view</span>
        </div>
      </div>
      <div class="harvest-hours-controls hh-filter-row" id="nsFilterRow">
        <div class="filter-field">
          <label for="nsPriorityFilter">Priority</label>
          <select id="nsPriorityFilter" onchange="renderNewSearchesTriageReport()">
            <option value="">All priorities</option>
            <option value="Highest">Highest</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="filter-field">
          <label for="nsClientFilter">Client</label>
          <select id="nsClientFilter" onchange="renderNewSearchesTriageReport()"></select>
        </div>
        <div class="filter-field">
          <label for="nsStatusFilter">Status</label>
          <select id="nsStatusFilter" onchange="renderNewSearchesTriageReport()"></select>
        </div>
        <button class="btn btn-ghost" type="button" onclick="clearNewSearchesFilters()">Clear filters</button>
      </div>
      <div class="fc-table-wrap">"""

assert content.count(old_1) == 1, "Patch 1: anchor no encontrado."
content = content.replace(old_1, new_1)

old_2 = """  if(!thead || !tbody) return;
  const lastImport = report.last_import_at
    ? new Date(report.last_import_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
    : '—';
  if(cards){
    cards.innerHTML = [
      `<div class="util-card"><div class="util-card-label">Open searches</div><div class="util-card-value">${rows.length || report.row_count || 0}</div><div class="util-card-sub">Live export</div></div>`,
      `<div class="util-card"><div class="util-card-label">High priority</div><div class="util-card-value">${report.high_priority_count || 0}</div><div class="util-card-sub">High / Highest</div></div>`,
      `<div class="util-card"><div class="util-card-label">30+ days open</div><div class="util-card-value">${report.stale_count || 0}</div><div class="util-card-sub">Aging queue</div></div>`,
      `<div class="util-card"><div class="util-card-label">No candidates</div><div class="util-card-value">${report.without_candidates_count || 0}</div><div class="util-card-sub">Needs sourcing follow-up</div></div>`,
      `<div class="util-card"><div class="util-card-label">Last import</div><div class="util-card-value" style="font-size:1rem;line-height:1.25">${esc(lastImport)}</div><div class="util-card-sub">${reportSourceLabel(report, 'New Searches Triage')}</div></div>`
    ].join('');
  }
  thead.innerHTML = '<tr><th>New Search</th><th>Client</th><th>Priority</th><th>Status</th><th>Created</th><th>Age</th><th>Candidates</th><th>Rate (h)</th><th>Start Date</th></tr>';
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--muted);padding:1rem">${esc(report.warning || 'New Searches Triage data is not available yet.')}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(row => {"""
new_2 = """  if(!thead || !tbody) return;
  const lastImport = report.last_import_at
    ? new Date(report.last_import_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
    : '—';

  const nsClientSel = document.getElementById('nsClientFilter');
  const nsStatusSel = document.getElementById('nsStatusFilter');
  if(nsClientSel){
    const prevClient = nsClientSel.value;
    const clients = [...new Set(rows.map(r => cleanDisplayValue(r.client)).filter(v => v !== '—'))].sort();
    nsClientSel.innerHTML = '<option value="">All clients</option>' + clients.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(clients.includes(prevClient)) nsClientSel.value = prevClient;
  }
  if(nsStatusSel){
    const prevStatus = nsStatusSel.value;
    const statuses = [...new Set(rows.map(r => cleanDisplayValue(r.status)).filter(v => v !== '—'))].sort();
    nsStatusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if(statuses.includes(prevStatus)) nsStatusSel.value = prevStatus;
  }

  const nsPriority = (document.getElementById('nsPriorityFilter')?.value || '').toLowerCase();
  const nsClient = (document.getElementById('nsClientFilter')?.value || '');
  const nsStatus = (document.getElementById('nsStatusFilter')?.value || '');
  const filteredRows = rows.filter(row => {
    if(nsPriority && !String(row.priority || '').toLowerCase().includes(nsPriority)) return false;
    if(nsClient && cleanDisplayValue(row.client) !== nsClient) return false;
    if(nsStatus && cleanDisplayValue(row.status) !== nsStatus) return false;
    return true;
  });

  if(cards){
    const highPriCount = filteredRows.filter(r => /highest|high/i.test(r.priority || '')).length;
    const staleCount = filteredRows.filter(r => Number(r.days_since_created || 0) >= 30).length;
    const noCandCount = filteredRows.filter(r => Number(r.candidate_count || 0) <= 0).length;
    cards.innerHTML = [
      `<div class="util-card"><div class="util-card-label">Open searches</div><div class="util-card-value">${filteredRows.length}</div><div class="util-card-sub">${filteredRows.length !== rows.length ? `${rows.length} total` : 'Live export'}</div></div>`,
      `<div class="util-card"><div class="util-card-label">High priority</div><div class="util-card-value">${highPriCount}</div><div class="util-card-sub">High / Highest</div></div>`,
      `<div class="util-card"><div class="util-card-label">30+ days open</div><div class="util-card-value">${staleCount}</div><div class="util-card-sub">Aging queue</div></div>`,
      `<div class="util-card"><div class="util-card-label">No candidates</div><div class="util-card-value">${noCandCount}</div><div class="util-card-sub">Needs sourcing follow-up</div></div>`,
      `<div class="util-card"><div class="util-card-label">Last import</div><div class="util-card-value" style="font-size:1rem;line-height:1.25">${esc(lastImport)}</div><div class="util-card-sub">${reportSourceLabel(report, 'New Searches Triage')}</div></div>`
    ].join('');
  }
  thead.innerHTML = '<tr><th>New Search</th><th>Client</th><th>Priority</th><th>Status</th><th>Created</th><th>Age</th><th>Candidates</th><th>Rate (h)</th><th>Start Date</th></tr>';
  if(!filteredRows.length){
    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--muted);padding:1rem">${esc(filteredRows.length !== rows.length ? 'No results match the selected filters.' : report.warning || 'New Searches Triage data is not available yet.')}</td></tr>`;
    return;
  }
  tbody.innerHTML = filteredRows.map(row => {"""

assert content.count(old_2) == 1, "Patch 2: anchor no encontrado."
content = content.replace(old_2, new_2)

old_3 = """function cleanDisplayValue(value){"""
new_3 = """function clearNewSearchesFilters(){
  const p = document.getElementById('nsPriorityFilter');
  const c = document.getElementById('nsClientFilter');
  const s = document.getElementById('nsStatusFilter');
  if(p) p.value = '';
  if(c) c.value = '';
  if(s) s.value = '';
  renderNewSearchesTriageReport();
}
function cleanDisplayValue(value){"""

assert content.count(old_3) == 1, "Patch 3: anchor no encontrado."
content = content.replace(old_3, new_3)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 3 patches aplicados a index.html")
