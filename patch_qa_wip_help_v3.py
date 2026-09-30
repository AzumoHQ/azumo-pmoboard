# QA cleanup v3.0:
# - WIP only for preview-only sections (Billing, Trends); badge injected automatically in preview
# - Overview WIP badge removed
# - Client Directory (infoHub) section removed (Accounts Coverage stays)
# - Help & Changelog out of module nav; reachable from the footer only
# - Release registry PMO_RELEASES drives version in nav pill, footer and Help
import pathlib, re

PATH = pathlib.Path("index.html")
src = PATH.read_text(encoding="utf-8")

def apply(old, new, label):
    global src
    count = src.count(old)
    assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
    src = src.replace(old, new, 1)
    print(f"OK: {label}")

# 1. Overview: remove WIP badge
apply('''        <h1 id="pmoGreeting">Welcome back</h1>
        <span class="badge badge-wip" title="Seccion en reestructuracion.">Work in progress</span>
''', '''        <h1 id="pmoGreeting">Welcome back</h1>
''', "overview: quitar badge WIP")

# 2. Billing / Trends: hardcoded badges out (now injected by applyPreviewOnlyMarkers)
apply('''    <span class="badge badge-wip" title="Seccion en reestructuracion: los reportes de EazyBI se van a reagrupar bajo la pestana Jira.">Work in progress</span>
''', '', "billing: quitar badge hardcodeado")
apply('''    <span class="badge badge-wip" title="Seccion en reestructuracion: vista mensual de Jira/EazyBI. Las metricas semanales de Harvest van a vivir en Metrics.">Work in progress</span>
''', '', "trends: quitar badge hardcodeado")

# 3. Remove Client Directory section (JS renderClientDirectory returns early when #clientDirGrid is missing)
m = re.search(r'<!-- ── INFO HUB ─+ -->\n<section id="infoHub">.*?</section>\n\n', src, re.DOTALL)
assert m and src.count('<section id="infoHub">') == 1, "[infoHub] seccion no encontrada"
assert m.group(0).count('</section>') == 1, "[infoHub] el bloque abarca mas de una seccion"
src = src.replace(m.group(0), '', 1)
print("OK: infoHub: seccion eliminada")
apply("  'infoHub': 'ti-building',\n", "", "infoHub: quitar del icon map")
apply("'accountCoverage','infoHub','harvestHours'", "'accountCoverage','harvestHours'", "infoHub: quitar de preferred")

# 4. Nav pill + footer version driven by registry
apply('<div class="nav-wip-pill"><span>V2.1</span>', '<div class="nav-wip-pill"><span id="pmoVersionNav">v3.0</span>', "nav: version dinamica")
apply('''  PMO Board v3 · Azumo · <span id="footerLastUpdated">Last updated: —</span>''',
'''  PMO Board <span id="pmoVersionFooter">v3.0</span> · Azumo · <span id="footerLastUpdated">Last updated: —</span>
  · <a href="#" class="footer-help-link" onclick="activateModuleTab('helpChangelog');return false;"><i class="ti ti-help-circle"></i> Help &amp; changelog</a>''',
"footer: version + link a Help")

# 5. Help section: version tag + release list rendered from PMO_RELEASES; old list kept as "Before v3.0"
apply('''      <h2>Help &amp; Changelog</h2>
      <div class="sec-tag">v3</div>''',
'''      <h2>Help &amp; Changelog</h2>
      <div class="sec-tag" id="helpVersionTag">v3.0</div>''', "help: tag de version")

apply('''      <!-- What's new -->
      <div class="qa-wrap" style="grid-column:1/-1">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.9rem">What's new in v3</div>
        <div style="display:flex;flex-direction:column;gap:.55rem">
          <div style="display:flex;gap:.75rem;align-items:baseline;font-size:.84rem">
            <span style="color:var(--muted);white-space:nowrap;font-size:.75rem">Sep 2026</span>
            <span><strong>Client Directory</strong> — new section under Clients: cards per client with PM/CSM/TL, click-through detail with active Jira team</span>
          </div>
''', '''      <!-- Releases: rendered from PMO_RELEASES (one entry per promotion to production) -->
      <div class="qa-wrap" style="grid-column:1/-1">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.9rem">Releases</div>
        <div id="helpReleaseList" style="display:flex;flex-direction:column;gap:1rem"></div>
      </div>

      <!-- History before the versioned registry -->
      <details class="qa-wrap" style="grid-column:1/-1">
        <summary style="cursor:pointer;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Before v3.0</summary>
        <div style="display:flex;flex-direction:column;gap:.55rem;margin-top:.9rem">
''', "help: bloque releases + historial previo")

apply('''            <span><strong>Info icons</strong> — Utilization Rate (Assignment) and Utilization Rate (Billing) KPI cards now show formula tooltip on hover</span>
          </div>
        </div>
      </div>
''', '''            <span><strong>Info icons</strong> — Utilization Rate (Assignment) and Utilization Rate (Billing) KPI cards now show formula tooltip on hover</span>
          </div>
        </div>
      </details>
''', "help: cerrar details del historial")

