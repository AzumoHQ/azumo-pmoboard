#!/usr/bin/env python3
"""Patch: UX friction fixes — Harvest Hours localStorage, Forecast assignee search, Spanish copy."""
import sys

path = 'index.html'
html = open(path, encoding='utf-8').read()
original = html

changes = []

# ─── Fix 1a: hhExpectedHours — add oninput localStorage save ───────────────
OLD = '<input id="hhExpectedHours" type="number" min="1" max="80" value="40"/>'
NEW = '<input id="hhExpectedHours" type="number" min="1" max="80" value="40" oninput="localStorage.setItem(\'hh_weekly_expected\',this.value)"/>'
assert OLD in html, f"NOT FOUND: {OLD[:60]}"
html = html.replace(OLD, NEW, 1)
changes.append('hhExpectedHours oninput localStorage')

# ─── Fix 1b: hhThreshold — add oninput localStorage save ──────────────────
OLD = '<input id="hhThreshold" type="number" min="1" max="100" value="90"/>'
NEW = '<input id="hhThreshold" type="number" min="1" max="100" value="90" oninput="localStorage.setItem(\'hh_threshold\',this.value)"/>'
assert OLD in html, f"NOT FOUND: {OLD[:60]}"
html = html.replace(OLD, NEW, 1)
changes.append('hhThreshold oninput localStorage')

# ─── Fix 1c: initHarvestHoursDefaults — read localStorage on init ─────────
OLD = """function initHarvestHoursDefaults(){
  const from = document.getElementById("hhDateFrom");
  const to = document.getElementById("hhDateTo");
  if(!from || !to) return;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  if(!from.value) from.value = hhFormatIsoDate(monday);
  if(!to.value) to.value = hhFormatIsoDate(friday);
}"""
NEW = """function initHarvestHoursDefaults(){
  const from = document.getElementById("hhDateFrom");
  const to = document.getElementById("hhDateTo");
  if(!from || !to) return;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  if(!from.value) from.value = hhFormatIsoDate(monday);
  if(!to.value) to.value = hhFormatIsoDate(friday);
  const expectedEl = document.getElementById('hhExpectedHours');
  const thresholdEl = document.getElementById('hhThreshold');
  const savedExpected = localStorage.getItem('hh_weekly_expected');
  const savedThreshold = localStorage.getItem('hh_threshold');
  if(expectedEl && savedExpected) expectedEl.value = savedExpected;
  if(thresholdEl && savedThreshold) thresholdEl.value = savedThreshold;
}"""
assert OLD in html, f"NOT FOUND: initHarvestHoursDefaults body"
html = html.replace(OLD, NEW, 1)
changes.append('initHarvestHoursDefaults reads localStorage')

# ─── Fix 2a: HTML — replace forecast assignee <select> with <input search> ─
OLD = """      <div class="filter-field">
        <label for="forecastAssigneeFilter">Assignee</label>
        <select id="forecastAssigneeFilter" onchange="setForecastFilter('assignee', this.value)"></select>
      </div>"""
NEW = """      <div class="filter-field">
        <label for="forecastAssigneeFilter">Assignee</label>
        <label class="harvest-search" style="min-width:180px">
          <i class="ti ti-search"></i>
          <input id="forecastAssigneeFilter" type="search" placeholder="Filter assignee…" oninput="setForecastFilter('assignee',this.value)" style="width:100%"/>
        </label>
      </div>"""
assert OLD in html, f"NOT FOUND: forecast assignee select"
html = html.replace(OLD, NEW, 1)
changes.append('Forecast assignee: select → search input')

# ─── Fix 2b: JS — remove option-population for assigneeSelect ─────────────
OLD = """  if(assigneeSelect){
    const assignees = [...assigneeCounts.keys()].sort((a,b)=>a.localeCompare(b));
    assigneeSelect.innerHTML = optionHTML('', `All assignees (${items.length})`) + assignees.map(a => optionHTML(a, `${a} (${assigneeCounts.get(a)})`)).join('');
    assigneeSelect.value = forecastFilters.assignee;
    assigneeSelect.onchange = () => setForecastFilter('assignee', assigneeSelect.value);
  }"""
