"""
Process Portal — diagram lanes show the role exactly as written.
Bug: a step saved as "Customer Success Manager" was drawn in a lane labelled "CSM"
(and "Chief of Staff" as "PMO / COS"), because known aliases were mapped onto the
built-in lane labels. The saved data was always correct — only the label was wrong.
Fix: keep the alias mapping (so the viewer's own lane still highlights), but label the
lane with the role text used in the process (first appearance).
Run from the repo root:  python3 patch_process_lane_labels.py
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
"""      const canon = PROCESS_LANES.find(l => l.key === key);
      lanes.push({key, label: canon ? canon.label : (key === '__none' ? 'Unassigned' : key)});""",
"""      const canon = PROCESS_LANES.find(l => l.key === key);
      // Label = the role as written in the process ("Customer Success Manager" stays as is);
      // only bare built-in keys ("csm", "pm") fall back to the canonical short label.
      const written = String(s.role || '').trim();
      const label = key === '__none' ? 'Unassigned'
        : (canon && (!written || written.toLowerCase() === key)) ? canon.label
        : (written || key);
      lanes.push({key, label});""",
"lanes: keep written role as label")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
