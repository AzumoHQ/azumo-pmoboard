"""
PMO Board — one-row header when it fits (wide screens).
- Module tabs (General, Assignments, Harvest, Reports, Process Portal, PMO QA) move into the top bar,
  next to "PMO Board". Same element, same buttons and dropdowns — it is only relocated on load.
- "PMO Board" in Azumo blue (#0000FF).
- Azumo logo: just the wordmark (no white box / border / shadow).
If the row doesn't fit the window, the current two-row layout is kept automatically. CSS + a tiny relocation script; no data logic.
Run from the repo root:  python3 patch_header_tabs_in_nav.py
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
"""// Close the Settings dropdown when clicking outside it or pressing Escape.""",
"""// One-row header: on wide screens, move the module tabs into the top bar next to "PMO Board".
document.addEventListener('DOMContentLoaded',function(){
  try{
    if(window.innerWidth < 900) return;
    var tabs=document.getElementById('layoutSidebar'), inner=document.querySelector('nav .nav-inner'), brand=inner&&inner.querySelector('.nav-brand');
    if(!tabs||!inner||!brand) return;
    var home=tabs.nextElementSibling;
    brand.insertAdjacentElement('afterend', tabs);
    document.body.classList.add('nav-merged');
    // If it doesn't fit on one row at this window size, put the tabs back where they were.
    setTimeout(function(){
      var links=document.getElementById('moduleIndexLinks'), right=inner.querySelector('.nav-right');
      var last=links&&links.lastElementChild;
      var overlaps=(last&&right&&last.getBoundingClientRect().right > right.getBoundingClientRect().left - 8) || inner.scrollWidth > inner.clientWidth + 2;
      if(overlaps){
        document.body.classList.remove('nav-merged');
        if(home&&home.parentNode) home.parentNode.insertBefore(tabs, home);
      }
    }, 600);
  }catch(e){}
});
// Close the Settings dropdown when clicking outside it or pressing Escape.""",
"js: move tabs into nav")

apply(
""".nav-inner:has(.nav-config[open]){overflow:visible!important}""",
""".nav-inner:has(.nav-config[open]){overflow:visible!important}
/* Brand: Azumo wordmark only + "PMO Board" in Azumo blue */
.nav-logo{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;min-width:0!important}
.nav-title{color:#0000FF!important}
/* One-row header (tabs moved into the nav by script on wide screens) */
body.nav-merged nav .nav-inner{max-width:none!important;width:100%!important;box-sizing:border-box!important;padding:0 24px!important;overflow:visible!important;gap:10px!important}
body.nav-merged .nav-brand{flex:0 0 auto}
body.nav-merged nav .side-index{position:static!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none!important;overflow:visible!important;border-radius:0!important}
body.nav-merged nav #moduleIndexLinks{flex-wrap:nowrap!important;gap:2px!important}
body.nav-merged nav .side-index .sidebar-item{min-height:30px!important;padding:0 7px!important;font-size:.76rem!important}
body.nav-merged nav .nav-right{gap:8px!important}
/* 'Sync all sources' reads 'Sync' in the one-row header (same button) */
body.nav-merged nav .nav-refresh{font-size:0!important;padding:6px 12px!important}
body.nav-merged nav .nav-refresh::after{content:'Sync';font-size:.8rem;font-weight:700}
body.nav-merged .nav-links{display:none!important}""",
"css: one-row header + brand")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
