"""
Process Portal — step form tweaks
1) "📝 Form" per step becomes a generic "🔗 Link" (doc, sheet, Jira board, form…).
   The stored field stays `form_url` (no DB change), so existing links keep working.
2) Step title / description placeholders show the standard structure for writing a step:
   Title: Action verb + object + where (system / location)
   Description: Trigger → Input → Action detail → Output / done criteria
Run from the repo root:  python3 patch_process_step_link_and_writing_guide.py
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

# ── 1) Form → Link ─────────────────────────────────────────────
apply(
"""      <label class="pf-step-form-lbl" title="This step uses a form">
        <input type="checkbox" class="pf-step-has-form"${s.form_url?' checked':''} onchange="pfToggleFormRow(this)"> 📝 Form
      </label>""",
"""      <label class="pf-step-form-lbl" title="Add a link used in this step (doc, sheet, Jira board, form…)">
        <input type="checkbox" class="pf-step-has-form"${s.form_url?' checked':''} onchange="pfToggleFormRow(this)"> 🔗 Link
      </label>""",
"form: checkbox label -> Link")

apply(
"""placeholder="https://… form link (Google Form, Jira form, Typeform…)">""",
"""placeholder="https://… link used in this step (Google Doc/Sheet, Jira board, form, Harvest…)">""",
"form: url placeholder -> link")

apply(
"""${s.form_url ? `<a href="${esc(s.form_url)}" target="_blank" rel="noopener">📝 Form ↗</a>` : ''}""",
"""${s.form_url ? `<a href="${esc(s.form_url)}" target="_blank" rel="noopener">🔗 Link ↗</a>` : ''}""",
"card: Form link -> Link")

# ── 2) Writing standard in the placeholders ────────────────────
apply(
"""placeholder="Step name — e.g. Create the project in Harvest">""",
"""placeholder="Action verb + object + where — e.g. Create the Epic in Azumo Assignments" title="Write each step as: Action verb (imperative) + object + where (system / location). One action per step.">""",
"step title placeholder")

apply(
"""placeholder="What happens here? Inputs, output, tool used, done criteria…">""",
"""placeholder="When: trigger · Input: what you need · Do: how, in which tool · Output: done when… — e.g. When the PM form arrives · Input: assignment form · Do: create the Epic in Jira with name + role · Output: Epic exists in 'Started'">""",
"step description placeholder")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
