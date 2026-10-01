"""
Process Portal — "Weekly cadence" calendar becomes a collapsible toggle.
- Collapsed by default; click the header to expand/collapse (native <details>).
- Remembers open/closed per browser (localStorage, wrapped in try/catch).
- Header shows how many scheduled steps there are, so you know what's inside without opening it.
Run from the repo root:  python3 patch_process_calendar_toggle.py
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
""".proc-week-cal-note{font-size:.72rem;color:var(--muted);margin-bottom:.7rem}""",
""".proc-week-cal-note{font-size:.72rem;color:var(--muted);margin-bottom:.7rem}
/* Weekly cadence as a toggle: header is the clickable summary, chevron rotates when open */
details.proc-week-cal>summary{list-style:none;cursor:pointer;user-select:none;margin-bottom:0}
details.proc-week-cal>summary::-webkit-details-marker{display:none}
details.proc-week-cal[open]>summary{margin-bottom:.15rem}
.proc-week-cal-chev{margin-left:auto;color:var(--muted);transition:transform .15s}
details.proc-week-cal[open] .proc-week-cal-chev{transform:rotate(180deg)}
.proc-week-cal-count{font-size:.72rem;font-weight:600;color:var(--muted)}""",
"css: calendar toggle")

apply(
"""    <div class="proc-week-cal">
      <div class="proc-week-cal-head"><i class="ti ti-calendar-time"></i> Weekly cadence</div>
      <div class="proc-week-cal-note">Fixed-day steps across all documented processes. Days with nothing scheduled are collapsed.</div>
      <div class="proc-week-cal-grid" id="processWeekCalendarGrid"></div>
    </div>""",
"""    <details class="proc-week-cal" id="processWeekCal" ontoggle="try{localStorage.setItem('pmo.procWeekCalOpen',this.open?'1':'0')}catch(e){}">
      <summary class="proc-week-cal-head"><i class="ti ti-calendar-time"></i> Weekly cadence <span class="proc-week-cal-count" id="processWeekCalCount"></span><i class="ti ti-chevron-down proc-week-cal-chev"></i></summary>
      <div class="proc-week-cal-note">Fixed-day steps across all documented processes. Days with nothing scheduled are collapsed.</div>
      <div class="proc-week-cal-grid" id="processWeekCalendarGrid"></div>
    </details>""",
"html: calendar as <details>")

apply(
"""  if(calWrap) calWrap.style.display = WEEK_DAYS.some(d => byDay[d.key].length) ? '' : 'none';""",
"""  if(calWrap) calWrap.style.display = WEEK_DAYS.some(d => byDay[d.key].length) ? '' : 'none';
  // Toggle: collapsed by default, remembers the last state in this browser; header shows the step count.
  const calCount = document.getElementById('processWeekCalCount');
  if(calCount){ const n = WEEK_DAYS.reduce((a, d) => a + byDay[d.key].length, 0); calCount.textContent = `· ${n} scheduled step${n === 1 ? '' : 's'}`; }
  if(calWrap && !calWrap.dataset.init){
    calWrap.dataset.init = '1';
    let saved = null; try{ saved = localStorage.getItem('pmo.procWeekCalOpen'); }catch(e){}
    calWrap.open = saved === '1';
  }""",
"js: count + remembered state")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