apply('''          <div><strong>Client Directory</strong> — Notion-sourced directory: PM, CSM, TL + active Jira team per client</div>
''', '', "help: sacar Client Directory del section guide")
apply('''          <div><strong>Billing</strong> — eaZyBI billing report embed</div>
          <div><strong>Trends</strong> — historical KPI snapshots</div>''',
'''          <div data-preview-only><strong>Billing</strong> — eaZyBI billing report embed</div>
          <div data-preview-only><strong>Trends</strong> — historical KPI snapshots</div>''', "help: Billing/Trends solo en preview")

# 6. CSS: preview-only elements hidden in production + footer link
apply('''.badge-wip{''', '''html.pmo-prod [data-preview-only]{display:none!important}
.footer-help-link{color:inherit;opacity:.75;text-decoration:none}.footer-help-link:hover{opacity:1;text-decoration:underline}
.badge-wip{''', "css: preview-only + footer link")

# 7. Visibility rules + release registry
apply('''const PREVIEW_ONLY_SECTIONS = new Set(['helpChangelog']);
function sectionAllowedForCurrentRole(id){
  if(IS_PMO_PRODUCTION && PREVIEW_ONLY_SECTIONS.has(id)) return false;
  if(id === 'helpChangelog') return true;''',
'''// WIP = preview-only. Sections listed here are hidden in production and show a
// "WIP · Preview" badge on preview/localhost. Smaller pieces inside a section can be
// marked with the data-preview-only attribute instead.
// TO PROMOTE something to production:
//   1) remove its id from PREVIEW_ONLY_SECTIONS (or drop its data-preview-only attribute)
//   2) add a new entry at the TOP of PMO_RELEASES (version +0.1)
const PREVIEW_ONLY_SECTIONS = new Set(['dashboard','history']);
const PMO_RELEASES = [
  {version:'3.0', date:'2026-09-30', title:'Baseline — QA cleanup', items:[
    'Work in progress badges removed from production: anything still being built now lives only in preview',
    'Billing and Trends moved back to preview while they are restructured',
    'Client Directory removed — client coverage lives in Accounts Coverage',
    'Help & changelog moved to the footer; versions are listed here on every release'
  ]}
];
const PMO_VERSION = 'v' + PMO_RELEASES[0].version;
function renderPmoReleases(){
  ['pmoVersionNav','pmoVersionFooter','helpVersionTag'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = PMO_VERSION;
  });
  const list = document.getElementById('helpReleaseList');
  if(!list) return;
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  list.innerHTML = PMO_RELEASES.map(r => `<div>
    <div style="display:flex;gap:.6rem;align-items:baseline;margin-bottom:.35rem"><strong style="font-size:.9rem">v${esc(r.version)}</strong><span style="font-size:.84rem">${esc(r.title || '')}</span><span style="color:var(--muted);font-size:.75rem;margin-left:auto">${esc(fmt(r.date))}</span></div>
    <ul style="margin:0;padding-left:1.1rem;font-size:.83rem;line-height:1.55">${(r.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
  </div>`).join('');
}
function applyPreviewOnlyMarkers(){
  document.documentElement.classList.toggle('pmo-prod', IS_PMO_PRODUCTION);
  if(IS_PMO_PRODUCTION) return;
  PREVIEW_ONLY_SECTIONS.forEach(id => {
    const h2 = document.querySelector(`#${id} .sec-head h2`);
    if(h2 && !h2.parentNode.querySelector('.badge-wip')) h2.insertAdjacentHTML('afterend', '<span class="badge badge-wip" title="Preview only — not visible in production yet.">WIP · Preview</span>');
  });
}
function sectionAllowedForCurrentRole(id){
  if(IS_PMO_PRODUCTION && PREVIEW_ONLY_SECTIONS.has(id)) return false;
  if(id === 'helpChangelog') return true; // reachable from the footer link, not from the module nav''',
"js: registry + preview-only markers")

# 8. Help out of the module nav
apply('''    {id:'pmoActionCenter', icon:'<i class="ti ti-alert-triangle"></i>', label:'PMO QA', count: qaCount},
    {id:'helpChangelog', icon:'<i class="ti ti-help-circle"></i>', label:'Help'}
  ];''', '''    {id:'pmoActionCenter', icon:'<i class="ti ti-alert-triangle"></i>', label:'PMO QA', count: qaCount}
  ];''', "nav: sacar Help del menu de modulos")

# 9. Run once on load (script sits after </main>, so the DOM is ready)
apply('''window.activateModuleTab = activateModuleTab;
window.toggleModule = toggleModule;''', '''window.activateModuleTab = activateModuleTab;
window.toggleModule = toggleModule;
try { applyPreviewOnlyMarkers(); renderPmoReleases(); } catch(e) { console.warn('[releases]', e); }''', "init: markers + releases")

PATH.write_text(src, encoding="utf-8")
print("DONE")
