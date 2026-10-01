"""
Process Portal — field descriptions show on hover / focus.
The short description of each field (Objective, Scope, Frequency, Trigger, Owner role, and each section:
Roles & responsibilities, Related processes, Steps, Validations, Resources) is hidden by default and
appears, aligned to the right of the label, when you hover the field or are typing in it.
It floats (absolute position), so nothing in the form jumps.
Run from the repo root:  python3 patch_process_form_hover_hints.py
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
""".pf-split-right .pf-field-hint{display:none!important}""",
"""/* Field descriptions: hidden until you hover the field (or type in it), floating to the right of the label */
.pf-split-right .auth-field,.pf-split-right .pf-section{position:relative}
.pf-split-right .pf-field-hint{position:absolute;top:0;right:0;max-width:62%;margin:0!important;padding:.15rem .5rem;border-radius:6px;background:var(--card);border:1px solid var(--brd);box-shadow:0 2px 8px rgba(0,0,0,.08);font-size:.72rem;line-height:1.35;text-align:right;z-index:2;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s}
.pf-split-right .pf-section>.pf-field-hint{top:1rem}
.pf-split-right .auth-field:hover>.pf-field-hint,.pf-split-right .auth-field:focus-within>.pf-field-hint,
.pf-split-right .pf-section-head:hover+.pf-field-hint{opacity:1;visibility:visible}""",
"css: hints on hover")

# Trigger hint without the inline examples (examples live in the Process Definition Framework)
apply(
"""<span class="pf-field-hint">The event that starts the process — e.g. "SOW signed", "New hire accepts the offer", "Every Friday EOD".</span>""",
"""<span class="pf-field-hint">The event that starts the process.</span>""",
"trigger hint: no examples")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
