"""
Process Portal — "Weekly cadence" becomes a small strip at the BOTTOM of the section.
- One compact row Mon..Sun with a count per day; TODAY is highlighted and its processes listed.
- Click another day to see what runs that day (click again / click today to go back).
- Never disappears: if no step has a fixed day yet, it shows a short hint instead of hiding.
Replaces the collapsible version from patch_process_calendar_toggle.py.
Run from the repo root:  python3 patch_process_week_strip.py
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

# ── CSS ────────────────────────────────────────────────────────
apply(
""".proc-week-cal-count{font-size:.72rem;font-weight:600;color:var(--muted)}""",
""".proc-week-cal-count{font-size:.72rem;font-weight:600;color:var(--muted)}
/* Compact weekly strip (bottom of Process Portal): 7 small day pills + what runs on the selected day (today by default) */
.proc-week-strip{display:flex;align-items:center;flex-wrap:wrap;gap:.45rem .7rem;margin-top:.8rem;padding:.45rem .7rem;border:1px solid var(--brd);border-radius:var(--r);background:var(--surf);font-size:.74rem}
.proc-week-strip-head{display:flex;align-items:center;gap:5px;font-weight:700;color:var(--muted);white-space:nowrap}
.proc-week-strip-days{display:flex;gap:4px}
.proc-week-pill{border:1px solid var(--brd);background:var(--card);color:var(--muted);border-radius:999px;padding:1px 8px;font-size:.7rem;font-weight:700;cursor:pointer;line-height:1.6;font-family:inherit}
.proc-week-pill.has{color:var(--txt)}
.proc-week-pill .n{display:inline-block;min-width:14px;margin-left:3px;padding:0 4px;border-radius:999px;background:rgba(0,102,255,.12);color:var(--blue-lt);font-size:.64rem}
.proc-week-pill.today{border-color:var(--blue-lt);background:var(--blue-lt);color:#fff}
.proc-week-pill.today .n{background:rgba(255,255,255,.25);color:#fff}
.proc-week-pill.sel:not(.today){border-color:var(--blue-lt);color:var(--blue-lt)}
.proc-week-strip-detail{flex:1 1 260px;color:var(--txt);min-width:0}
.proc-week-strip-detail b{color:var(--blue-lt)}
.proc-week-strip-detail .muted{color:var(--muted);font-style:italic}""",
"css: week strip")

# ── HTML: remove the big block at the top… ─────────────────────
apply(
"""    <details class="proc-week-cal" id="processWeekCal" ontoggle="try{localStorage.setItem('pmo.procWeekCalOpen',this.open?'1':'0')}catch(e){}">
      <summary class="proc-week-cal-head"><i class="ti ti-calendar-time"></i> Weekly cadence <span class="proc-week-cal-count" id="processWeekCalCount"></span><i class="ti ti-chevron-down proc-week-cal-chev"></i></summary>
      <div class="proc-week-cal-note">Fixed-day steps across all documented processes. Days with nothing scheduled are collapsed.</div>
      <div class="proc-week-cal-grid" id="processWeekCalendarGrid"></div>
    </details>

""",
"",
"html: remove top calendar")

# ── …and add the small strip at the bottom ─────────────────────
apply(
"""    <div id="processEmptyState" style="display:none;text-align:center;color:var(--muted);font-size:.82rem;padding:2rem 0">No processes match that search.</div>
  </section>""",
"""    <div id="processEmptyState" style="display:none;text-align:center;color:var(--muted);font-size:.82rem;padding:2rem 0">No processes match that search.</div>

    <div class="proc-week-strip" id="processWeekCal" title="Steps with a fixed day (weekly / biweekly processes)">
      <span class="proc-week-strip-head"><i class="ti ti-calendar-time"></i> This week</span>
      <div class="proc-week-strip-days" id="processWeekCalendarGrid"></div>
      <div class="proc-week-strip-detail" id="processWeekCalDetail"></div>
    </div>
  </section>""",
"html: bottom week strip")

# ── JS: new renderer body ──────────────────────────────────────
apply(
"""  // Nothing scheduled anywhere -> hide the whole calendar instead of showing seven empty boxes.
  const calWrap = grid.closest('.proc-week-cal');
  if(calWrap) calWrap.style.display = WEEK_DAYS.some(d => byDay[d.key].length) ? '' : 'none';
  // Toggle: collapsed by default, remembers the last state in this browser; header shows the step count.
  const calCount = document.getElementById('processWeekCalCount');
  if(calCount){ const n = WEEK_DAYS.reduce((a, d) => a + byDay[d.key].length, 0); calCount.textContent = `· ${n} scheduled step${n === 1 ? '' : 's'}`; }
  if(calWrap && !calWrap.dataset.init){
    calWrap.dataset.init = '1';
    let saved = null; try{ saved = localStorage.getItem('pmo.procWeekCalOpen'); }catch(e){}
    calWrap.open = saved === '1';
  }
  // Empty days collapse to a narrow column so the eye goes straight to the days that matter.
  grid.style.gridTemplateColumns = WEEK_DAYS.map(d => byDay[d.key].length ? 'minmax(130px,1fr)' : '46px').join(' ');
  grid.innerHTML = WEEK_DAYS.map(d => {
    const items = byDay[d.key];
    if(!items.length){
      return `<div class="proc-week-cal-day empty ${d.key === todayKey ? 'today' : ''}" title="No fixed-day steps on ${d.label}"><div class="proc-week-cal-day-label">${d.label}</div></div>`;
    }
    const body = items.map(it => `<div class="proc-week-cal-item"><b>${esc(it.processName)}</b>${esc(it.title)}</div>`).join('');
    return `<div class="proc-week-cal-day ${d.key === todayKey ? 'today' : ''}">
      <div class="proc-week-cal-day-label">${d.label}</div>
      ${body}
    </div>`;
  }).join('');
}""",
"""  // Compact strip: 7 pills (today highlighted) + what runs on the selected day. Never hidden.
  const sel = (window._procWeekSel && byDay[window._procWeekSel]) ? window._procWeekSel : todayKey;
  grid.innerHTML = WEEK_DAYS.map(d => {
    const items = byDay[d.key];
    const tip = items.length ? items.map(it => `${it.processName}: ${it.title}`).join('\\n') : `Nothing scheduled on ${d.label}`;
    return `<button type="button" class="proc-week-pill${items.length ? ' has' : ''}${d.key === todayKey ? ' today' : ''}${d.key === sel ? ' sel' : ''}" data-day="${d.key}" title="${esc(tip)}" onclick="procWeekSelect(this.dataset.day)">${d.label}${items.length ? `<span class="n">${items.length}</span>` : ''}</button>`;
  }).join('');
  const detail = document.getElementById('processWeekCalDetail');
  if(!detail) return;
  const anyScheduled = WEEK_DAYS.some(d => byDay[d.key].length);
  const items = byDay[sel] || [];
  const dayName = sel === todayKey ? 'Today' : (WEEK_DAYS.find(d => d.key === sel) || {}).label;
  if(!anyScheduled){
    detail.innerHTML = `<span class="muted">No fixed-day steps yet — set a day on the steps of weekly / biweekly processes to see them here.</span>`;
  } else if(!items.length){
    detail.innerHTML = `<span class="muted">${esc(dayName)}: nothing scheduled.</span>`;
  } else {
    // Group the day's steps by process: "Billing Process (Send report, Check hours)"
    const byProc = {};
    items.forEach(it => { (byProc[it.processName] = byProc[it.processName] || []).push(it.title); });
    detail.innerHTML = `${esc(dayName)}: ` + Object.entries(byProc).map(([p, t]) => `<b>${esc(p)}</b> (${t.map(esc).join(', ')})`).join(' · ');
  }
}
function procWeekSelect(day){
  window._procWeekSel = (window._procWeekSel === day) ? null : day;
  renderProcessWeekCalendar();
}
window.procWeekSelect = procWeekSelect;""",
"js: compact strip renderer")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
