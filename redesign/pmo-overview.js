/* ============================================================
   PMO Overview — data renderer (vanilla JS, no framework)
   Fills #pmoOverview from REAL dashboard data. Never invents
   names, metrics, dates or users.

   Integration (see INTEGRATION.md):
     - The existing index.html already exposes globals:
         PMO          → /api/dashboard payload  { snapshots:[], last_refresh_at, last_refresh }
         latest       → PMO.snapshots[last]
         prev         → PMO.snapshots[last-1] (or null)
         currentUser  → /api/auth user { name, email, role }
     - Call renderPmoOverview() from initDashboard() (after `latest`
       is assigned), and again from updateAuthUi() so the greeting
       updates on login. It reads the globals itself.

   You can also call it explicitly for tests:
     renderPmoOverview({ snapshot, prev, snapshots, user, lastRefresh })
   ============================================================ */
(function (global) {
  'use strict';

  var ICON = {
    people: 'groups', billable: 'badge', bench: 'chair',
    clients: 'apartment', util: 'trending_up'
  };

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function pct(v) { var n = num(v); return n === null ? '—' : (Math.round(n * 100) / 100) + '%'; }
  function intStr(v) { var n = num(v); return n === null ? '—' : String(Math.round(n)); }
  function metricTotalPeople(snapshot) {
    if (typeof global.overviewPeopleCount === 'function') {
      var mapped = num(global.overviewPeopleCount(snapshot));
      if (mapped !== null) return mapped;
    }
    var m = snapshot && snapshot.metrics || {};
    var direct = num(m.headcount_total);
    if (direct !== null && direct > 0) return direct;
    var billable = num(m.headcount_billable);
    var bench = Array.isArray(snapshot && snapshot.bench_list) ? snapshot.bench_list.length : num(m.bench);
    if (billable !== null || bench !== null) return (billable || 0) + (bench || 0);
    var nonbill = num(m.headcount_nonbillable);
    return (billable === null && nonbill === null) ? null : (billable || 0) + (nonbill || 0);
  }
  function metricActiveClients(snapshot) {
    var m = snapshot && snapshot.metrics || {};
    var direct = num(m.active_clients);
    if (direct !== null && direct > 0) return direct;
    return Array.isArray(snapshot && snapshot.active_clients) ? snapshot.active_clients.length : direct;
  }

  function firstName(user) {
    var raw = (user && (user.name || user.email) || '').trim();
    if (!raw) return '';
    if (raw.indexOf('@') > -1 && !user.name) raw = raw.split('@')[0].replace(/[._-]+/g, ' ');
    return raw.split(/\s+/)[0].replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function greeting(user) {
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening');
    var fn = firstName(user);
    return fn ? (part + ', ' + fn) : (part);   // dynamic — falls back with no name, never hardcoded
  }

  function fmtRefresh(meta) {
    // meta can be an ISO string, a plain label, or {at, label}
    var at = meta && (meta.at || meta.last_refresh_at);
    var label = meta && (meta.label || meta.last_refresh);
    var iso = at || (typeof meta === 'string' && /\d{4}-\d{2}-\d{2}/.test(meta) ? meta : null);
    if (iso) {
      var d = new Date(iso);
      if (!isNaN(d)) return 'Last refresh: ' + d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }
    if (label) return 'Last refresh: ' + label;
    if (typeof meta === 'string' && meta) return 'Last refresh: ' + meta;
    return 'Last refresh: —';
  }

  function deltaBadge(cur, prev, opts) {
    opts = opts || {};
    var c = num(cur), p = num(prev);
    if (c === null || p === null) return '';
    var diff = Math.round((c - p) * 100) / 100;
    var dir = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
    var good = diff === 0 ? 'flat' : ((opts.goodWhenDown ? diff < 0 : diff > 0) ? 'up' : 'down');
    var arrow = diff > 0 ? 'arrow_upward' : (diff < 0 ? 'arrow_downward' : 'remove');
    var mag = Math.abs(diff);
    var txt = diff === 0 ? 'no change' : (opts.suffix ? mag + opts.suffix : (diff > 0 ? '+' : '−') + mag);
    return '<span class="pmo-ov-delta ' + good + '"><span class="msi">' + arrow + '</span>' + txt + '</span>';
  }

  function el(id) { return document.getElementById(id); }
  function setText(id, txt) { var n = el(id); if (n) n.textContent = txt; }

  /* ---- KPI cards (data-driven) ---- */
  function renderKpis(snapshot, prevSnapshot) {
    var host = el('pmoOverviewKpis');
    if (!host) return;
    var m = snapshot.metrics || {};
    var pm = prevSnapshot && prevSnapshot.metrics || null;
    var people = metricTotalPeople(snapshot);
    var pPeople = prevSnapshot ? metricTotalPeople(prevSnapshot) : null;
    var clients = metricActiveClients(snapshot);
    var pClients = prevSnapshot ? metricActiveClients(prevSnapshot) : null;

    var cards = [
      { id: 'billableHeadcount', icon: ICON.billable, label: 'Billable headcount', val: intStr(m.headcount_billable), delta: deltaBadge(m.headcount_billable, pm && pm.headcount_billable) },
      { id: 'benchCount',        icon: ICON.bench,    label: 'On bench',           val: intStr(m.bench),              delta: deltaBadge(m.bench, pm && pm.bench, { goodWhenDown: true }) },
      { id: 'kpiActiveClients',  icon: ICON.clients,  label: 'Active clients',     val: intStr(clients),              delta: deltaBadge(clients, pClients) },
      { id: 'kpiUtilBilling',    icon: ICON.util,     label: 'Utilization (billing)', val: pct(m.utilization_billing), delta: deltaBadge(m.utilization_billing, pm && pm.utilization_billing, { suffix: 'pp' }) },
      { id: 'kpiPeople',         icon: ICON.people,   label: 'Active assignees',   val: intStr(people),               delta: deltaBadge(people, pPeople) }
    ];

    host.innerHTML = cards.map(function (c) {
      return '<article class="pmo-ov-kpi">' +
        '<div class="pmo-ov-kpi-top">' +
          '<span class="pmo-ov-kpi-icon"><span class="msi">' + c.icon + '</span></span>' +
          c.delta +
        '</div>' +
        '<div class="pmo-ov-kpi-val" id="' + c.id + '">' + c.val + '</div>' +
        '<div class="pmo-ov-kpi-lbl">' + c.label + '</div>' +
      '</article>';
    }).join('');
  }

  /* ---- Headcount bar chart (real series) ---- */
  function renderHeadcountSeries(snapshots) {
    var host = el('headcountSeries');
    if (!host) return;
    var source = typeof global.overviewHeadcountSeries === 'function' ? global.overviewHeadcountSeries() : null;
    var series = (source || snapshots || [])
      .map(function (s) {
        return {
          label: String(s.label || s.date || '').split(/\s+/)[0],
          value: num(s.value != null ? s.value : s.metrics && s.metrics.headcount_billable)
        };
      })
      .filter(function (d) { return d.value !== null; });

    if (!series.length) { host.innerHTML = ''; return; }
    var max = Math.max.apply(null, series.map(function (d) { return d.value; }));
    var min = Math.min.apply(null, series.map(function (d) { return d.value; }));
    var floor = Math.max(0, min - (max - min) * 0.6 - 1);   // visual baseline so bars differ

    host.innerHTML = series.map(function (d, i) {
      var isCurrent = i === series.length - 1;
      var h = max === floor ? 100 : Math.round(((d.value - floor) / (max - floor)) * 100);
      h = Math.max(8, Math.min(100, h));
      return '<div class="pmo-ov-bar-col">' +
        '<span class="pmo-ov-bar-val' + (isCurrent ? ' is-current' : '') + '">' + d.value + '</span>' +
        '<div class="pmo-ov-bar' + (isCurrent ? '' : ' is-muted') + '" style="height:' + h + '%"></div>' +
        '<span class="pmo-ov-bar-lbl">' + d.label + '</span>' +
      '</div>';
    }).join('');
  }

  /* ---- Public entry point ---- */
  function renderPmoOverview(opts) {
    opts = opts || {};
    var root = el('pmoOverview');
    if (!root) return;

    // Pull from globals when not passed explicitly.
    var snapshots = opts.snapshots || (global.PMO && global.PMO.snapshots) || [];
    var snapshot = opts.snapshot || global.latest || snapshots[snapshots.length - 1] || null;
    var prev = ('prev' in opts) ? opts.prev : (global.prev || (snapshots.length > 1 ? snapshots[snapshots.length - 2] : null));
    var user = opts.user || global.currentUser || null;
    var meta = opts.lastRefresh || (global.PMO ? { at: global.PMO.last_refresh_at, label: global.PMO.last_refresh } : null);

    // Greeting + refresh are safe to render even before snapshot data.
    setText('pmoGreeting', greeting(user));
    setText('lastRefresh', fmtRefresh(meta));

    if (!snapshot || !snapshot.metrics) {
      root.setAttribute('data-state', 'empty');
      return;
    }
    root.setAttribute('data-state', 'ready');

    var m = snapshot.metrics;
    var people = metricTotalPeople(snapshot);
    var clients = metricActiveClients(snapshot);
    // Hero stats
    setText('peopleCount', intStr(people));
    setText('activeClients', intStr(clients));
    setText('utilizationBilling', pct(m.utilization_billing));

    renderKpis(snapshot, prev);
    renderHeadcountSeries(snapshots);
  }

  global.renderPmoOverview = renderPmoOverview;
})(window);
