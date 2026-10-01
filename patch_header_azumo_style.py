"""
PMO Board — header in azumo.com style.
- Brand: only the Azumo logo (no "PMO Board" text, no yellow v3.0/Feedback pill).
  Feedback link moves into the Settings menu; the version is still in the footer.
- Tabs in the top bar look like azumo.com navigation: plain dark text, no pill backgrounds,
  hover and active in Azumo blue, active marked with a thin blue underline.
- One solid blue call-to-action on the right (Sync), like azumo.com's "Book a Call".
CSS + one link in the Settings menu; no data logic.
Run from the repo root:  python3 patch_header_azumo_style.py
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

# Feedback link into the Settings menu (the pill that held it is hidden below)
apply(
"""          <button class="auth-link" id="authLogoutBtn" onclick="logoutUser()" style="display:none">Logout</button>
        </div>""",
"""          <a class="auth-link" href="mailto:federica.gonzalez@azumo.co?subject=PMO%20Board%20feedback">Feedback</a>
          <button class="auth-link" id="authLogoutBtn" onclick="logoutUser()" style="display:none">Logout</button>
        </div>""",
"settings: feedback link")

apply(
"""body.nav-merged .nav-links{display:none!important}""",
"""body.nav-merged .nav-links{display:none!important}
/* azumo.com style: logo only, plain nav, blue accents */
.nav-brand-copy{display:none!important}
.nav-wordmark{width:96px!important}
nav{background:#fff!important;border-bottom:1px solid rgba(16,24,40,.08)!important;box-shadow:none!important}
body.nav-merged nav .nav-inner{height:56px!important}
body.nav-merged nav .side-index .sidebar-item,
body.nav-merged nav .side-index .sidebar-item:hover,
body.nav-merged nav .side-index .sidebar-item.active{background:transparent!important;border:0!important;box-shadow:none!important;transform:none!important;border-radius:0!important}
body.nav-merged nav .side-index .sidebar-item{color:#1a1f36!important;font-weight:600!important;font-size:.84rem!important;padding:0 12px!important;min-height:56px!important;position:relative!important}
body.nav-merged nav .side-index .sidebar-item:hover,
body.nav-merged nav .side-index .sidebar-item.active{color:#0000FF!important}
body.nav-merged nav .side-index .sidebar-item.active::after{content:'';position:absolute;left:12px;right:12px;bottom:0;height:2px;border-radius:2px;background:#0000FF}
body.nav-merged nav .module-menu-panel .sidebar-item{min-height:34px!important;border-radius:8px!important}
body.nav-merged nav .module-menu-panel .sidebar-item.active::after{display:none}
body.nav-merged nav .nav-refresh{background:#0000FF!important;border:0!important;color:#fff!important;border-radius:8px!important;box-shadow:none!important}""",
"css: azumo.com style header")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
