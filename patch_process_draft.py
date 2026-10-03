"""
Process Portal — save a process as a DRAFT (hidden from the team until it is published).
- DB: new column processes.status ('draft' | 'published', default 'published' so every existing process stays visible).
- API: people without write access (not PMO/admin) never receive drafts (list hides them, detail returns 404).
- Form: two buttons — "Save as draft" and "Publish" (when editing a published process: "Unpublish" / "Save changes").
- List (PMO/admin only see drafts): yellow "Draft" badge instead of "Documented"; counter shows "· N drafts";
  drafts are left out of the weekly calendar strip.
Touches index.html, lib/data-store.js, api/processes.js.
Run from the repo root:  python3 patch_process_draft.py
"""
import pathlib

files = {p: pathlib.Path(p).read_text(encoding="utf-8") for p in ("index.html", "lib/data-store.js", "api/processes.js")}
cur = None

def apply(fname, old, new, label):
    count = files[fname].count(old)
    assert count == 1, f"[{label}] expected 1 match in {fname}, found {count}"
    files[fname] = files[fname].replace(old, new, 1)
    print(f"OK: {label}")

DS, IDX, API = "lib/data-store.js", "index.html", "api/processes.js"

# ── DB ────────────────────────────────────────────────────────
apply(DS,
"""  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS related_processes jsonb NOT NULL DEFAULT '[]'::jsonb`;""",
"""  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS related_processes jsonb NOT NULL DEFAULT '[]'::jsonb`;
  // Draft processes are only visible to PMO/admin; everything that already exists stays 'published'.
  await sql`ALTER TABLE ${q('processes')} ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'`;""",
"db: status column")

apply(DS,
"""      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    ORDER BY name ASC""",
"""      last_reviewed, review_cadence_months, version, updated_at, status
    FROM ${q('processes')}
    ORDER BY name ASC""",
"db: list select status")

apply(DS,
"""      last_reviewed, review_cadence_months, version, updated_at
    FROM ${q('processes')}
    WHERE id = ${id}""",
"""      last_reviewed, review_cadence_months, version, updated_at, status
    FROM ${q('processes')}
    WHERE id = ${id}""",
"db: detail select status")

apply(DS,
"""      last_reviewed, review_cadence_months, version
    )
    VALUES (""",
"""      last_reviewed, review_cadence_months, version, status
    )
    VALUES (""",
"db: insert column")

apply(DS,
"""      ${process.version || '1.00'}
    )
    ON CONFLICT (id) DO UPDATE SET""",
"""      ${process.version || '1.00'},
      ${process.status === 'draft' ? 'draft' : 'published'}
    )
    ON CONFLICT (id) DO UPDATE SET""",
"db: insert value")

apply(DS,
"""      version = EXCLUDED.version,
      updated_at = now()
  `;

  return getProcessDetail(id);""",
"""      version = EXCLUDED.version,
      status = EXCLUDED.status,
      updated_at = now()
  `;

  return getProcessDetail(id);""",
"db: update status")

# ── API: drafts never reach people without write access ──────
apply(API,
"""        if (!process) {
          res.status(404).json({ error: 'Process not found' });
          return;
        }
        res.status(200).json({ process });
        return;
      }
      res.status(200).json({ processes: await getProcesses() });""",
"""        if (!process || (process.status === 'draft' && !access.write)) {
          res.status(404).json({ error: 'Process not found' });
          return;
        }
        res.status(200).json({ process });
        return;
      }
      const all = await getProcesses();
      // Drafts are visible to PMO/admin only.
      res.status(200).json({ processes: access.write ? all : all.filter((p) => p.status !== 'draft') });""",
"api: hide drafts")

# ── Form buttons ──────────────────────────────────────────────
apply(IDX,
"""      <button class="btn btn-primary btn-sm" type="button" id="pfSaveBtn" onclick="saveProcessForm()">Save process</button>""",
"""      <button class="btn btn-ghost btn-sm" type="button" id="pfDraftBtn" onclick="saveProcessForm('draft')" title="Only PMO/admin can see drafts">Save as draft</button>
      <button class="btn btn-primary btn-sm" type="button" id="pfSaveBtn" onclick="saveProcessForm('published')">Publish</button>""",
"form: buttons")

