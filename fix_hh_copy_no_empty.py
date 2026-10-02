#!/usr/bin/env python3
"""
fix_hh_copy_no_empty.py

Harvest Hours Control -> boton "Copy" (#billing-hub): dejar de copiar la
seccion "Empty" (personas con descripcion vacia). Solo copia los nombres
incompletos agrupados por cliente, tal como se ven en la tabla.

Uso: python3 fix_hh_copy_no_empty.py
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
"""  const incomplete = harvestHoursVisibleRows.filter(row => !row.complete);
  const noDescription = harvestHoursVisibleRows.filter(row => row.missingDescription);
  const text = harvestHoursBillingHubNames(incomplete, noDescription);""",
"""  const incomplete = harvestHoursVisibleRows.filter(row => !row.complete);
  // Ya no se copia la seccion "Empty": solo nombres incompletos agrupados por cliente
  const text = harvestHoursBillingHubNames(incomplete);""",
"Copy no incluye seccion Empty")

apply(
"""  if(!sections.length) return "All active users are complete in Harvest and all descriptions are filled.";""",
"""  if(!sections.length) return "All active users are complete in Harvest.";""",
"mensaje vacio sin mencion a descripciones")

PATH.write_text(src, encoding="utf-8")
