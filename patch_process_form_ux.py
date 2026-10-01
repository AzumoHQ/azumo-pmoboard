"""
Process Portal — form UX pass
1) Diagram readable: wider left pane on large screens; diagram renders at real size (100%) with scroll,
   zoom changes its real width (no blurry transform), new "Fit" button fits it to the pane.
2) Section navigation: sticky chips at the top of the form (Basics · Definition · Roles · Related ·
   Steps · Validations · Resources); click jumps to the section, the current one is highlighted.
3) Basics re-ordered by importance: Name / Owner + Co-responsible / metadata row (ID · Version · Last reviewed).
4) ID (slug) fills itself from the Name for new processes (you can still edit it).
5) Section titles darker and easier to scan.
Data and saving logic are untouched.
Run from the repo root:  python3 patch_process_form_ux.py
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
""".pf-split-right .pf-section>.pf-field-hint{top:1rem}""",
""".pf-split-right .pf-section>.pf-field-hint{top:1rem}
/* UX pass: wider diagram pane, sticky section nav, clearer section titles, metadata row */
@media (min-width:1100px){.pf-split{grid-template-columns:minmax(420px,44%) 1fr}}
.pf-split-right .pf-section-head h4{color:var(--txt);font-size:.8rem}
.pf-secnav{position:sticky;top:-.9rem;z-index:5;display:flex;flex-wrap:wrap;gap:4px;margin:-.9rem -1.1rem .6rem;padding:.55rem 1.1rem;background:var(--card,#fff);border-bottom:1px solid var(--brd)}
.pf-secnav button{border:1px solid var(--brd);background:transparent;color:var(--muted);border-radius:999px;padding:.12rem .6rem;font:inherit;font-size:.72rem;font-weight:600;cursor:pointer}
.pf-secnav button:hover{color:var(--txt);border-color:var(--txt)}
.pf-secnav button.on{background:var(--blue);border-color:var(--blue);color:#fff}
.pf-grid-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem .9rem;grid-column:1/-1}
.pf-grid-meta input{font-size:.8rem}
#pfSwimlane .proc-diagram-svg{min-width:0;max-width:none;flex:0 0 auto}""",
"css: ux pass")

# ── Basics: Name / Owner + Co-responsible / meta row; slug auto-fill ──
apply(
"""            <div class="auth-field pf-field-full">
              <label for="pfName">Name</label>
              <input type="text" id="pfName" placeholder="Process name">
            </div>
            <div class="auth-field">
              <label for="pfId">ID (slug)</label>
              <input type="text" id="pfId" placeholder="process-slug">
            </div>
            <div class="auth-field">
              <label for="pfVersion">Version</label>
              <input type="text" id="pfVersion" value="1.00">
            </div>
            <div class="auth-field">
              <label for="pfOwnerRole">Owner role</label>""",
"""            <div class="auth-field pf-field-full">
              <label for="pfName">Name</label>
              <input type="text" id="pfName" placeholder="Process name" oninput="pfAutoSlug()">
            </div>
            <div class="auth-field">
              <label for="pfOwnerRole">Owner role</label>""",
"basics: name first, owner next")

apply(
"""            <div class="auth-field">
              <label for="pfLastReviewed">Last reviewed</label>
              <input type="date" id="pfLastReviewed">
            </div>""",
"""            <div class="pf-grid-meta">
              <div class="auth-field">
                <label for="pfId">ID</label>
                <input type="text" id="pfId" placeholder="process-slug" oninput="this.dataset.touched='1'">
              </div>
              <div class="auth-field">
                <label for="pfVersion">Version</label>
                <input type="text" id="pfVersion" value="1.00">
              </div>
              <div class="auth-field">
                <label for="pfLastReviewed">Last reviewed</label>
                <input type="date" id="pfLastReviewed">
              </div>
            </div>""",
"basics: metadata row")

apply(
"""  document.getElementById('pfId').disabled = false;""",
"""  document.getElementById('pfId').disabled = false;
  delete document.getElementById('pfId').dataset.touched;""",
"open: reset slug touched")

# ── Sticky section nav ─────────────────────────────────────────
apply(
"""      <div class="pf-split-right">""",
"""      <div class="pf-split-right" id="pfFormScroll" onscroll="pfSecNavSync()">
        <nav class="pf-secnav" id="pfSecNav" aria-label="Form sections"></nav>""",
"html: section nav")

# ── Diagram: real-size zoom + Fit ─────────────────────────────
apply(
"""function pfApplySwimlaneZoom(){
  const svg=document.querySelector('#pfSwimlane .proc-diagram-svg');
  if(svg)svg.style.transform='scale('+_pfZoom+')';""",
"""function pfApplySwimlaneZoom(){
  const svg=document.querySelector('#pfSwimlane .proc-diagram-svg');
  // Zoom changes the real width (crisp text, correct scrollbars) instead of a CSS transform.
  const vb=svg&&svg.viewBox&&svg.viewBox.baseVal;
  if(svg&&vb&&vb.width){svg.style.transform='none';svg.style.width=Math.round(vb.width*_pfZoom)+'px';}
  else if(svg)svg.style.transform='scale('+_pfZoom+')';""",
"zoom: real width")

apply(
"""function pfZoomReset(){_pfZoom=1;pfApplySwimlaneZoom();}""",
"""function pfZoomReset(){window._pfZoomManual=true;_pfZoom=1;pfApplySwimlaneZoom();}
// Fit mode (default): the diagram re-fits the pane on every change until you zoom by hand.
function pfZoomFit(){
  window._pfZoomManual=false;
  const c=document.getElementById('pfSwimlane'),svg=c&&c.querySelector('.proc-diagram-svg');
  const vb=svg&&svg.viewBox&&svg.viewBox.baseVal;if(!vb||!vb.width)return;
  _pfZoom=Math.max(.2,Math.min(2,parseFloat(((c.clientWidth-20)/vb.width).toFixed(2))));pfApplySwimlaneZoom();
}
window.pfZoomFit=pfZoomFit;
// Section nav: one chip per form section; click scrolls, scrolling highlights the current one.
function pfSecNavBuild(){
  const nav=document.getElementById('pfSecNav'),box=document.getElementById('pfFormScroll');if(!nav||!box)return;
  const secs=Array.from(box.querySelectorAll('.pf-section'));
  nav.innerHTML=secs.map((s,i)=>{const t=(s.querySelector('.pf-section-head h4')?.textContent||'').trim();
    return `<button type="button" data-i="${i}" onclick="pfSecNavGo(${i})">${esc(t.replace('Roles & responsibilities','Roles').replace('Related processes','Related'))}</button>`;}).join('');
  pfSecNavSync();
}
function pfSecNavGo(i){
  const box=document.getElementById('pfFormScroll'),s=box&&box.querySelectorAll('.pf-section')[i];if(!s)return;
  box.scrollTo({top:Math.max(0,s.offsetTop-box.offsetTop-44),behavior:'smooth'});
}
function pfSecNavSync(){
  const box=document.getElementById('pfFormScroll'),nav=document.getElementById('pfSecNav');if(!box||!nav)return;
  const secs=Array.from(box.querySelectorAll('.pf-section'));let cur=0;
  secs.forEach((s,i)=>{if(s.offsetTop-box.offsetTop-60<=box.scrollTop)cur=i;});
  if(box.scrollTop+box.clientHeight>=box.scrollHeight-4)cur=secs.length-1;
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('on',Number(b.dataset.i)===cur));
}
// New processes: the ID follows the Name until you type in the ID yourself.
function pfAutoSlug(){
  const id=document.getElementById('pfId');if(!id||id.disabled||id.dataset.touched)return;
  id.value=(document.getElementById('pfName')?.value||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
}
window.pfSecNavGo=pfSecNavGo;window.pfSecNavSync=pfSecNavSync;window.pfAutoSlug=pfAutoSlug;""",
"js: fit, section nav, auto slug")

apply(
"""function pfZoomIn(){_pfZoom=Math.min(4,parseFloat((_pfZoom*1.2).toFixed(2)));pfApplySwimlaneZoom();}
function pfZoomOut(){_pfZoom=Math.max(.2,parseFloat((_pfZoom/1.2).toFixed(2)));pfApplySwimlaneZoom();}""",
"""function pfZoomIn(){window._pfZoomManual=true;_pfZoom=Math.min(4,parseFloat((_pfZoom*1.2).toFixed(2)));pfApplySwimlaneZoom();}
function pfZoomOut(){window._pfZoomManual=true;_pfZoom=Math.max(.2,parseFloat((_pfZoom/1.2).toFixed(2)));pfApplySwimlaneZoom();}""",
"zoom in/out: manual")

apply(
"""        _pfZoom = Math.min(4, Math.max(.2, parseFloat((_pfZoom * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));""",
"""        window._pfZoomManual = true;
        _pfZoom = Math.min(4, Math.max(.2, parseFloat((_pfZoom * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));""",
"wheel zoom: manual")

apply(
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes,Object.assign({trigger:(document.getElementById('pfTrigger')?.value||''),frequency:(document.getElementById('pfFrequency')?.value||'')},pfRelatedNames()));
  pfApplySwimlaneZoom();""",
"""  renderProcessDiagram('pfSwimlane',d.steps,d.lanes,Object.assign({trigger:(document.getElementById('pfTrigger')?.value||''),frequency:(document.getElementById('pfFrequency')?.value||'')},pfRelatedNames()));
  pfApplySwimlaneZoom();
  if(!window._pfZoomManual) pfZoomFit();""",
"render: keep fit")

apply(
"""            <button type="button" onclick="pfZoomReset()" title="Reset zoom" style="font-size:.7rem;padding:.1rem .45rem">&#x229F; Reset</button>""",
"""            <button type="button" onclick="pfZoomReset()" title="Actual size" style="font-size:.7rem;padding:.1rem .45rem">100%</button>
            <button type="button" onclick="pfZoomFit()" title="Fit to pane" style="font-size:.7rem;padding:.1rem .45rem">Fit</button>""",
"toolbar: 100% + Fit")

apply(
"""    _pfZoom = 1; // resetear zoom al abrir
    setTimeout(pfRefreshDiagramPreview, 80);""",
"""    _pfZoom = 1; // resetear zoom al abrir
    window._pfZoomManual = false; // open in fit mode
    pfSecNavBuild();
    const fs = document.getElementById('pfFormScroll'); if(fs) fs.scrollTop = 0;
    setTimeout(pfRefreshDiagramPreview, 80);""",
"open: build nav")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
