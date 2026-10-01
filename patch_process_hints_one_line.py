"""
Process Portal — hover descriptions fit on the label line (they no longer cover the field).
- Each description shortened to one line.
- The floating hint sits on the label row, single line, no box over the input.
Run from the repo root:  python3 patch_process_hints_one_line.py
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

# Style: one line on the label row, no shadow box over the input
apply(
"""max-width:62%;margin:0!important;padding:.15rem .5rem;border-radius:6px;background:var(--card);border:1px solid var(--brd);box-shadow:0 2px 8px rgba(0,0,0,.08);""",
"""max-width:72%;margin:0!important;padding:0;border:0;background:transparent;box-shadow:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;""",
"css: hint on label row")

# Short, one-line descriptions
for old, new, label in [
    ("What is this process for, and what is the expected final result?", "Why it exists and its expected result.", "objective"),
    ("Where does it begin and end? What does it include — and what does it not?", "Starts when · Ends when · Includes · Excludes.", "scope"),
    ("Recurring processes run on a fixed cadence — for weekly ones each step can have a day and time. Event-driven processes run whenever the trigger happens.", "Recurring (fixed cadence) or on demand (when the trigger happens).", "frequency"),
    ("Who takes part in the process and what each role is accountable for at each stage.", "Who takes part and what each role is accountable for.", "roles"),
    ("Processes that hand off to this one, or that this one hands off to. The link shows up on both processes.", "Hand-offs to and from other processes.", "related"),
    ("One row per step, in order. Name the action, describe what happens, then set the role, type and schedule.", "One action per step, in order.", "steps"),
    ("Define the key metrics that will be used to measure process performance. Indicate how data will be collected and analyzed.", "Checks that prove the process worked.", "validations"),
    ("Links, documents, templates, or tools referenced by this process.", "Tools, docs and templates used.", "resources"),
]:
    apply(new and old, new, "hint: " + label)

PATH.write_text(src, encoding="utf-8")
print("LISTO")
