#!/usr/bin/env python3
"""
add_new_searches_rate_startdate.py
Agrega Rate (Hourly) y Potential Start Date al reporte New Searches Triage.
"""
import sys

FILE = "index.html"
EAZYBI = "lib/eazybi-client.js"

with open(EAZYBI, "r", encoding="utf-8") as f:
    eazybi = f.read()

old_1 = """    quantity: columnIndex((column) => /^Quantity$/i.test(column))
  };"""
new_1 = """    quantity: columnIndex((column) => /^Quantity$/i.test(column)),
    rate: columnIndex((column) => /^Rate\\s*\\(?Hourly\\)?$/i.test(column)),
    start_date: columnIndex((column) => /^Potential\\s+Start\\s+Date$/i.test(column))
  };"""

assert eazybi.count(old_1) == 1, "Patch 1 (eazybi idx): anchor no encontrado."
eazybi = eazybi.replace(old_1, new_1)

old_2 = """      candidates: candidateLines,
      candidate_count: quantity || candidateLines.length || 0
    };"""
new_2 = """      candidates: candidateLines,
      candidate_count: quantity || candidateLines.length || 0,
      rate_hourly: numericValue(valueAt(rowIndex, 'rate', false)),
      rate_hourly_display: cleanEazyBIText(valueAt(rowIndex, 'rate')),
      potential_start_date: cleanEazyBIText(valueAt(rowIndex, 'start_date', false)),
      potential_start_date_display: cleanEazyBIText(valueAt(rowIndex, 'start_date'))
    };"""

assert eazybi.count(old_2) == 1, "Patch 2 (eazybi row): anchor no encontrado."
eazybi = eazybi.replace(old_2, new_2)

with open(EAZYBI, "w", encoding="utf-8") as f:
    f.write(eazybi)

print("OK: 2 patches aplicados a lib/eazybi-client.js")

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_3 = """  thead.innerHTML = '<tr><th>New Search</th><th>Client</th><th>Priority</th><th>Status</th><th>Created</th><th>Age</th><th>Candidates</th></tr>';"""
new_3 = """  thead.innerHTML = '<tr><th>New Search</th><th>Client</th><th>Priority</th><th>Status</th><th>Created</th><th>Age</th><th>Candidates</th><th>Rate (h)</th><th>Start Date</th></tr>';"""

assert content.count(old_3) == 1, "Patch 3 (thead): anchor no encontrado."
content = content.replace(old_3, new_3)

old_4 = """    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--muted);padding:1rem">${esc(report.warning || 'New Searches Triage data is not available yet.')}</td></tr>`;"""
new_4 = """    tbody.innerHTML = `<tr><td colspan="9" style="color:var(--muted);padding:1rem">${esc(report.warning || 'New Searches Triage data is not available yet.')}</td></tr>`;"""

assert content.count(old_4) == 1, "Patch 4 (colspan): anchor no encontrado."
content = content.replace(old_4, new_4)

old_5 = """      <td><span class="candidate-count">${Number(row.candidate_count || 0)}</span>${candidatePreview ? `<div class="candidate-list">${candidatePreview}</div>` : ''}</td>
    </tr>`;"""
new_5 = """      <td><span class="candidate-count">${Number(row.candidate_count || 0)}</span>${candidatePreview ? `<div class="candidate-list">${candidatePreview}</div>` : ''}</td>
      <td class="muted-value">${row.rate_hourly != null && row.rate_hourly !== '' ? `$${esc(String(row.rate_hourly_display || row.rate_hourly))}` : '—'}</td>
      <td class="muted-value">${esc(cleanDisplayValue(row.potential_start_date_display || row.potential_start_date))}</td>
    </tr>`;"""

assert content.count(old_5) == 1, "Patch 5 (tbody celdas): anchor no encontrado."
content = content.replace(old_5, new_5)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("OK: 3 patches aplicados a index.html")
print("Total: 5 patches aplicados.")
