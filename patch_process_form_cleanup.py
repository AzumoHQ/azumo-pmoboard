"""
Process Portal — clean form (BPMN / UX pass)
1) No examples in the form: short neutral placeholders, no tooltips, no hint text under fields.
2) All writing guidance moves to "Process Definition Framework" (new "How to document a process" block).
3) Step card decluttered: 1-line description that grows on focus, type as a segmented control,
   Doc / Automated / Link as compact toggle chips aligned right (filled when on).
Data and saving logic are untouched — only placeholders, labels, CSS and the framework text.
Run from the repo root:  python3 patch_process_form_cleanup.py
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

# ── 1) Placeholders without examples ───────────────────────────
apply('''placeholder="Action verb + object + where — e.g. Create the Epic in Azumo Assignments" title="Write each step as: Action verb (imperative) + object + where (system / location). One action per step.">''',
      '''placeholder="Step name">''', "step title placeholder")

apply('''placeholder="When: trigger · Input: what you need · Do: how, in which tool · Output: done when… — e.g. When the PM form arrives · Input: assignment form · Do: create the Epic in Jira with name + role · Output: Epic exists in 'Started'">''',
      '''placeholder="Description (optional)">''', "step description placeholder")

apply('''placeholder="https://… automation link">''', '''placeholder="Automation link (optional)">''', "automation link placeholder")
apply('''placeholder="https://… link used in this step (Google Doc/Sheet, Jira board, form, Harvest…)">''', '''placeholder="Link">''', "step link placeholder")
apply('''placeholder="e.g. All hours match the approved timesheet">''', '''placeholder="Validation">''', "validation placeholder")
apply('''placeholder="Role — e.g. CSM">''', '''placeholder="Role">''', "R&R role placeholder")
apply('''placeholder="Responsibilities — e.g. Owns the client relationship; joins the kickoff…">''', '''placeholder="Responsibilities">''', "R&R responsibilities placeholder")
apply('''<input type="text" id="pfName" placeholder="New Project Process">''', '''<input type="text" id="pfName" placeholder="Process name">''', "name placeholder")
apply('''<input type="text" id="pfId" placeholder="new-project-process">''', '''<input type="text" id="pfId" placeholder="process-slug">''', "id placeholder")
apply('''<input type="text" id="pfOwnerRole" placeholder="PMO" list="pfCompanyRoles">''', '''<input type="text" id="pfOwnerRole" placeholder="Role" list="pfCompanyRoles">''', "owner placeholder")
apply('''<input type="text" id="pfCorresponsableRole" placeholder="PM" list="pfCompanyRoles">''', '''<input type="text" id="pfCorresponsableRole" placeholder="Role" list="pfCompanyRoles">''', "co-responsible placeholder")

# Toggle labels: short, no explanatory tooltips
apply('''<label class="pf-step-docs-lbl" title="Requires documentation">''', '''<label class="pf-step-docs-lbl">''', "doc toggle: no tooltip")
apply('''<label class="pf-step-auto-lbl" title="Done by a system (Jira automation, Zapier…), not a person. Shows a ⚡ badge — no need to write 'automatically' in the title.">''',
      '''<label class="pf-step-auto-lbl">''', "automated toggle: no tooltip")
apply('''<label class="pf-step-form-lbl" title="Add a link used in this step (doc, sheet, Jira board, form…)">''', '''<label class="pf-step-form-lbl">''', "link toggle: no tooltip")
apply('''onchange="pfToggleFormRow(this)"> 🔗 Link''', '''onchange="pfToggleFormRow(this)"><span>🔗 Link</span>''', "link toggle text")
apply('''onchange="pfToggleAutoRow(this)"> ⚡ Automated''', '''onchange="pfToggleAutoRow(this)"><span>⚡ Automated</span>''', "automated toggle text")

# Doc toggle text (wrap so it can be styled as a chip)
i = src.find('<label class="pf-step-docs-lbl">')
j = src.find('</label>', i)
seg = src[i:j]
assert seg.count('> Doc') == 1, f"[doc toggle text] esperado 1 match, encontrados {seg.count('> Doc')}"
src = src[:i] + seg.replace('> Doc', '><span>📄 Doc</span>', 1) + src[j:]
print("OK: doc toggle text")

# Description: 1 line by default
apply('''<textarea class="pf-step-desc" rows="2" placeholder="Description (optional)">''',
      '''<textarea class="pf-step-desc" rows="1" placeholder="Description (optional)">''', "description 1 row")

# ── 2) CSS: hide form hints, chips, segmented type ─────────────
apply(""".pf-step-form-lbl input{width:13px;height:13px;cursor:pointer;accent-color:#10b981}""",
""".pf-step-form-lbl input{width:13px;height:13px;cursor:pointer;accent-color:#10b981}
/* Clean form: guidance lives in "Process Definition Framework", not under each field */
.pf-split-right .pf-field-hint{display:none!important}
/* Step options as compact toggle chips (filled when on), pushed to the right of the row */
#pfStepsList .pf-step-docs-lbl{margin-left:auto}
#pfStepsList .pf-step-docs-lbl,#pfStepsList .pf-step-auto-lbl,#pfStepsList .pf-step-form-lbl{border:1px solid var(--brd);border-radius:999px;padding:.08rem .5rem;font-size:.7rem;background:transparent;transition:background .12s,border-color .12s,color .12s}
#pfStepsList .pf-step-docs-lbl input,#pfStepsList .pf-step-auto-lbl input,#pfStepsList .pf-step-form-lbl input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
#pfStepsList .pf-step-docs-lbl:has(input:checked){background:rgba(0,102,255,.1);border-color:var(--blue);color:var(--blue)}
#pfStepsList .pf-step-auto-lbl:has(input:checked){background:#FEF3C7;border-color:#D97706;color:#92400E}
#pfStepsList .pf-step-form-lbl:has(input:checked){background:rgba(16,185,129,.12);border-color:#10b981;color:#047857}
#pfStepsList .pf-step-docs-lbl:has(input:focus-visible),#pfStepsList .pf-step-auto-lbl:has(input:focus-visible),#pfStepsList .pf-step-form-lbl:has(input:focus-visible){outline:2px solid var(--blue);outline-offset:1px}
/* Node type as one segmented control */
#pfStepsList .pf-step-type-mini{gap:0}
#pfStepsList .pf-nt-mini-btn{border-radius:0;margin-left:-1px}
#pfStepsList .pf-nt-mini-btn:first-child{border-radius:6px 0 0 6px;margin-left:0}
#pfStepsList .pf-nt-mini-btn:last-child{border-radius:0 6px 6px 0}
/* Description: one quiet line, grows while editing */
#pfStepsList .pf-step-desc{min-height:1.9rem;border-color:transparent;background:transparent}
#pfStepsList .pf-step-desc:hover{border-color:var(--brd)}
#pfStepsList .pf-step-desc:focus{min-height:3.6rem;border-color:var(--blue);background:var(--surf);outline:none}
#pfStepsList .pf-step-auto-row input,#pfStepsList .pf-step-form-row input{font-size:.76rem}""",
"css: clean form + chips + segmented type")

