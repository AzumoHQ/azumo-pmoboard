# PMO Overview redesign — integration guide

Production integration of the Azumo **People Ops** overview design onto the existing `index.html`.
**No full-app replacement.** These are additive files + 4 small edits.

```
redesign/
  pmo-overview.css   clean CSS, Azumo design tokens (scoped to .pmo-ov)
  pmo-overview.html  semantic markup for the overview section (empty, data-driven)
  pmo-overview.js    vanilla JS renderer — fills the markup from REAL data
  pmo-sections.css   CSS-only reskin of Operating Views + Bench (no JS/markup changes)
  INTEGRATION.md     this file
```

The renderer reads the globals the app already defines (`PMO`, `latest`, `prev`, `currentUser`).
It **never hardcodes** names, metrics, dates or users — and ships **no sample data**.

### How to preview during integration
There is no standalone demo. Preview by running the real app (`npm run dev`) after applying
the 4 edits below: `/api/dashboard` + `/api/auth` feed the section live. To preview the section
in isolation, mount the markup in any page of the running app and call `renderPmoOverview()` —
it pulls from the live globals, never from fixtures.

---

## The 4 edits to `index.html`

### 1) `<head>` — load fonts + stylesheet
Insert right after the existing Typekit link (line ~7, `<link rel="stylesheet" href="https://use.typekit.net/yer2bzk.css">`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" rel="stylesheet">
<link rel="stylesheet" href="redesign/pmo-overview.css">
```
> Batica Sans (display face) is optional. To use it, add an `@font-face` for `BaticaSans-Regular.otf` named `'Batica Sans'`; the CSS already falls back to Lato.

### 2) `<body>` — mount the section
Paste the entire contents of `redesign/pmo-overview.html` as the **first child of `<main>`** (line ~699, immediately before `<section id="newSearchesTriage">`).

Optional: hide the legacy hero block (line ~683, `<div class="hero">`) so the new hero replaces it:
```html
<div class="hero" style="display:none">
```

### 3) Load the renderer script
Before `</body>` (or alongside the other scripts):
```html
<script src="redesign/pmo-overview.js"></script>
```

### 4) Call the renderer
In **`initDashboard()`** (line ~1311), after the `lastRefreshMeta` / `lastRefreshTag` / `footerLastUpdated` assignments (after line ~1326), add:
```js
  if (typeof renderPmoOverview === 'function') renderPmoOverview();
```
In **`updateAuthUi()`** (so the greeting updates on login/logout), add near the end:
```js
  if (typeof renderPmoOverview === 'function') renderPmoOverview();
```

That's it. The overview now renders from live `/api/dashboard` + `/api/auth` data.

---

## Data mapping — what Codex must connect

The renderer reads these automatically from existing globals. Targets shown for clarity.

| UI element            | DOM id (set by JS)   | Real source                                                        | Status |
|-----------------------|----------------------|--------------------------------------------------------------------|--------|
| Greeting              | `#pmoGreeting`       | `currentUser.name` → first name (time-of-day prefix; no name → "Good morning") | ✅ |
| Last refresh          | `#lastRefresh`       | `PMO.last_refresh_at` ?? `PMO.last_refresh`                        | ✅ |
| People (hero + KPI)   | `#peopleCount` / `#kpiPeople` | `overviewPeopleCount(latest)`; fallback to `headcount_total`, then billable + bench | ✅ |
| Active clients        | `#activeClients` / `#kpiActiveClients` | `latest.metrics.active_clients`                  | ✅ |
| Utilization (billing) | `#utilizationBilling` / `#kpiUtilBilling` | `latest.metrics.utilization_billing`          | ✅ |
| Billable headcount    | `#billableHeadcount` | `latest.metrics.headcount_billable`                                | ✅ |
| Bench                 | `#benchCount`        | `latest.metrics.bench`                                             | ✅ |
| Headcount series      | `#headcountSeries`   | `PMO.snapshots[].metrics.headcount_billable` (one bar per snapshot) | ✅ |
| Team composition      | —                    | Not shown. The overview intentionally avoids position/discipline breakdown. | ✅ |

All KPI deltas are computed live against `prev` (the previous snapshot). Bench delta is inverted (a drop is "good").

### ⚠️ Requires data mapping (do NOT fake)
These design blocks have no source field in the current API. They render a labelled "requires data mapping" state until wired:

1. **Attendance (early loggers / late starts / missing timesheet)** — not built here.
   Source would be `/api/harvest-hours` (already exists), keyed by day; needs a per-person log-time mapping.

2. **Top performers · utilization** — not built here.
   Needs per-person utilization, which `/api/dashboard` does not return today.

---

## id / class reference for Codex

**Data ids** (filled by `renderPmoOverview`): `pmoGreeting`, `lastRefresh`, `peopleCount`, `activeClients`,
`utilizationBilling`, `pmoOverviewKpis` (KPI container), `kpiPeople`, `billableHeadcount`, `benchCount`,
`kpiActiveClients`, `kpiUtilBilling`, `headcountSeries`.

**Section root:** `#pmoOverview.pmo-ov` (carries `data-state="loading|ready|empty"`).

**Style classes** (all namespaced `pmo-ov-*`, no collision with existing app CSS):
`pmo-ov-hero`, `pmo-ov-hero-stat`, `pmo-ov-kpis`, `pmo-ov-kpi`, `pmo-ov-delta` (`.up/.down/.flat`),
`pmo-ov-cols`, `pmo-ov-panel`, `pmo-ov-chart`, `pmo-ov-bar`.

**Public JS API:**
```js
renderPmoOverview();                         // reads PMO / latest / prev / currentUser
renderPmoOverview({ snapshot, prev, snapshots, user, lastRefresh });  // explicit
```

---

## Operating Views + Bench — CSS-only reskin (`pmo-sections.css`)

These two sections already render from real data via `renderOpsViews()` and `renderBench()`.
**Nothing in their logic, filters, role-scoping or markup changes.** The reskin works by
redefining the app's own CSS custom properties **scoped to `#opsViews` and `#bench`**, so every
existing rule inside repaints in the Azumo People Ops palette, plus a thin layer of structural
polish (white rounded cards, uppercase tracked headers, cerulean tabs/chips, soft shadows).

### Integration — 1 edit
Add the stylesheet in `<head>` (after `pmo-overview.css`). Requires the same Lato + Material
Symbols fonts already added in edit #1.
```html
<link rel="stylesheet" href="redesign/pmo-sections.css">
```
That's the whole integration. No JS, no DOM changes.

### Markup hooks it relies on (already present in index.html)
Section roots `#opsViews`, `#bench`; the app tokens `--card --surf --brd --txt --muted --blue
--blue-lt --blue-dk --rl --r`; classes `.sec-head/.sec-icon/.sec-tag`, `.ops-wrap`,
`.view-tab(.active)`, `.filter-field`, `.ops-summary-card`, `.ops-table-wrap`, `.tbl-wrap`,
`.tbl-head`, `.bench-table-wrap`, `table/th/td`, `.chip` (positions), `.badge-green/blue/yellow/red`,
`.avail-hi/md/lo`, `.exp-soon/mid/ok`, `.ops-expand`, `.inline-filter`, `.nested-table`.
If any class is renamed in the app, mirror it in `pmo-sections.css`.

### Extending to other sections
The reskin is scoped to a selector list at the top of the file. To bring another section into the
People Ops look, add its `#sectionId` to the `#opsViews, #bench { … }` token block (and the
matching polish selectors). Sections that use the same `.tbl-wrap`/`table`/`.badge` vocabulary
(e.g. `#pendingAssignments`, `#dueDates`, `#history`) will pick up most of the styling for free.

> Data stays real: this layer is purely visual. It cannot introduce fake values — it only restyles
> whatever `renderOpsViews()` / `renderBench()` already output from `/api/dashboard`.

---

## Notes
- Pure vanilla JS, no build step, no dependencies. Safe to load before or after the main script.
- Null-safe: any missing metric renders `—` rather than throwing or faking a value.
- The CSS is theme-independent (it brings its own light tokens), so it looks like the design regardless of the host dark/light toggle. If you want it to follow the app's theme toggle instead, map the `--ov-*` tokens to the app's `--card/--txt/--brd/...` variables.
