"""
PMO Board — compact header (meeting feedback: free up vertical space).
- Top bar 60px -> 48px; subtitle "Operations Command Center" hidden; smaller logo.
- Dark mode / Admin / View as / Logout move into one "Settings" dropdown (same buttons, same ids,
  so all existing logic keeps working). Sync all sources, account and avatar stay visible.
- Module tab bar tighter (less padding / margin) and sticks right under the 48px bar.
Desktop only (>= 900px); mobile layout untouched. CSS + one small HTML wrapper, no data logic.
Run from the repo root:  python3 patch_compact_header.py
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
"""      <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()">Dark</button>
      <button class="nav-refresh" data-sync-action onclick="manualSnapshot()">Sync all sources</button>
      <a class="auth-link" id="adminUsersLink" href="/admin/users" style="display:none">Admin</a>
      <a class="auth-link" id="adminViewAsLink" href="/admin/users" style="display:none">View as</a>
      <button class="auth-pill" id="authStatusBtn" onclick="showAuthModal(currentUser ? 'account' : 'login')">Sign in</button>
      <button class="auth-link" id="authLogoutBtn" onclick="logoutUser()" style="display:none">Logout</button>""",
"""      <button class="nav-refresh" data-sync-action onclick="manualSnapshot()">Sync all sources</button>
      <button class="auth-pill" id="authStatusBtn" onclick="showAuthModal(currentUser ? 'account' : 'login')">Sign in</button>
      <!-- Settings dropdown: same buttons/ids as before, grouped to free up the top bar -->
      <details class="nav-config" id="navConfig">
        <summary title="Settings"><i class="ti ti-settings"></i><span>Settings</span></summary>
        <div class="nav-config-menu">
          <button class="theme-toggle" id="themeToggle" onclick="toggleTheme()">Dark</button>
          <a class="auth-link" id="adminUsersLink" href="/admin/users" style="display:none">Admin</a>
          <a class="auth-link" id="adminViewAsLink" href="/admin/users" style="display:none">View as</a>
          <button class="auth-link" id="authLogoutBtn" onclick="logoutUser()" style="display:none">Logout</button>
        </div>
      </details>""",
"nav: settings dropdown")

apply(
"""</head>""",
"""<style>
/* Compact header (desktop). Overrides only — remove this block to go back to the previous header. */
.nav-config{position:relative}
.nav-inner:has(.nav-config[open]){overflow:visible!important}
.nav-config>summary{list-style:none;display:inline-flex;align-items:center;gap:5px;cursor:pointer;border:1px solid var(--brd);background:var(--card);color:var(--txt);border-radius:8px;padding:5px 10px;font-size:.78rem;font-weight:700;user-select:none}
.nav-config>summary::-webkit-details-marker{display:none}
.nav-config-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:150px;display:flex;flex-direction:column;align-items:stretch;gap:2px;padding:6px;background:var(--card,#fff);border:1px solid var(--brd);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:300}
.nav-config-menu>*{text-align:left!important;justify-content:flex-start!important;text-decoration:none!important;padding:6px 8px!important;border-radius:7px!important;font-size:.8rem!important}
.nav-config-menu>*:hover{background:var(--hov,rgba(107,143,191,.12))}
.nav-config-menu .theme-toggle{border:0!important;background:transparent!important}
@media (min-width:900px){
  .nav-inner{height:48px!important}
  .nav-sub{display:none!important}
  .nav-logo{height:30px!important;min-width:80px!important}
  .nav-wordmark{width:72px!important}
  .side-index{top:48px!important;margin:0 auto .9rem!important;padding:.35rem .6rem!important;border-radius:12px!important}
  .side-index .sidebar-item{min-height:30px!important}
}
</style>
<script>
// Close the Settings dropdown when clicking outside it or pressing Escape.
document.addEventListener('click',function(e){var d=document.getElementById('navConfig');if(d&&d.open&&!d.contains(e.target))d.open=false;});
document.addEventListener('keydown',function(e){var d=document.getElementById('navConfig');if(e.key==='Escape'&&d)d.open=false;});
</script>
</head>""",
"css: compact header")

PATH.write_text(src, encoding="utf-8")
print("LISTO")
