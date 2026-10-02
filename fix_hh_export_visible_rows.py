#!/usr/bin/env python3
"""
fix_hh_export_visible_rows.py

Bug: Harvest Hours Control exportaba harvestHoursReportData completo
(incluye non-billable), distinto de lo que muestra la tabla.
Fix: renderHarvestHoursReport() guarda las filas visibles y los 3 exports
(CSV, Copy TSV, Copy/Slack) usan esa misma lista, sin filtros intermedios.

Uso: python3 fix_hh_export_visible_rows.py
"""
import pathlib
PATH = pathlib.Path("index.html")
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

apply(
"let harvestHoursReportData = [];\n",
"let harvestHoursReportData = [];\n// Filas exactamente como se ven en la tabla de Harvest Hours Control (las usan los exports)\nlet harvestHoursVisibleRows = [];\n",
"declarar harvestHoursVisibleRows")

apply(
"""  // Sort: incomplete first, then by % asc, then by name
  const sorted = [...visible].sort((a,b) => {
    if(a.complete !== b.complete) return a.complete ? 1 : -1;
    return (a.pct - b.pct) || a.name.localeCompare(b.name);
  });
""",
"""  // Sort: incomplete first, then by % asc, then by name
  const sorted = [...visible].sort((a,b) => {
    if(a.complete !== b.complete) return a.complete ? 1 : -1;
    return (a.pct - b.pct) || a.name.localeCompare(b.name);
  });
  harvestHoursVisibleRows = sorted; // los exports copian esto, sin filtros propios
""",
"guardar filas visibles al renderizar")

apply(
"""concat(harvestHoursReportData.map(row => [row.name,row.client || "",row.hours,""",
"""concat(harvestHoursVisibleRows.map(row => [row.name,(row.clients && row.clients.length ? row.clients.join(", ") : ""),row.hours,""",
"CSV usa filas visibles")

apply(
"""    harvestHoursReportData.map(row => [
      row.name,
      row.client || '',""",
"""    harvestHoursVisibleRows.map(row => [
      row.name,
      (row.clients && row.clients.length ? row.clients.join(', ') : ''),""",
"TSV usa filas visibles")

apply(
"""  const incomplete = harvestHoursReportData.filter(row => !row.complete);
  const noDescription = harvestHoursReportData.filter(row => row.missingDescription);""",
"""  const incomplete = harvestHoursVisibleRows.filter(row => !row.complete);
  const noDescription = harvestHoursVisibleRows.filter(row => row.missingDescription);""",
"Copy (Slack) usa filas visibles")

PATH.write_text(src, encoding="utf-8")