apply(IDX,
"""function closeProcessForm(){""",
"""// Draft / publish buttons follow the status the process had when the form was opened.
function pfUpdateStatusButtons(){
  const s = window._pfStatus || '';
  const d = document.getElementById('pfDraftBtn'), p = document.getElementById('pfSaveBtn');
  if(d){ d.disabled = false; d.textContent = s === 'published' ? 'Unpublish (save as draft)' : 'Save as draft'; }
  if(p){ p.disabled = false; p.textContent = s === 'published' ? 'Save changes' : 'Publish'; }
  const t = document.getElementById('processFormTitle');
  if(t) t.textContent = (t.textContent || '').replace(/ \\(draft\\)$/, '') + (s === 'draft' ? ' (draft)' : '');
}
window.pfUpdateStatusButtons = pfUpdateStatusButtons;
function closeProcessForm(){""",
"form: status buttons helper")

apply(IDX,
"""  document.getElementById('pfVersion').value = '1.00';
  document.getElementById('pfStepsList').innerHTML = '';""",
"""  document.getElementById('pfVersion').value = '1.00';
  window._pfStatus = ''; // new process: not saved yet
  pfUpdateStatusButtons();
  document.getElementById('pfStepsList').innerHTML = '';""",
"form: reset status on open")

apply(IDX,
"""      document.getElementById('pfOwnerRole').value = process.owner_role || '';""",
"""      window._pfStatus = process.status === 'draft' ? 'draft' : 'published';
      pfUpdateStatusButtons();
      document.getElementById('pfOwnerRole').value = process.owner_role || '';""",
"form: load status")

# ── Save ──────────────────────────────────────────────────────
apply(IDX,
"""async function saveProcessForm(){
  showProcessFormError('');""",
"""async function saveProcessForm(targetStatus){
  const status = targetStatus === 'draft' ? 'draft' : 'published';
  showProcessFormError('');""",
"save: status arg")

apply(IDX,
"""    version: document.getElementById('pfVersion').value.trim() || '1.00'
  };
  const steps = pfCollectSteps();""",
"""    version: document.getElementById('pfVersion').value.trim() || '1.00',
    status
  };
  const steps = pfCollectSteps();""",
"save: payload status")

apply(IDX,
"""  const saveBtn = document.getElementById('pfSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';""",
"""  const saveBtn = document.getElementById('pfSaveBtn'), draftBtn = document.getElementById('pfDraftBtn');
  saveBtn.disabled = true;
  if(draftBtn) draftBtn.disabled = true;
  (status === 'draft' && draftBtn ? draftBtn : saveBtn).textContent = 'Saving…';""",
"save: busy state")

apply(IDX,
"""  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save process';
  }""",
"""  }finally{
    pfUpdateStatusButtons();
  }""",
"save: restore buttons")

# ── List ──────────────────────────────────────────────────────
apply(IDX,
"""<span class="chip badge-green" style="margin-left:8px">Documented</span>""",
"""${p.status === 'draft' ? '<span class="chip badge-yellow" style="margin-left:8px" title="Draft — only PMO/admin can see it until it is published">Draft</span>' : '<span class="chip badge-green" style="margin-left:8px">Documented</span>'}""",
"list: draft badge")

apply(IDX,
"""  if(countEl){ const n = PROCESS_MANAGER_STATE.list.length; countEl.textContent = `${n} process${n === 1 ? '' : 'es'}`; }""",
"""  if(countEl){
    const n = PROCESS_MANAGER_STATE.list.length, dr = PROCESS_MANAGER_STATE.list.filter(p => p.status === 'draft').length;
    countEl.textContent = `${n} process${n === 1 ? '' : 'es'}` + (dr ? ` · ${dr} draft${dr === 1 ? '' : 's'}` : '');
  }""",
"list: draft counter")

apply(IDX,
"""(PROCESS_MANAGER_STATE.list || []).filter(p => processFrequencyHasSchedule(p.frequency))""",
"""(PROCESS_MANAGER_STATE.list || []).filter(p => p.status !== 'draft' && processFrequencyHasSchedule(p.frequency))""",
"calendar: skip drafts")

for p, s in files.items():
    pathlib.Path(p).write_text(s, encoding="utf-8")
print("LISTO")
