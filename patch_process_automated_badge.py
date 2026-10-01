"""
Process Portal — mark automated steps with a ⚡ badge instead of writing "automatically".
- The "⚡ Automated" checkbox on each step is now SAVED (new column process_steps.is_automated);
  before, it was lost on save unless the step also had an automation link.
- Diagram: automated steps get an amber ⚡ badge on the node's top-left corner.
- Card (step list): automated steps show ⚡ before the title.
Run from the repo root:  python3 patch_process_automated_badge.py
"""
import pathlib

FILES = {"index.html": None, "lib/data-store.js": None}
for f in FILES:
    FILES[f] = pathlib.Path(f).read_text(encoding="utf-8")

def apply(fname, old, new, label):
    count = FILES[fname].count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    FILES[fname] = FILES[fname].replace(old, new, 1)
    print(f"OK: {label}")

# ── data-store: persist the flag ───────────────────────────────
apply("lib/data-store.js",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS yes_to_step integer`;""",
"""  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS yes_to_step integer`;
  // Step executed by a system (Jira automation, Zapier…) rather than a person — shown as a ⚡ badge.
  await sql`ALTER TABLE ${q('process_steps')} ADD COLUMN IF NOT EXISTS is_automated boolean NOT NULL DEFAULT false`;""",
"data-store: is_automated column")

apply("lib/data-store.js",
"""      automation_tool, automation_url, node_type, icon, time_of_day, form_url, yes_to_step
    FROM ${q('process_steps')}""",
"""      automation_tool, automation_url, node_type, icon, time_of_day, form_url, yes_to_step, is_automated
    FROM ${q('process_steps')}""",
"data-store: select is_automated")

apply("lib/data-store.js",
"""      automation_url: s.automation_url || null,
      form_url: s.form_url || null,""",
"""      automation_url: s.automation_url || null,
      has_auto: !!s.is_automated || !!s.automation_url,
      form_url: s.form_url || null,""",
"data-store: map has_auto")

apply("lib/data-store.js",
"""        node_type, icon, time_of_day, form_url, yes_to_step
      )""",
"""        node_type, icon, time_of_day, form_url, yes_to_step, is_automated
      )""",
"data-store: insert column")

apply("lib/data-store.js",
"""        ${step.form_url || null}, ${step.yes_to ?? null}
      )""",
"""        ${step.form_url || null}, ${step.yes_to ?? null},
        ${!!(step.has_auto || step.automation_url)}
      )""",
"data-store: insert value")

# ── index.html: diagram badge ──────────────────────────────────
apply("index.html",
"""      </g>`;
    }
  });
  svg += `</svg>`;

  el.innerHTML = svg + `<div class="proc-diagram-detail" id="${containerId}Detail"></div>`;""",
"""      </g>`;
    }
  });
  // ⚡ badge on automated steps (done by a system, not a person) — so titles don't need "automatically".
  flow.forEach((node, i) => {
    if(node.__virtual || node.node_type === 'start' || node.node_type === 'end') return;
    if(!(node.has_auto || node.automation_url)) return;
    const isDec = node.node_type === 'decision';
    const bx = isDec ? nodeX[i] - 30 : nodeX[i] - nodeW / 2 + 2;
    const by = isDec ? roleY(node) - 26 : roleY(node) - nodeH / 2 + 2;
    svg += `<g class="proc-auto-badge"><title>Automated step</title>
      <circle cx="${bx}" cy="${by}" r="9" fill="#FEF3C7" stroke="#D97706" stroke-width="1.5"/>
      <text x="${bx}" y="${by + 4}" font-size="10" text-anchor="middle">⚡</text></g>`;
  });
  svg += `</svg>`;

  el.innerHTML = svg + `<div class="proc-diagram-detail" id="${containerId}Detail"></div>`;""",
"diagram: automated badge")

# ── index.html: card step list ─────────────────────────────────
apply("index.html",
"""steps.map(s => `<li><b>${esc(s.title || '')}</b>""",
"""steps.map(s => `<li>${(s.has_auto || s.automation_url) ? '<span title="Automated step" style="color:#D97706">⚡ </span>' : ''}<b>${esc(s.title || '')}</b>""",
"card: ⚡ before automated step title")

# ── index.html: checkbox hint ──────────────────────────────────
apply("index.html",
"""      <label class="pf-step-auto-lbl" title="Has an automation">""",
"""      <label class="pf-step-auto-lbl" title="Done by a system (Jira automation, Zapier…), not a person. Shows a ⚡ badge — no need to write 'automatically' in the title.">""",
"form: automated checkbox hint")

for f, txt in FILES.items():
    pathlib.Path(f).write_text(txt, encoding="utf-8")
print("LISTO")
