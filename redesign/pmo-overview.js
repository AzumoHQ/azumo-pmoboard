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
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function firstNum() {
    for (var i = 0; i < arguments.length; i += 1) {
      var v = arguments[i];
      if (v === '' || v === null || v === undefined) continue;
      var n = Number(v);
      if (isFinite(n)) return n;
    }
    return null;
  }
  function normKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }
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
    var explicit = (user && (user.first_name || user.firstName) || '').trim();
    if (explicit) return explicit.replace(/^\w/, function (c) { return c.toUpperCase(); });
    var raw = (user && (user.name || user.email) || '').trim();
    if (!raw) return '';
    if (raw.indexOf('@') > -1 && !user.name) raw = raw.split('@')[0].replace(/[._-]+/g, ' ');
    return raw.split(/\s+/)[0].replace(/^\w/, function (c) { return c.toUpperCase(); });
  }

  function greetingParts(user) {
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening');
    var fn = firstName(user);
    return { part: part, name: fn };
  }

  function setGreeting(id, user) {
    var n = el(id);
    if (!n) return;
    var g = greetingParts(user);
    n.innerHTML = g.name
      ? esc(g.part) + ', <span class="pmo-ov-greeting-name">' + esc(g.name) + '</span>'
      : esc(g.part);
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

  function personName(row) {
    return String(row && (row.assignee || row.epic_assignee || row.name || row.email || '') || '').trim();
  }

  function personId(row) {
    return normKey(row && (row.email || personName(row) || row.key || ''));
  }

  function rawAssignmentRows(snapshot) {
    if (Array.isArray(snapshot && snapshot.assignment_rows) && snapshot.assignment_rows.length) {
      return snapshot.assignment_rows.filter(Boolean);
    }
    var forecast = snapshot && snapshot.forecast || {};
    var rows = [];
    Object.keys(forecast).forEach(function (key) {
      if (Array.isArray(forecast[key])) rows = rows.concat(forecast[key]);
    });
    return rows.filter(Boolean);
  }

  function scopedAssignmentRows(snapshot) {
    var rows = rawAssignmentRows(snapshot);
    if (snapshot === global.latest && typeof global.scopedAssignmentRows === 'function') {
      try { return global.scopedAssignmentRows(rows); } catch (error) { return rows; }
    }
    return rows;
  }

  function isExternalClientRow(row) {
    var client = String(row && row.client || '').trim();
    if (!client || client === 'Azumo' || client === 'Bench') return false;
    var status = String(row.status || row.epic_status || row.project_status || row.aa_project_status || '').trim();
    return !status || status === 'In Progress' || status === 'Active';
  }

  function dueValue(row) {
    return String(row && (row.due || row.epic_due || row.end || row.end_date || '') || '').trim();
  }

  function dateLabel(value) {
    var raw = String(value || '').trim();
    if (!raw) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var d = new Date(raw + 'T00:00:00');
      if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return raw;
  }

  function clientDetailRows(snapshot) {
    var byClient = {};
    (Array.isArray(snapshot && snapshot.active_clients) ? snapshot.active_clients : []).forEach(function (client) {
      var key = normKey(client);
      if (!key) return;
      byClient[key] = byClient[key] || {
        client: String(client),
        people: {},
        positions: {},
        projectManagers: {},
        sows: 0,
        nextDue: ''
      };
    });

    scopedAssignmentRows(snapshot).filter(isExternalClientRow).forEach(function (row) {
      var client = String(row.client || '').trim();
      var key = normKey(client);
      if (!key) return;
      var entry = byClient[key] || {
        client: client,
        people: {},
        positions: {},
        projectManagers: {},
        sows: 0,
        nextDue: ''
      };
      var pId = personId(row);
      var name = personName(row);
      if (pId && name) entry.people[pId] = name;
      if (row.position) entry.positions[String(row.position)] = true;
      if (row.project_manager) entry.projectManagers[String(row.project_manager)] = true;
      entry.sows += 1;
      var due = dueValue(row);
      if (due && (!entry.nextDue || due < entry.nextDue)) entry.nextDue = due;
      byClient[key] = entry;
    });

    return Object.keys(byClient).map(function (key) {
      var row = byClient[key];
      var people = Object.keys(row.people).map(function (id) { return row.people[id]; }).sort();
      return {
        client: row.client,
        people: people,
        resources: people.length,
        sows: row.sows,
        projectManagers: Object.keys(row.projectManagers).sort(),
        positions: Object.keys(row.positions).sort(),
        nextDue: row.nextDue
      };
    }).sort(function (a, b) {
      return (b.resources - a.resources) || a.client.localeCompare(b.client);
    });
  }

  function benchDetailRows(snapshot) {
    if (snapshot === global.latest && typeof global.billingBenchRows === 'function') {
      try {
        var liveRows = global.billingBenchRows();
        if (Array.isArray(liveRows) && liveRows.length) {
          return liveRows.map(function (row) {
            return {
              name: row.assignee || row.name || 'Unnamed',
              position: row.position || '—',
              availability: firstNum(row.pct, row.avail, row.availability_pct),
              billing: firstNum(row.billing, row.billing_pct),
              due: dueValue(row)
            };
          });
        }
      } catch (error) {}
    }
    var byPerson = {};
    (Array.isArray(snapshot && snapshot.bench_list) ? snapshot.bench_list : []).forEach(function (row) {
      var status = String(row.status || '').trim();
      if (status && status !== 'In Progress') return;
      var name = personName(row);
      if (!name) return;
      var id = personId(row);
      var availability = firstNum(row.availability_pct, row.avail, row.bench_pct, row.pct, row.assignment_pct, row.assign);
      var current = byPerson[id];
      if (!current || (availability || 0) > (current.availability || 0)) {
        byPerson[id] = {
          name: name,
          position: row.epic_position || row.position || row.assignment_position || '—',
          availability: availability,
          billing: firstNum(row.billing_pct, row.billing, row.epic_billing),
          due: dueValue(row)
        };
      }
    });
    return Object.keys(byPerson).map(function (key) { return byPerson[key]; }).sort(function (a, b) {
      return ((b.availability || 0) - (a.availability || 0)) || a.name.localeCompare(b.name);
    });
  }

  function detailButton(kind, activeKind) {
    var open = kind === activeKind;
    return '<button type="button" class="pmo-ov-card-action' + (open ? ' is-open' : '') + '" ' +
      'aria-expanded="' + (open ? 'true' : 'false') + '" data-pmo-detail="' + kind + '" ' +
      'onclick="window.togglePmoOverviewDetail && window.togglePmoOverviewDetail(\'' + kind + '\')">' +
        '<span>' + (open ? 'Hide details' : 'Show details') + '</span>' +
        '<span class="msi" aria-hidden="true">' + (open ? 'expand_less' : 'expand_more') + '</span>' +
      '</button>';
  }

  function bindDetailActions() {
    var host = el('pmoOverviewDetails');
    if (!host || host.getAttribute('data-bound') === '1') return;
    host.setAttribute('data-bound', '1');
    host.addEventListener('click', function (event) {
      var clientBtn = event.target.closest && event.target.closest('[data-pmo-client]');
      if (clientBtn && typeof global.openMetricClient === 'function') {
        global.openMetricClient(clientBtn.getAttribute('data-pmo-client') || '');
        return;
      }
      var benchBtn = event.target.closest && event.target.closest('[data-pmo-open-bench]');
      if (benchBtn && typeof global.openMetricOperatingView === 'function') {
        global.openMetricOperatingView('bench');
      }
    });
  }

  function renderBenchDetail(snapshot) {
    var rows = benchDetailRows(snapshot);
    var visible = rows.slice(0, 12);
    return '<section class="pmo-ov-detail-panel" aria-label="Bench people details">' +
      '<div class="pmo-ov-detail-head">' +
        '<div><div class="pmo-ov-panel-eyebrow">Bench</div><div class="pmo-ov-detail-title">Active bench people</div></div>' +
        '<button type="button" class="pmo-ov-detail-link" data-pmo-open-bench>Open Bench view</button>' +
      '</div>' +
      (rows.length ? '<div class="pmo-ov-detail-list">' +
        visible.map(function (row) {
          return '<div class="pmo-ov-detail-row">' +
            '<div><strong>' + esc(row.name) + '</strong><span>' + esc(row.position || '—') + '</span></div>' +
            '<div><b>' + pct(row.availability) + '</b><span>Available</span></div>' +
            '<div><b>' + (row.billing === null ? '—' : pct(row.billing)) + '</b><span>Billing</span></div>' +
            '<div><b>' + esc(dateLabel(row.due)) + '</b><span>Due</span></div>' +
          '</div>';
        }).join('') +
        (rows.length > visible.length ? '<div class="pmo-ov-detail-more">+' + (rows.length - visible.length) + ' more in Bench view</div>' : '') +
      '</div>' : '<div class="pmo-ov-detail-empty">No active bench people in the current snapshot.</div>') +
    '</section>';
  }

  function renderClientsDetail(snapshot) {
    var rows = clientDetailRows(snapshot);
    var visible = rows.slice(0, 14);
    return '<section class="pmo-ov-detail-panel" aria-label="Active clients details">' +
      '<div class="pmo-ov-detail-head">' +
        '<div><div class="pmo-ov-panel-eyebrow">Clients</div><div class="pmo-ov-detail-title">Active client roster</div></div>' +
        '<button type="button" class="pmo-ov-detail-link" onclick="window.openMetricOperatingView && window.openMetricOperatingView(\'clients\')">Open Clients view</button>' +
      '</div>' +
      (rows.length ? '<div class="pmo-ov-detail-list">' +
        visible.map(function (row) {
          var pms = row.projectManagers.length ? row.projectManagers.join(', ') : '—';
          return '<div class="pmo-ov-detail-row is-client">' +
            '<div><button type="button" class="pmo-ov-client-link" data-pmo-client="' + esc(row.client) + '">' + esc(row.client) + '</button><span>PM: ' + esc(pms) + '</span></div>' +
            '<div><b>' + row.resources + '</b><span>Resources</span></div>' +
            '<div><b>' + row.sows + '</b><span>SOWs</span></div>' +
            '<div><b>' + esc(dateLabel(row.nextDue)) + '</b><span>Next due</span></div>' +
          '</div>';
        }).join('') +
        (rows.length > visible.length ? '<div class="pmo-ov-detail-more">+' + (rows.length - visible.length) + ' more clients</div>' : '') +
      '</div>' : '<div class="pmo-ov-detail-empty">No active external clients in the current snapshot.</div>') +
    '</section>';
  }

  function renderOverviewDetails(snapshot, activeKind) {
    var host = el('pmoOverviewDetails');
    if (!host) return;
    if (!activeKind) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = activeKind === 'bench' ? renderBenchDetail(snapshot) : renderClientsDetail(snapshot);
    bindDetailActions();
  }

  /* ---- KPI cards (data-driven) ---- */
  function renderKpis(snapshot, prevSnapshot) {
    var host = el('pmoOverviewKpis');
    if (!host) return;
    var root = el('pmoOverview');
    var activeDetail = root ? (root.getAttribute('data-detail') || '') : '';
    var m = snapshot.metrics || {};
    var pm = prevSnapshot && prevSnapshot.metrics || null;
    var clients = metricActiveClients(snapshot);
    var pClients = prevSnapshot ? metricActiveClients(prevSnapshot) : null;

    var cards = [
      { id: 'billableHeadcount', icon: ICON.billable, label: 'Billable headcount', val: intStr(m.headcount_billable), delta: deltaBadge(m.headcount_billable, pm && pm.headcount_billable) },
      { id: 'benchCount',        icon: ICON.bench,    label: 'On bench',           val: intStr(m.bench),              delta: deltaBadge(m.bench, pm && pm.bench, { goodWhenDown: true }), detail: 'bench' },
      { id: 'kpiActiveClients',  icon: ICON.clients,  label: 'Active clients',     val: intStr(clients),              delta: deltaBadge(clients, pClients), detail: 'clients' },
      { id: 'kpiUtilBilling',    icon: ICON.util,     label: 'Utilization (billing)', val: pct(m.utilization_billing), delta: deltaBadge(m.utilization_billing, pm && pm.utilization_billing, { suffix: 'pp' }) }
    ];

    host.innerHTML = cards.map(function (c) {
      return '<article class="pmo-ov-kpi">' +
        '<div class="pmo-ov-kpi-top">' +
          '<span class="pmo-ov-kpi-icon"><span class="msi">' + c.icon + '</span></span>' +
          c.delta +
        '</div>' +
        '<div class="pmo-ov-kpi-val" id="' + c.id + '">' + c.val + '</div>' +
        '<div class="pmo-ov-kpi-lbl">' + c.label + '</div>' +
        (c.detail ? detailButton(c.detail, activeDetail) : '') +
      '</article>';
    }).join('');
  }

  /* ---- Public entry point ---- */
  function renderPmoOverview(opts) {
    opts = opts || {};
    global.__pmoOverviewOptions = opts;
    var root = el('pmoOverview');
    if (!root) return;

    // Pull from globals when not passed explicitly.
    var snapshots = opts.snapshots || (global.PMO && global.PMO.snapshots) || [];
    var snapshot = opts.snapshot || global.latest || snapshots[snapshots.length - 1] || null;
    var prev = ('prev' in opts) ? opts.prev : (global.prev || (snapshots.length > 1 ? snapshots[snapshots.length - 2] : null));
    var user = opts.user || (typeof global.effectiveSessionUser === 'function' ? global.effectiveSessionUser() : global.currentUser) || null;
    var meta = opts.lastRefresh || (global.PMO ? { at: global.PMO.last_refresh_at, label: global.PMO.last_refresh } : null);

    // Greeting + refresh are safe to render even before snapshot data.
    setGreeting('pmoGreeting', user);
    setText('lastRefresh', fmtRefresh(meta));

    if (!snapshot || !snapshot.metrics) {
      root.setAttribute('data-state', 'empty');
      renderOverviewDetails(null, '');
      return;
    }
    root.setAttribute('data-state', 'ready');

    renderKpis(snapshot, prev);
    renderOverviewDetails(snapshot, root.getAttribute('data-detail') || '');
  }

  global.togglePmoOverviewDetail = function (kind) {
    var root = el('pmoOverview');
    if (!root) return;
    var current = root.getAttribute('data-detail') || '';
    root.setAttribute('data-detail', current === kind ? '' : kind);
    renderPmoOverview(global.__pmoOverviewOptions || {});
  };

  global.renderPmoOverview = renderPmoOverview;
})(window);