# ── 3) Writing guide in Process Definition Framework ───────────
apply("""        <div class="locked-note" style="margin-top:.9rem">💡 Process maturity is not achieved overnight. It requires a long-term commitment to continuous improvement and the active participation of the whole team.</div>
      </div>
    </details>""",
"""        <div class="locked-note" style="margin-top:.9rem">💡 Process maturity is not achieved overnight. It requires a long-term commitment to continuous improvement and the active participation of the whole team.</div>

        <!-- Writing guide: the single place for documentation standards (the form itself stays clean). BPMN + Diátaxis. -->
        <div class="mc-sub" style="margin:1.1rem 0 .6rem">How to document a process</div>
        <div class="lineage-list">
          <div class="lineage-item"><b>Name</b><div>The outcome, as a verb phrase: <i>Assign a person to a project</i>.</div></div>
          <div class="lineage-item"><b>Owner &amp; co-responsible role</b><div>Owner: accountable end to end. Co-responsible: shares accountability, backs up the owner and notifies PMO of any change. Always roles, never names.</div></div>
          <div class="lineage-item"><b>Objective</b><div>Why the process exists and its expected result. No steps here.</div></div>
          <div class="lineage-item"><b>Scope</b><div><i>Starts when</i> · <i>Ends when</i> · <i>Includes</i> · <i>Does not include</i>.</div></div>
          <div class="lineage-item"><b>Trigger</b><div>The start event: <i>SOW signed</i>, <i>Epic moves to Hired</i>, <i>Every Friday EOD</i>.</div></div>
          <div class="lineage-item"><b>Roles &amp; responsibilities</b><div><i>[Role] — [verb] [object] [when]</i>. Each role is a lane; a system that acts on its own (e.g. Jira) gets its own lane.</div></div>
          <div class="lineage-item"><b>Steps</b><div>Action verb + object + where: <i>Create the Epic in Azumo Assignments</i>. One action per step. Description (optional): <i>When · Input · Do · Output</i>. Actions only — the “why” goes in Objective.</div></div>
          <div class="lineage-item"><b>Decisions</b><div>A yes/no question: <i>Does the Epic already exist?</i> Set where both Yes and No go.</div></div>
          <div class="lineage-item"><b>⚡ Automated · 🔗 Link · 📄 Doc</b><div>Mark ⚡ when a system does the step (don't write “automatically”). Use 🔗 for the tool or file used in the step. Use 📄 when the step produces or needs a document.</div></div>
          <div class="lineage-item"><b>Validations</b><div>Checks that prove the process worked, ideally measurable: <i>Epic is in “Started”</i>, <i>Hours match the timesheet</i>.</div></div>
          <div class="lineage-item"><b>Resources</b><div><i>[Tool] – [what it is]</i>: <i>Jira – Azumo Assignments board</i>.</div></div>
          <div class="lineage-item"><b>Related processes</b><div>Link hand-offs (previous / next) instead of repeating another process's steps.</div></div>
          <div class="lineage-item"><b>Before publishing</b><div>For each block ask: does it tell someone what to <i>do</i>, or what to <i>know</i>? Actions go in Steps; facts in Roles, Validations and Resources; reasons in Objective.</div></div>
        </div>
      </div>
    </details>""",
"framework: writing guide")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
