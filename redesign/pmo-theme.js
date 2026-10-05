/* PMO Board — Deep-Slate / Teal preview: small DOM additions the look & feel needs.
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

    // 2) Logo: tile + "azumo · PMO Board"
    var logo = document.querySelector('nav .nav-logo');
    if(logo && !logo.querySelector('.lf-brand')){
      var b = document.createElement('span');
      b.className = 'lf-brand';
      b.innerHTML = '<span class="lf-tile" aria-hidden="true">A</span><span class="lf-word"><span class="lf-word-co">azumo</span><span class="lf-word-dot"> · </span><span class="lf-word-sec">PMO Board</span></span>';
      logo.appendChild(b);
    }

    // 3) Dark / Light segmented control in the top bar
    var right = document.querySelector('nav .nav-right');
    var seg = document.getElementById('lfThemeSeg');
    if(right && !seg){
      seg = document.createElement('div');
      seg.id = 'lfThemeSeg';
      seg.className = 'lf-seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Theme');
      seg.innerHTML = '<button type="button" data-t="dark">Dark</button><button type="button" data-t="light">Light</button>';
      seg.addEventListener('click', function(e){
        var t = e.target.closest('button'); if(!t) return;
        try{ localStorage.setItem('pmo_dashboard_theme', t.dataset.t); }catch(_){}
        if(typeof applyTheme === 'function') applyTheme(t.dataset.t);
        sync();
      });
      right.insertBefore(seg, right.firstChild);
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

    // 4) "Preview" badge with a way out
    if(!document.getElementById('lfPreviewBadge')){
      var badge = document.createElement('div');
      badge.id = 'lfPreviewBadge';
      badge.className = 'lf-preview-badge';
      badge.innerHTML = 'Preview · new look &amp; feel <a href="?lf=0">Exit</a>';
      document.body.appendChild(badge);
    }

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
