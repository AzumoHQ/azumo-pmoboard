"""
Processes — cada paso puede indicar si usa un formulario (además de Automated).

  - Checkbox "📝 Form" en cada paso; al marcarlo aparece el campo para el link.
  - Columna nueva pmo.process_steps.form_url (ADD COLUMN IF NOT EXISTS).
  - La card del proceso muestra links "📝 Form ↗" y "⚡ Automation ↗" por paso.
  - Fix: al editar un proceso, Automated quedaba desmarcado aunque tuviera link.

REQUIERE haber aplicado antes patch_process_frequency.py.
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
FILES = {"html": ROOT / "index.html", "ds": ROOT / "lib" / "data-store.js"}
SRC = {k: p.read_text(encoding="utf-8") for k, p in FILES.items()}

def apply(key, old, new, label, n=1):
    count = SRC[key].count(old)
    assert count == n, f"[{label}] esperado {n} match, encontrados {count}"
    SRC[key] = SRC[key].replace(old, new)
    print(f"OK: {label}")

assert "pfApplyFrequency" in SRC["html"], "Falta aplicar primero patch_process_frequency.py"

# ════════ BACKEND ════════
apply("ds",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS time_of_day text`;""",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS time_of_day text`;
  // Link to the form used in this step (Google Form, Jira form, Typeform…), if any.
  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS form_url text`;""",
"ds: columna form_url")
apply("ds",
"""      automation_tool, automation_url, node_type, icon, time_of_day
    FROM ${q('process_steps')}""",
"""      automation_tool, automation_url, node_type, icon, time_of_day, form_url
    FROM ${q('process_steps')}""",
"ds: select form_url")
apply("ds",
"""      automation_url: s.automation_url || null,""",
"""      automation_url: s.automation_url || null,
      form_url: s.form_url || null,""",
"ds: map form_url")
apply("ds",
"""        node_type, icon, time_of_day
      )""",
"""        node_type, icon, time_of_day, form_url
      )""",
"ds: insert columna")
apply("ds",
"""        ${step.node_type || 'task'}, ${step.icon || null}, ${step.time_of_day || null}
      )""",
"""        ${step.node_type || 'task'}, ${step.icon || null}, ${step.time_of_day || null},
        ${step.form_url || null}
      )""",
"ds: insert value")

# ════════ CSS ════════
apply("html",
""".pf-step-auto-row input::placeholder{color:var(--muted)}""",
""".pf-step-auto-row input::placeholder{color:var(--muted)}
.pf-step-form-lbl{display:flex;align-items:center;gap:.2rem;font-size:.74rem;color:var(--muted);cursor:pointer;white-space:nowrap;flex-shrink:0;user-select:none}
.pf-step-form-lbl input{width:13px;height:13px;cursor:pointer;accent-color:#10b981}
.pf-step-form-row{display:none;padding:.2rem .2rem .2rem 1.9rem}
.pf-step-form-row input{width:100%;border:none;border-bottom:1px solid var(--brd);background:transparent;font:inherit;font-size:.78rem;color:var(--txt);padding:.1rem .2rem;outline:none}
.pf-step-form-row input:focus{border-bottom-color:#10b981}
.pf-step-form-row input::placeholder{color:var(--muted)}
.proc-step-links a{font-size:.74rem;color:var(--blue-lt);margin-left:8px;white-space:nowrap}""",
"css: fila de formulario")

# ════════ STEP ROW ════════
apply("html",
"""        <input type="checkbox" class="pf-step-has-auto"${s.has_auto?' checked':''} onchange="pfToggleAutoRow(this)"> ⚡ Automated
      </label>""",
"""        <input type="checkbox" class="pf-step-has-auto"${(s.has_auto||s.automation_url)?' checked':''} onchange="pfToggleAutoRow(this)"> ⚡ Automated
      </label>
      <label class="pf-step-form-lbl" title="This step uses a form">
        <input type="checkbox" class="pf-step-has-form"${s.form_url?' checked':''} onchange="pfToggleFormRow(this)"> 📝 Form
      </label>""",
"step row: checkbox Form")
apply("html",
"""    <div class="pf-step-auto-row"${s.has_auto?' style=\\"display:flex\\"':''}>
      <input type="url" class="pf-step-auto-url" value="${esc(s.automation_url||'')}" placeholder="https://… automation link">
    </div>""",
"""    <div class="pf-step-auto-row"${(s.has_auto||s.automation_url)?' style=\\"display:flex\\"':''}>
      <input type="url" class="pf-step-auto-url" value="${esc(s.automation_url||'')}" placeholder="https://… automation link">
    </div>
    <div class="pf-step-form-row"${s.form_url?' style=\\"display:flex\\"':''}>
      <input type="url" class="pf-step-form-url" value="${esc(s.form_url||'')}" placeholder="https://… form link (Google Form, Jira form, Typeform…)">
    </div>""",
"step row: campo link del formulario")
apply("html",
"""window.pfToggleAutoRow=pfToggleAutoRow;""",
"""window.pfToggleAutoRow=pfToggleAutoRow;
function pfToggleFormRow(chk){
  const row=chk.closest('.pf-step-compact');if(!row)return;
  const sub=row.querySelector('.pf-step-form-row');if(!sub)return;
  sub.style.display=chk.checked?'flex':'none';
  if(!chk.checked){const u=sub.querySelector('.pf-step-form-url');if(u)u.value='';}
}
window.pfToggleFormRow=pfToggleFormRow;""",
"pfToggleFormRow")
apply("html",
"""has_auto:!!(row.querySelector('.pf-step-has-auto')?.checked),""",
"""has_auto:!!(row.querySelector('.pf-step-has-auto')?.checked),form_url:(row.querySelector('.pf-step-has-form')?.checked?(val('.pf-step-form-url')||null):null),""",
"pfCollectSteps: form_url")

# ════════ CARD ════════
apply("html",
"""${s.desc ? ' — ' + esc(s.desc) : ''}</li>""",
"""${s.desc ? ' — ' + esc(s.desc) : ''}${(s.form_url || s.automation_url) ? `<span class="proc-step-links">${s.form_url ? `<a href="${esc(s.form_url)}" target="_blank" rel="noopener">📝 Form ↗</a>` : ''}${s.automation_url ? `<a href="${esc(s.automation_url)}" target="_blank" rel="noopener">⚡ Automation ↗</a>` : ''}</span>` : ''}</li>""",
"card: links de form y automation por paso")

for k, p in FILES.items():
    p.write_text(SRC[k], encoding="utf-8")
print("\nEscrito OK.")
