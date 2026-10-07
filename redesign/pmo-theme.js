/* PMO Board — Deep-Slate / Azumo Blue preview: small DOM additions the look & feel needs.
   Only runs when the preview is on (window.PMO_LF). It never changes data, it only adds:
   page subtitles, the logo tile, the Dark/Light segmented control, the "Preview" badge,
   and mono numbers in table cells. */
(function(){
  if(!window.PMO_LF) return;

  // One-line subtitle per page: what you see and with what scope (edit freely).
  var SUBS = {
    newSearchesTriage: 'Open searches from the source report · triage by priority and status',
    dashboard: 'Billing reports from eazyBI · current period',
    opsViews: 'Who is assigned where · by assignee, project manager and client',
    pmoActionCenter: 'Open QA alerts and data checks · what needs action today',
    harvestAccess: 'Harvest project assignments vs. Jira · access mismatches',
    psaProjectStatus: 'Project status reports from Jira PSA · latest report per project',
    accountCoverage: 'Account ownership per client · PM, CSM and TL coverage',
    dueDates: 'Assignments with an upcoming due date · from Jira',
    pendingAssignments: 'Assignments waiting for a start date or an owner',
    bench: 'People without a billable assignment · availability',
    azumo: 'Internal project allocation · from the eazyBI Azumo report',
    harvestHours: 'Logged hours per person for the selected week · from Harvest',
    history: 'Key metrics over time · monthly snapshots',
    forecast: 'Assignment due dates by month · Jira In Progress',
    processes: 'Documented Azumo processes · steps, roles and flows',
    helpChangelog: 'How to use the board and what changed in each version'
  };

  function ready(fn){ if(document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function(){
    // 1) Page subtitles
    Object.keys(SUBS).forEach(function(id){
      var sec = document.getElementById(id);
      var head = sec && sec.querySelector('.sec-head');
      if(!head || (head.nextElementSibling && head.nextElementSibling.classList.contains('lf-page-sub'))) return;
      var p = document.createElement('p');
      p.className = 'lf-page-sub';
      p.textContent = SUBS[id];
      head.insertAdjacentElement('afterend', p);
    });

    // 2) Logo: official Azumo wordmark (same as azumo.com) + " · PMO Board"
    var logo = document.querySelector('nav .nav-logo');
    if(logo && !logo.querySelector('.lf-brand')){
      var b = document.createElement('span');
      b.className = 'lf-brand';
      b.innerHTML = '<img class="lf-logo" src="assets/azumo-logo.png" alt="Azumo PMO Board">';
      logo.appendChild(b);
    }

    // 2a) Account: the avatar opens the account (same as the name pill). Once signed in the pill
    //     is hidden from the top bar and the name shows as the avatar tooltip.
    var av = document.getElementById('authAvatar'), pill = document.getElementById('authStatusBtn');
    if(av && pill && !av.dataset.lfAcct){
      av.dataset.lfAcct = '1';
      av.setAttribute('role', 'button');
      av.tabIndex = 0;
      av.style.cursor = 'pointer';
      av.addEventListener('click', function(){ pill.click(); });
      av.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pill.click(); } });
      var acct = function(){
        var t = (pill.textContent || '').trim();
        var signedIn = !!t && !/^sign in$/i.test(t);
        pill.classList.toggle('lf-hide', signedIn);
        av.title = signedIn ? t : 'Sign in';
        av.setAttribute('aria-label', signedIn ? 'Account: ' + t : 'Sign in');
      };
      acct();
      try{ new MutationObserver(acct).observe(pill, {childList: true, characterData: true, subtree: true}); }catch(_){}
    }

    // 2c) Settings = gear icon (the text stays for screen readers and the tooltip)
    var cfg = document.querySelector('#navConfig > summary');
    if(cfg && !cfg.querySelector('.lf-gear')){
      cfg.insertAdjacentHTML('afterbegin', '<svg class="lf-ico lf-gear" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M3.5 12.5l1.3-1.3M11.2 4.8l1.3-1.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>');
      cfg.setAttribute('aria-label', 'Settings');
    }

    // 2b) Top bar fit: tabs sit next to the logo only when everything fits; otherwise they drop to their own row.
    var tabs = document.getElementById('layoutSidebar');
    var home = null;
    if(tabs && !document.body.classList.contains('nav-merged')){
      home = document.createElement('span');
      home.id = 'lfTabsHome';
      home.hidden = true;
      tabs.parentNode.insertBefore(home, tabs);
    }
    function overflowing(){
      var inner = document.querySelector('nav .nav-inner'), right = inner && inner.querySelector('.nav-right');
      var links = document.getElementById('moduleIndexLinks'), last = links && links.lastElementChild;
      if(!inner) return false;
      return (last && right && last.getBoundingClientRect().right > right.getBoundingClientRect().left - 8) || inner.scrollWidth > inner.clientWidth + 2;
    }
    function unmerge(){
      if(!tabs || !home) return;
      document.body.classList.remove('nav-merged');
      if(tabs.previousElementSibling !== home) home.parentNode.insertBefore(tabs, home.nextSibling);
    }
    function merge(){
      var inner = document.querySelector('nav .nav-inner'), brand = inner && inner.querySelector('.nav-brand');
      if(!tabs || !brand) return;
      if(brand.nextElementSibling !== tabs) brand.insertAdjacentElement('afterend', tabs);
      document.body.classList.add('nav-merged');
    }
    function fit(){
      if(!tabs || !home) return;
      if(window.innerWidth < 900){ unmerge(); return; }
      merge();
      if(overflowing()) unmerge();
    }
    var fitT = null;
    window.addEventListener('resize', function(){ clearTimeout(fitT); fitT = setTimeout(fit, 120); });
    setTimeout(fit, 700);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ setTimeout(fit, 50); });

    // 3) Dark / Light segmented control in the top bar
    var right = document.querySelector('nav .nav-right');
    var seg = document.getElementById('lfThemeSeg');
    if(right && !seg){
      seg = document.createElement('div');
      seg.id = 'lfThemeSeg';
      seg.className = 'lf-seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Theme');
      // Icons only: moon = Dark, sun = Light (SVG inline, currentColor; the label stays for screen readers and tooltip)
      var MOON = '<svg class="lf-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      var SUN = '<svg class="lf-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      seg.innerHTML = '<button type="button" data-t="dark" aria-label="Dark theme" title="Dark theme">' + MOON + '</button>' +
                      '<button type="button" data-t="light" aria-label="Light theme" title="Light theme">' + SUN + '</button>';
      seg.addEventListener('click', function(e){
        var t = e.target.closest('button'); if(!t) return;
        try{ localStorage.setItem('pmo_dashboard_theme', t.dataset.t); }catch(_){}
        if(typeof applyTheme === 'function') applyTheme(t.dataset.t);
        sync();
      });
      // Lives inside the Settings menu so the top bar fits on one row
      var cfgMenu = document.querySelector('#navConfig .nav-config-menu');
      if(cfgMenu) cfgMenu.insertBefore(seg, cfgMenu.firstChild);
      else right.insertBefore(seg, right.firstChild);
    }
    function sync(){
      if(!seg) return;
      var cur = document.body.classList.contains('light') ? 'light' : 'dark';
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function(btn){
        var on = btn.dataset.t === cur;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    document.addEventListener('pmo-theme', sync);
    sync();

    // 5) Numbers in table cells -> mono (cells whose whole text is a number, %, hours…)
    var NUM = /^[\s$€£+\-−–~≈]*\d[\d.,\s]*(%|h|hrs?|d|pp|x|fte)?\s*$/i;
    function tagCells(){
      var cells = document.querySelectorAll('td:not([data-lfn])');
      for(var i = 0; i < cells.length; i++){
        var td = cells[i];
        td.setAttribute('data-lfn', '1');
        if(td.children.length) continue;
        var t = td.textContent.trim();
        if(t === '—' || t === '-') td.classList.add('lf-dash');
        else if(NUM.test(t)) td.classList.add('lf-num');
      }
    }
    var pending = false;
    new MutationObserver(function(){
      if(pending) return;
      pending = true;
      requestAnimationFrame(function(){ pending = false; tagCells(); });
    }).observe(document.body, {childList: true, subtree: true});
    tagCells();
  });
})();