NEW = """  if(assigneeSelect && assigneeSelect.value !== forecastFilters.assignee) assigneeSelect.value = forecastFilters.assignee;"""
assert OLD in html, f"NOT FOUND: assigneeSelect options block"
html = html.replace(OLD, NEW, 1)
changes.append('renderForecastFilterControls: remove assignee option population')

# ─── Fix 2c: JS — remove assignee reset guard (not valid for free text) ───
OLD = "  if(forecastFilters.assignee && !assigneeCounts.has(forecastFilters.assignee)) forecastFilters.assignee = '';"
NEW = "  // assignee is free-text search — no reset needed"
assert OLD in html, f"NOT FOUND: assignee reset guard"
html = html.replace(OLD, NEW, 1)
changes.append('renderForecastFilterControls: remove assignee dropdown reset')

# ─── Fix 2d: JS — change exact-match filter to includes (renderForecastFilterControls count) ─
OLD = "        && (!forecastFilters.assignee || (row.assignee || '') === forecastFilters.assignee);"
NEW = "        && (!forecastFilters.assignee || (row.assignee || '').toLowerCase().includes(forecastFilters.assignee.toLowerCase()));"
assert html.count(OLD) >= 1, f"NOT FOUND: assignee exact match filter (count)"
html = html.replace(OLD, NEW)  # replace all occurrences
changes.append('Forecast assignee filter: exact match → includes')

# ─── Fix 2e: JS — change exact-match filter to includes (forecastRowMatchesFilters) ─
OLD = "    && (!forecastFilters.assignee || (row.assignee || '') === forecastFilters.assignee)"
NEW = "    && (!forecastFilters.assignee || (row.assignee || '').toLowerCase().includes(forecastFilters.assignee.toLowerCase()))"
assert OLD in html, f"NOT FOUND: forecastRowMatchesFilters assignee match"
html = html.replace(OLD, NEW, 1)
changes.append('forecastRowMatchesFilters: exact match → includes')

# ─── Fix 3a: aria-label Spanish → English ─────────────────────────────────
OLD = 'aria-label="Cómo se calcula"'
NEW = 'aria-label="How it\'s calculated"'
assert OLD in html, f"NOT FOUND: aria-label Cómo se calcula"
html = html.replace(OLD, NEW, 1)
changes.append('aria-label: Cómo se calcula → How it\'s calculated')

# ─── Fix 3b: tooltip Mon% Spanish → English ───────────────────────────────
OLD = 'title="Jira billing % — snapshot más cercano al ${monSnapDate || metrics.range.from}"'
NEW = 'title="Jira billing % — nearest snapshot to ${monSnapDate || metrics.range.from}"'
assert OLD in html, f"NOT FOUND: Mon% tooltip Spanish"
html = html.replace(OLD, NEW, 1)
changes.append('Mon% tooltip: Spanish → English')

# ─── Fix 3c: tooltip Sun% Spanish → English ───────────────────────────────
OLD = 'title="Jira billing % — snapshot más cercano al ${sunSnapDate || metrics.range.to}"'
NEW = 'title="Jira billing % — nearest snapshot to ${sunSnapDate || metrics.range.to}"'
assert OLD in html, f"NOT FOUND: Sun% tooltip Spanish"
html = html.replace(OLD, NEW, 1)
changes.append('Sun% tooltip: Spanish → English')

# ─── Fix 3d: prompt Spanish → English ────────────────────────────────────
OLD = "prompt('Copiá esto y pegalo en tu spreadsheet:', tsv);"
NEW = "prompt('Copy and paste into your spreadsheet:', tsv);"
assert OLD in html, f"NOT FOUND: prompt Spanish"
html = html.replace(OLD, NEW, 1)
changes.append('prompt copy: Spanish → English')

open(path, 'w', encoding='utf-8').write(html)
print(f"Applied {len(changes)} changes:")
for c in changes:
    print(f"  ✓ {c}")
