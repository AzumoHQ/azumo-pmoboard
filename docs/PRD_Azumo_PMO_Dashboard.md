# PRD – Azumo PMO Executive Dashboard (Phase 1)

**Client:** Azumo (Internal)

**Date:** June 1, 2026

**Version:** 1.1 Draft

**Production URL:** https://pmoboard.vercel.app

**Repository:** https://github.com/federica-gonzalez-azumo/pmoboard

---

## 1. Executive Summary

The Azumo PMO Executive Dashboard is an internal web application that centralizes staffing, utilization, bench, client, position, and assignment due-date visibility for Azumo leadership and PMO operations. The dashboard consolidates operational data from Jira project `AA`, EazyBI reports, and persisted historical snapshots in Neon. It gives executives and delivery leadership a single source of truth for current utilization health, active client coverage, bench capacity, upcoming assignment due dates, and resource distribution by assignee, client, and position.

Phase 1 delivers the core executive dashboard, refreshed staffing snapshot data, EazyBI utilization metrics, filtered bench reporting, forecast filters, manual snapshot support, Vercel deployment, Neon persistence, and the first version of three operating views: **Assignees**, **Project Managers**, and **Clients**. Position remains available as a filter and QA dimension, but is not a standalone Operating Views tab. The product is designed to evolve into a scheduled snapshot system with role-specific access for Executive, PMO/Admin, CSM, and PM audiences, plus monthly reporting based on snapshot deltas.

---

## 2. Context & Business Model

**End users:** Azumo employees involved in staffing, executive management, client success, and project delivery. Primary personas:

- **Executives / leadership** — need aggregate staffing health, utilization, billing, bench, and client-risk visibility.
- **PMO / staffing operations** — owns data quality, snapshot refreshes, exception handling, and operational follow-up.
- **CSMs** — need visibility into their client portfolio, upcoming assignment due dates, renewal risk, and available bench talent.
- **Project Managers** — need visibility into assignments, team composition, upcoming due dates, and resources attached to their projects.
- **Sales / account coverage stakeholders** — use bench and availability data to match open capacity to demand.

**Operator:** Azumo. The application is internal tooling for operational decision-making. It is not a customer-facing product and is not sold externally.

**Commercial model:** Internal productivity and executive visibility tool. No subscription, billing, payment, or third-party monetization logic. Hosting and database costs are absorbed by Azumo internal infrastructure / operations budget.

**Business context:** Azumo operates a technology staffing / services model with approximately 100 active resources assigned across external clients, internal Azumo work, and bench. PMO needs accurate and timely visibility into:

- Utilization rate by assignment and billing.
- Billable vs non-billable headcount.
- Bench resources and future availability.
- Assignment due dates and renewal risk.
- Distribution of people by client and role.
- Operational changes over time through persisted snapshots.

**Regulatory context:** The application stores internal staffing metadata, employee names/emails, client names, assignment percentages, due dates, billing/availability percentages, and operational notes. It does not store payment data, PHI, or client end-user PII. Because data may include commercially sensitive staffing and client information, access should be restricted to authorized Azumo users and secrets must never be exposed client-side.

---

## 3. Goals & Non-Goals

### Goals (Phase 1)

| Feature / Capability | In Scope | Notes |
| :---- | :---: | :---- |
| Executive KPI dashboard | ✅ | Shows utilization, billing, billable/non-billable headcount, bench, active clients, pending assignments, and unassigned capacity. |
| EazyBI metric extraction | ✅ | Pulls utilization assignment, utilization billing, unassigned capacity, Headcount Billable, and Headcount Non-Billable from EazyBI when available. |
| Jira assignment ingestion | ✅ | Pulls AA Assignment issues in `In Progress`, `Assigned`, and `On Hold` statuses. |
| Non-billable Epic filtering | ✅ | Excludes Assignment rows whose parent Epic Billing Type is `Non-Billable`; remaining billable/non-billable FTE is computed from child Assignment percentages. |
| Bench report view | ✅ | Shows bench rows sourced from EazyBI/Jira, filtered to allowed Epic statuses such as Active and New Hires. |
| EazyBI report modules | ✅ | Shows **Bench by Month** and modeled **Utilization Billing Rate** modules from EazyBI/CSV snapshot data, including source table and procedure. |
| PMO QA traceability | ✅ | Admin/PMO users can open data quality checks, lineage/procedure notes, KPI source tables, and downloadable trace JSON for daily review. |
| Forecast — Assignment Due Dates | ✅ | Shows In Progress assignment due dates, grouped by month, with client, position, month, and assignee filters; chart/table values are clickable filters. |
| Operating Views — Assignees | ✅ | Groups by unique assignee; expandable rows show the SOWs/assignments for that person, including Bench as an assignment with its percentage. |
| Operating Views — Clients | ✅ | Groups external client rows only, excludes Bench and Azumo from the client list, shows Account Coverage, supports an Accounts Coverage subview, flags missing PM/CSM/TL assignments, and links users to Jira to complete coverage. |
| Operating Views — Project Managers | ✅ | Groups SOW/assignment rows by the Jira Project Manager field on the assignment/SOW, with expandable detail lists and links to each SOW. |
| Position filtering / QA dimension | ✅ | Position remains available as a filter and data-quality dimension, but it is not shown as a standalone Operating Views tab or summary count. |
| Historical snapshots | ✅ | Stores refreshed snapshots in `pmo-data.json` and Neon. Historical percentage metrics can be reset to 0 before a configured start date. |
| Manual snapshot trigger | ✅ | Allows authorized PMO/admin users to sign in and trigger a refresh without pasting a refresh token. |
| Scheduled snapshot foundation | ✅ | Supports cron endpoint and Vercel deployment path for recurring snapshot automation. |
| Light / dark UI | ✅ | User can switch visual theme. |
| English UI | ✅ | Dashboard copy is English for executive reporting consistency. |
| Vercel deployment | ✅ | Production deployment at `pmoboard.vercel.app`. |
| Neon persistence | ✅ | Dashboard snapshots persisted in Postgres/Neon. |
| Output artifact generation | ✅ | Refresh process updates HTML, JSON, and Python script artifacts for scheduled/manual workflows. |

### Non-Goals (Phase 1)

| Feature / Capability | Reason |
| :---- | :---- |
| External customer access | Dashboard is internal-only and contains staffing/client-sensitive data. |
| Full Jira issue editing | Jira remains source of truth. Phase 1 reads data only. |
| Writing back to EazyBI | EazyBI is source/reporting layer. Phase 1 reads exports only. |
| Full row-level RBAC for PM/CSM scopes | Phase 1 defines the role model and hides PMO-only modules/actions for non-PMO users. Fine-grained server-side row scoping for PM and CSM users is targeted for Phase 2. |
| Account Coverage editing panel | Full editing remains out of scope; Phase 1 includes read-only Account Coverage visibility and missing-assignment alerts. |
| Automated monthly narrative reports | Snapshot data enables this; full generated monthly reporting is a later milestone. |
| Predictive staffing recommendations | The dashboard surfaces availability and due dates; it does not automatically assign people to opportunities. |
| Time tracking / Harvest replacement | Utilization/billing metrics are read from EazyBI; this app does not replace timesheets or billing systems. |
| Financial forecasting beyond staffing utilization | No revenue recognition, invoicing, margin, or P&L modeling in Phase 1. |
| Mobile native app | Responsive web is sufficient. |
| Multi-tenant support | Single Azumo internal instance. |
| Public API | APIs are private to the dashboard and refresh automation. |

---

## 4. User Roles, Permissions & Views

### 4.1 Role definitions

The dashboard has two permission layers:

1. **Implemented Phase 1 controls** — login, PMO/admin-only write actions, PMO tab visibility, and non-PMO read-only preview behavior.
2. **Target Phase 2 row scoping** — Project Manager and CSM users should only receive rows in their Jira-defined scope from the API, not merely hidden in the UI.

| Role | Purpose | Current Phase 1 access | Target scoped access |
| :---- | :---- | :---- | :---- |
| **Admin** | Technical/user administration. | Full PMO access plus user management and configuration. | Full access. Can manage users, roles, and operational settings. |
| **PMO** | Staffing operations owner. | Full dashboard, PMO QA, Due Dates, Pending Assignments, snapshots/sync, QA notes, reports/procedures. | Full operational access. Owns data quality and monthly reporting. |
| **C-Level / Executive** | Leadership visibility. | Read-only access to executive/business views. PMO group and PMO actions are hidden. | Full business visibility across all clients, assignees, utilization, bench, forecast, history, and reports; no write/refresh actions. |
| **Project Manager** | Delivery ownership. | Must see only owned projects/SOWs. PMO group/actions hidden. No global billing/admin views. | Can see only assignees, SOWs, due dates, and clients where Jira `Project Manager` matches the signed-in user. |
| **CSM** | Client relationship ownership. | Not fully row-scoped in Phase 1 unless a dedicated scoped API is enabled. PMO group/actions hidden. | Can see only clients where PSA Account Coverage `CSM Assigned` matches the signed-in user, plus related assignments and due dates. |
| **Viewer** | Read-only fallback for authorized internal users. | Read-only non-PMO dashboard. PMO group/actions hidden. | Limited read-only access defined by business need. |

### 4.2 View visibility by role

| View / module | Admin | PMO | C-Level / Executive | Project Manager | CSM | Viewer | Notes |
| :---- | :---: | :---: | :---: | :---: | :---: | :---: | :---- |
| **General → Operating Views** | ✅ | ✅ | ✅ | ✅ Own projects only | ⚠️ Scoped target | ⚠️ Read-only | Current UI has Assignees, Project Managers, and Clients. PM access must be scoped to Jira Project Manager ownership. Position is a filter, not a tab. |
| **General → Bench** | ✅ | ✅ | ✅ | ❌ default | ✅ | ⚠️ optional | CSM can see Bench for client planning and staffing conversations. PM does not see global Bench by default. |
| **General → Internal Projects** | ✅ | ✅ | ✅ | ⚠️ scoped/approved | ❌ default | ❌ default | Azumo/internal work is visible to PMO/C-Level; broader access should be deliberate. |
| **Reports → Billing** | ✅ | ✅ | ✅ | ❌ default | ❌ default | ⚠️ approved only | Includes Utilization Billing Rate and Bench by Month. |
| **Reports → New Searches Reports** | ✅ | ✅ | ✅ | ⚠️ approved only | ⚠️ approved only | ❌ default | New Searches Triage is a report source view. |
| **Reports → History** | ✅ | ✅ | ✅ | ❌ default | ❌ default | ❌ default | Month-over-month/history trends are executive/PMO by default. |
| **Coverage** | ✅ | ✅ | ✅ | ⚠️ scoped target | ✅ own clients target | ⚠️ read-only | Account Coverage shows PM, CSM, TL, and Status from PSA. |
| **Harvest → Control** | ✅ | ✅ | ✅ | ✅ read-only | ✅ read-only | ❌ default | PM and CSM can review Harvest hours without modifying Harvest. |
| **Harvest → Assignments** | ✅ | ✅ | ✅ | ✅ read-only | ✅ read-only | ❌ default | PM and CSM can review Harvest assignment/access QA read-only. Used for Jira vs Harvest access comparison. |
| **Forecast** | ✅ | ✅ | ✅ | ✅ own PM assignments target | ✅ own CSM clients target | ⚠️ read-only | Shows upcoming assignment due dates. Bench due dates are ignored. |
| **PMO → QA** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Hidden from non-PMO users. |
| **PMO → Due Dates** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | PMO operational queue; non-PMO users may still see Forecast. |
| **PMO → Pending Assignments** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | PMO operational queue only. |

Legend: ✅ available; ❌ hidden/not available; ⚠️ requires scoped/approved implementation or policy decision.

### 4.3 Action permissions

| Capability | Admin | PMO | C-Level / Executive | Project Manager | CSM | Viewer |
| :---- | :---: | :---: | :---: | :---: | :---: | :---: |
| Sign in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Trigger manual snapshot / Sync all sources | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View PMO QA alerts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add/edit PMO QA notes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create PMO Jira tasks from alerts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View report/procedure links | ✅ | ✅ | ✅ | ⚠️ scoped/approved | ⚠️ scoped/approved | ⚠️ approved |
| Manage users/roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 4.4 Current production behavior

- PMO/admin users see the full dashboard including the **PMO** group: QA, Due Dates, and Pending Assignments.
- Non-PMO roles do **not** see the **PMO** group in the module navigation.
- Non-PMO roles do **not** see **Sync all sources** buttons and cannot trigger refreshes.
- C-Level / Executive users are treated as read-only business viewers: they can review business data but cannot perform PMO operational actions.
- `?previewRole=c-level`, `?previewRole=viewer`, `?previewRole=pm`, and `?previewRole=csm` are PMO/admin preview helpers only. They are not a replacement for server-side authorization.

### 4.5 Target server-side RBAC requirements

- System MUST enforce PMO/admin-only refresh and write actions server-side.
- System MUST NOT rely on client-side hiding for sensitive write permissions.
- System MUST add/enforce server-side scoped data responses for Project Manager users before sharing PM accounts broadly.
- PM scoped data MUST be based on Jira `Project Manager` on the Assignment/SOW. A PM must see only their own projects/SOWs.
- CSM scoped data MUST be based on PSA Account Coverage `CSM Assigned`.
- Admin/PMO users MAY preview other roles for QA, but preview mode MUST NOT grant access beyond the signed-in user’s real server-side permissions.

## 5. Key User Flows

### 5.1 Executive Reviews Staffing Health

1. Executive opens the PMO Dashboard.
2. The dashboard loads the latest snapshot from Neon via `/api/dashboard`.
3. The top KPI cards show utilization assignment, utilization billing, billable HC, non-billable HC, bench count, active clients, pending assignments, and unassigned capacity.
4. Executive checks the last updated timestamp to confirm data freshness.
5. Executive reviews trend/history cards if multiple snapshots exist.
6. Executive navigates to Forecast or Operating Views to understand risk drivers behind the aggregate numbers.

### 5.2 PMO Refreshes or Creates a Manual Snapshot

1. PMO/Admin opens the deployed dashboard.
2. PMO clicks **Snapshot now** or uses the refresh workflow.
3. System asks the PMO user to sign in when there is no active session.
4. API validates the PMO/admin user session server-side.
5. System fetches Jira AA assignments and EazyBI metrics.
6. System filters out Non-Billable Epic assignments and internal CSM/rate=0 rows.
7. System builds a new snapshot and persists it in Neon.
8. Dashboard reloads latest data and shows updated last refresh timestamp.

### 5.3 PMO Reviews Bench Availability

1. User navigates to Bench & Assignments.
2. Bench report shows resources sorted from highest available to lowest available.
3. Rows display name, position, availability, Epic status, potential next assignment, technology, and due date.
4. System excludes inactive project-status rows where applicable.
5. PMO uses this list to identify capacity that can be matched to upcoming client demand.

### 5.4 User Filters Forecast by Client, Position, Month, or Assignee

1. User navigates to Forecast — Assignment Due Dates.
2. User selects a client, position, due month, or assignee; user may also click a month bar, client, or person in the forecast table to filter directly.
3. Chart and table update to show only matching In Progress assignment due-date rows.
4. User reviews exact due date, client, assignee, position, and assignment key/SOW summary.
5. User uses the filtered rows to identify renewal, extension, or reassignment follow-up.

### 5.5 User Reviews Operating View by Assignee

1. User navigates to Operating Views → Assignees.
2. User searches by assignee, client, position, PM, CSM, assignment key, freelancer flag, or billing class.
3. User filters by client/assignment, position, Project Manager, freelancer yes/no, and Billable/Non-Billable. Status is not shown as a primary user-facing field.
4. Table displays one row per unique assignee.
5. Each assignee row summarizes positions, assignment/client chips, availability, and next due date.
6. User expands the row to see the assigned SOWs/assignment rows, including Bench with its bench percentage and Azumo as internal client work.

### 5.6 User Reviews Operating View by Client

1. User selects Operating Views → Clients.
2. System groups active external client rows only.
3. Bench and Azumo are excluded from client grouping because Bench is a capacity assignment and Azumo is internal work, not an external client.
4. Each client row shows assignee count, positions, Account Coverage, next due date, and assignees.
5. Account Coverage displays PM Assigned, CSM Assigned, and TL Assigned from PSA Epics.
6. User can switch the Clients subview to **Accounts Coverage** to show only client coverage owners and completion status.
7. If a client is missing PM, CSM, or TL, the dashboard shows an alert asking PMO to complete the assignment.

### 5.7 User Reviews Operating View by Position

1. User selects Operating Views → Positions.
2. System groups assignment rows by role/position.
3. Each position row shows total people, assigned, bench/available, utilization %, and people. Technology is intentionally omitted from Operating Views.
4. User identifies roles with available capacity or roles that are fully assigned.

### 5.8 Scheduled Snapshot Automation

1. Vercel cron or external scheduler calls the protected snapshot endpoint on the configured cadence.
2. System runs the same refresh pipeline as manual snapshot.
3. New snapshot is persisted in Neon.
4. Historical trends become available as multiple snapshots accumulate.
5. Future monthly reports can be generated from the snapshot history.

### 5.9 Error & Edge Cases

- **EazyBI returns missing or zero utilization metrics →** preserve previous valid utilization metrics unless explicit overrides are supplied.
- **Jira Assignment has parent Epic Billing Type = Non-Billable →** exclude row from all dashboard outputs.
- **Child Assignment is In Progress for Azumo or Bench →** keep row if it is not excluded by Billing Type, classify its `Assignment (%)` as `Non-Billable`, and allow the UI Billing filter to isolate it.
- **Child Assignment is In Progress for an external client →** classify its `Assignment (%)` as `Billable`.
- **Jira parent Epic Assignee Freelance = Yes →** keep row visible but allow freelancer filtering; Unique Assignees summary must make clear whether freelancers are included, excluded, or shown exclusively.
- **PSA Account Coverage missing PM/CSM/TL →** keep the client visible and show an alert listing missing fields.
- **Jira row has missing position →** enrich from EazyBI assignment report, bench report, or prior snapshot where possible.
- **Bench data includes inactive resources →** exclude inactive when Epic status indicates it is outside Active/New Hires scope.
- **Assignment due date is overdue but status remains In Progress →** keep visible as urgent until Jira is corrected.
- **More than 500 Jira issues →** paginate until all results are fetched.
- **Manual snapshot user session missing →** prompt the user to sign in; return unauthorized if the session is missing, expired, or does not have PMO/admin refresh permission.
- **Neon unavailable →** dashboard may fall back to embedded `pmo-data.json` data; save operation should log error without exposing secrets.
- **Frontend would render missing values →** display `—`, never `undefined`.

---

## 6. Functional Requirements

### 6.1 Data Ingestion — Jira

- System MUST query Jira Cloud project `AA` for Assignment issues using JQL:
  `project = AA AND issuetype = Assignment AND status in ("In Progress", "Assigned", "On Hold") ORDER BY updated DESC`.
- System MUST query Jira Cloud project `PSA` for Account Coverage using active/backlog Epics:
  `project = PSA AND issuetype = Epic AND status in ("In Progress", Backlog) ORDER BY updated DESC`.
- System MUST request fields: summary, status, assignee, due date, parent, start date, client, position, rate, Jira `Assignment (%)`, Jira `Project Manager`, and Epic/assignment billing type.
- System MUST request and persist parent Epic `Billing` numeric value when available for audit/backward compatibility, and parent Epic `Assignee Freelance` flag for filtering.
- System MUST paginate Jira results until all matching issues are fetched.
- System MUST include parent Epic data where needed to determine Epic Billing Type.
- System MUST persist Account Coverage fields from PSA Epics: `PM Assigned`, `CSM Assigned`, and `TL assigned`.
- System MUST exclude Assignment rows whose parent Epic Billing Type is `Non-Billable`.
- System MUST classify In Progress child Assignment rows as `Non-Billable` when the child client is `Azumo` or `Bench`; all other In Progress child Assignment rows with a client are `Billable`.
- System MUST calculate Headcount Billable and Headcount Non-Billable from EazyBI aggregate metrics only; Jira child Assignment rows must not be used to compute those two KPI cards.
- System MUST exclude rows where position is `CSM` and rate is `0`.
- System MUST classify rows into Active, Bench, Pending, and Azumo/internal statuses.
- System MUST not treat Bench as an external client.
- System MUST treat Azumo as internal work: include it in assignee and Project Manager assignment detail, but exclude it from the external Clients view.

### 6.2 Data Ingestion — EazyBI

- System MUST fetch global utilization metrics from EazyBI when credentials are configured.
- System MUST normalize EazyBI percentages whether returned as ratios (`0.93`) or percentages (`93`).
- System MUST use Jira `Assignment (%)` on each Assignment issue as the source of truth for assignment percentage. System MAY use EazyBI to enrich billing %, availability %, technology/frameworks, and potential next assignment.
- System MUST fetch bench availability from EazyBI where available.
- System MUST support persisted EazyBI report modules for Bench by Month and Utilization Billing Rate.
- System MUST model Utilization Billing Rate without exposing the EazyBI `Assignee / Assignees` row as the primary UI; the UI should show month, percentage, total headcount, estimated billed HC, procedure, and the source table below.
- System SHOULD support CSV imports for EazyBI Bench, Bench by Month, Utilization Billing Rate, and Next Due Dates reports as operational fallback.
- System SHOULD store data quality/lineage metadata for daily PMO audit checks without requiring a separate QA report upload.
- System MUST normalize Bench and Azumo rows as internal capacity: availability 100%, billing 0%, assignment 100%.
- System MUST use only the AA parent Epic `Position - Assignee` field for assignee/resource position. Child issue position may be retained as auxiliary/audit data, but MUST NOT feed visible position values or rollups. Missing Epic position should be reported through a single Position QA check.
- System MUST list external `In Progress` assignments with Billing 0 for daily QA, excluding Bench and Azumo.
- System MUST provide a PMO control on each external Billing 0 QA row to confirm whether the work is discounted from the client invoice and persist a discount deadline (`until` date). This control is operational metadata only and MUST NOT modify Jira, EazyBI, Harvest, or calculated billing metrics.
- System MUST treat Bench due dates as required Jira placeholders only. Bench due dates MUST NOT feed Forecast, Due Assignments, next due calculations, Slack due alerts, or Epic-vs-child due date consistency checks.
- System MUST alert when an AA parent Epic due date is earlier than the furthest due date among its In Progress child Assignment issues, excluding Bench child assignments.
- System SHOULD preserve prior non-zero utilization metrics if EazyBI returns empty/unusable values during a refresh.

### 6.3 Snapshot Generation

- System MUST build a snapshot with: date, label, metrics, expiring due dates, active clients, forecast, forecast total, forecast source, bench source, assignment rows, bench list, and pending list.
- System MUST persist snapshots to Neon when `DATABASE_URL` is available.
- System MUST embed latest data into static HTML artifacts for local/offline access.
- System MUST support resetting historical percentage metrics to 0 before a configured `history_start_date`.
- System MUST replace an existing snapshot for the same date rather than duplicating daily entries.
- System SHOULD support two snapshots per day in the target state by adding timestamp and snapshot type (`morning` / `evening`) if intraday deltas are required.

### 6.4 Executive Metrics

- System MUST show the following KPI cards:
  - Utilization Rate (Assignment)
  - Utilization Rate (Billing)
  - Headcount Billable
  - Headcount Non-Billable
  - Bench
  - Active Clients
  - Pending Assignments
  - Unassigned Capacity
- System MUST label metric sources as Jira or EazyBI where appropriate.
- System MUST show previous-snapshot deltas when at least two snapshots exist.
- System MUST show last updated timestamp in the footer and dashboard header.

### 6.4.1 PMO QA Notes

- System MUST allow PMO users to add/update a free-text note on each active **Needs review** alert/check.
- System MUST persist those notes as PMO operational metadata so another authorized user can understand why the alert remains open.
- System MUST display the latest note, author, and timestamp directly on the related alert card.
- System MUST sanitize/escape note content in the UI and MUST NOT write these notes back to Jira, EazyBI, or Harvest.

### 6.5 Bench & Assignments

- System MUST show a Bench Report table.
- System MUST sort bench rows by availability descending.
- System MUST show position before/near availability to support capacity review.
- System MUST show availability, Epic status, potential next assignment, technology/frameworks, and due date.
- System MUST exclude inactive bench rows when Epic status is outside Active/New Hires scope.
- System MUST show Pending assignments separately.
- System MUST show due assignments for overdue + next 60 days.
- System MUST visually mark due assignments as red only when due today or overdue; future due assignments inside the window MUST use a warning/orange treatment.
- System MUST provide a Slack update action for Due Assignments that opens `#assignments-hub` and provides a message/detail payload with overdue/due rows and the Project Manager tagged in text.

### 6.6 Forecast — Assignment Due Dates

- System MUST use In Progress assignment due dates as the source for forecast rows.
- System MUST group forecast rows by month.
- System MUST show exact due date in the table.
- System MUST provide filters for client, position, month, and assignee.
- System MUST show client, assignee, position, assignment key, and SOW/summary where available.
- System MUST keep overdue In Progress assignments visible until Jira data changes.
- System MUST allow direct filtering by clicking month bars, client names, and assignee/person names. System SHOULD support additional filters for PM and CSM in a later iteration.

### 6.7 Operating Views — Assignees

- System MUST show one row per unique assignee, with expandable assignment/SOW details.
- System MUST support search across assignee, client, position, PM, CSM, assignment key, summary, freelancer flag, and billing class.
- System MUST support filters by client/assignment, position, Project Manager, freelancer yes/no, and Billing class. Status should not be a primary visible column/filter in this view.
- System MUST show: Assignee, Position(s), Assignment chips, Availability %, Next Due Date, and expandable SOW/assignment details. Billing % should not be displayed in the Assignees table.
- System MUST model Bench as an assignment/capacity row with its percentage, not only as a status label. Assignment chips and expanded SOW rows MUST use the Jira `Assignment (%)` value for each issue.
- System MUST display missing values as `—` and never as `undefined`.
- System MUST count a person once per position/group in summaries; if the same assignee has multiple SOWs with the same position, the person counts once and the SOWs appear in the expanded detail.
- System MUST show Unique Assignees as `including freelancers` by default, `excluding freelancers` when Freelancer = No, and `freelancers only` when Freelancer = Yes.

### 6.8 Operating Views — Clients

- System MUST group active external client rows only.
- System MUST exclude both Bench and Azumo from the client list.
- System MUST show: Client, Resources, Delivery PM, Account PM, Next Due, and Assignees.
- **Delivery PM** MUST come from Jira AA Assignment/SOW `Project Manager`.
- **Account PM** MUST come from Jira PSA Account Coverage `PM Assigned`.
- System MUST provide a Clients subview called **Accounts Coverage** showing Client, PM Assigned, CSM Assigned, TL Assigned, and completion alert/status.
- System MUST alert when any active external client is missing PM Assigned, CSM Assigned, or TL Assigned.
- System MUST run a PMO QA check comparing Jira PSA client Epics against the external active clients feeding Operating Views from AA. Any client present on only one side must be shown as a PSA / Operating Views mismatch with clear ✓ / × source presence indicators.
- System MUST provide a Jira link for each incomplete Account Coverage row and for the missing-coverage alert so PMO can complete PM/CSM/TL ownership in Jira.
- System MUST support sorting clients by assignee count ascending/descending, next due date, and client name.
- System MUST keep Azumo visible as internal assignment work in Assignees and Project Managers, not as an external client row.
- System SHOULD support expandable client detail rows in a later iteration.
- System SHOULD support editing Account Coverage fields in a later iteration; Phase 1 is read-only.


### 6.9 Operating Views — Project Managers

- System MUST group assignment/SOW rows by the Jira `Project Manager` field on each Assignment issue/SOW.
- System MUST show: Project Manager, # Assignees, # SOWs, Clients, Positions, Next Due Date, and an expandable SOW/Assignee detail list.
- System MUST list all SOWs and assignees in the expanded detail view; it MUST NOT show collapsed “+N others” text unless those hidden records are directly expandable in the same interaction.
- System MUST include Azumo rows as internal client work.
- System SHOULD exclude Bench from Project Manager grouping unless a Bench row has an explicit Jira Project Manager owner.
- System MUST provide a clickable Jira link for each SOW/Assignment key.

### 6.10 Position Filter / QA Dimension

- System MUST keep Position available as a filter in Operating Views.
- System MUST NOT show Position as a standalone Operating Views tab or summary count in the current UI.
- System MUST use the AA Epic field `Position - Assignee` as the visible Position source.
- System SHOULD continue running Position QA to identify missing or inconsistent Epic Position values.

### 6.10 History & Trends

- System MUST show historical trend cards when at least two snapshots exist.
- System MUST show a clear empty state when only one snapshot exists.
- System MUST preserve reset history behavior so prior percentage metrics can be zeroed when a new tracking period starts.
- System SHOULD support monthly aggregates and MoM deltas in a future milestone.

### 6.11 Manual & Automated Refresh

- System MUST provide a protected refresh endpoint for manual snapshots.
- System MUST protect mutating refresh endpoints with server-side PMO/admin user sessions. `PMO_REFRESH_TOKEN` may remain as a technical fallback for scripts and cron only.
- System MUST support scheduled refresh via Vercel cron or external automation.
- System SHOULD run scheduled snapshots twice per day in target state.
- System SHOULD log refresh success/failure with timestamp and source counts.
- System MUST allow signed-in users to change their own password.

### 6.12 UI / Theme

- System MUST render in English.
- System MUST support dark and light visual themes.
- System MUST remove personal names from dashboard branding.
- System MUST use Azumo branding and logo treatment without exposing unnecessary external dependencies.
- System MUST render every new report or embedded source with the same Azumo PMO dashboard UX/UI system: standard section header, card/table wrapper, source badge, compact summary cards when useful, consistent spacing, and collapsible source/procedure details. Raw iframes or standalone report styling MUST NOT be placed directly on the page.
- System MUST be responsive for laptop, desktop, and tablet use.
- System SHOULD remain usable on mobile for quick metric checks.

---

## 7. Technical Architecture

### 7.1 Current / Proposed Stack

| Layer | Technology | Rationale |
| :---- | :---- | :---- |
| **Frontend** | Static HTML, CSS, vanilla JavaScript | Fast, simple executive dashboard; no build complexity required for Phase 1. |
| **Backend API** | Vercel Serverless Functions, Node.js | Lightweight private APIs for dashboard data, snapshots, health, notes/legacy endpoints, and refresh. |
| **Refresh script** | Python 3 (`pmo-refresh.py`) | Operational script for local/manual/scheduled data refresh and artifact generation. |
| **Data transform layer** | Node.js (`lib/pmo-transform.js`) + Python mirror | Shared rules for Jira parsing, filtering, classification, forecast, and snapshot shaping. |
| **Database** | Neon Postgres | Persist snapshots and metadata for production dashboard history. |
| **Data sources** | Jira Cloud + EazyBI Cloud Export + optional CSV exports | Jira is assignment source; EazyBI is utilization/availability/reporting source. |
| **Hosting** | Vercel | Simple deployment, serverless APIs, cron support, environment variable management. |
| **Secrets** | Vercel environment variables + local `.env.local` | Keeps Jira/EazyBI/Neon credentials out of client bundle and source control. |
| **Version control** | GitHub | Repository: `federica-gonzalez-azumo/pmoboard`. |

### 7.2 Data Model (Logical)

- **pmo_meta**: `key`, `value`. Stores project, cloud ID, last refresh, last refresh timestamp, history start date.
- **pmo_snapshots**: `snapshot_date`, `label`, `metrics`, `expiring_60d`, `active_clients`, `forecast`, `forecast_total`, `forecast_source`, `bench_source`, `account_coverage`, `account_coverage_source`, `assignment_rows`, `bench_list`, `pending_list`, `created_at`, `updated_at`.
- **assignment_rows** (JSON payload inside snapshot): `key`, `assignee`, `email`, `status`, `client`, `position`, `start`, `due`, `rate`, `pct`, `assignment_pct`, `billing_pct`, `availability_pct`, `bench_pct`, `project_status`, `epic_status`, `technology`, `frameworks`, `potential_next_assignment`, `project_manager`, `csm`, `summary`, `epic_key`, `epic_assignee`, `freelance`, `epic_billing`, `billing_class`, `billing_type`, `source`.
- **pmo_users**: `id`, `email`, `name`, `role`, `password_hash`, `active`, `created_at`, `updated_at`, `last_login_at`.
- **pmo_sessions**: `id`, `user_id`, `token_hash`, `expires_at`, `created_at`.
- **account_coverage**: `key`, `client`, `client_key`, `status`, `pm_assigned`, `csm_assigned`, `tl_assigned`, `missing`, `complete`, `source`.
- **future account_coverage_edits**: `client_name`, `pm_assigned`, `csm_assigned`, `tl_assigned`, `updated_by`, `updated_at`.
- **future refresh_runs**: `id`, `started_at`, `finished_at`, `status`, `triggered_by`, `jira_count`, `eazybi_status`, `error_message`.

### 7.3 Refresh / Data Flow

1. Refresh trigger starts from Python script, Vercel API, scheduled task, or cron.
2. System reads Jira credentials and EazyBI credentials from server-side environment.
3. Jira assignment issues are fetched and parent Epic fields are enriched.
4. EazyBI metrics and report details are fetched where configured.
5. Transform layer applies business rules:
   - Exclude Non-Billable Epic rows.
   - Exclude CSM/rate=0 rows.
   - Classify assignment rows as Billable/Non-Billable for filtering from child Assignment issue client/status, while Headcount Billable and Headcount Non-Billable KPI values come only from EazyBI aggregate metrics.
   - Persist Assignee Freelance yes/no from parent Epic for UI filtering and assignee-count labeling.
   - Fetch PSA Epic Account Coverage and mark clients missing PM/CSM/TL.
   - Compare PSA clients with the external active clients that feed Operating Views and raise a QA alert for mismatches.
   - Classify active, bench, pending, Azumo/internal.
   - Build bench, forecast, expiring, active clients, and operating rows.
6. Snapshot is generated.
7. Snapshot is saved to Neon and embedded into `pmo-data.json` / dashboard HTML artifacts.
8. Dashboard frontend fetches `/api/dashboard` and renders latest data.

### 7.4 Hosting & Environment

- **Production:** `https://pmoboard.vercel.app`.
- **Environment variables:** `DATABASE_URL`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_CLOUD_ID`, `EAZYBI_URL`, `EAZYBI_EMAIL`, `EAZYBI_TOKEN`, `EAZYBI_ACCOUNT_ID`, `EAZYBI_REPORT_ID`, `PMO_REFRESH_TOKEN`, `PMO_SESSION_DAYS`.
- **Cron:** Vercel cron endpoint may be configured for scheduled snapshots.
- **Backups:** Neon provider default backups; periodic export recommended before major schema changes.
- **Expected scale:** ~100–150 assignment rows per snapshot, ~2 snapshots/day, multiple years of history. JSONB payloads are acceptable at this scale.

---

## 8. Security & Privacy

| Concern | Approach |
| :---- | :---- |
| **Authentication** | Phase 1 supports PMO dashboard users with email/password, password hashing, and httpOnly session cookies. Target state can still migrate to Google SSO for `@azumo.co`. |
| **Authorization** | Refresh/mutating actions require server-side role checks; PMO/admin roles can refresh, viewer roles cannot. Client-side hiding alone is insufficient. |
| **Refresh token** | `PMO_REFRESH_TOKEN` must be stored only in Vercel env/local secure files; never printed in logs or embedded in HTML. It is retained only as a technical fallback for cron/scripts. |
| **Jira/EazyBI secrets** | Stored as server-side env vars only. Never exposed in client JS or dashboard data. |
| **Data in transit** | HTTPS only through Vercel. |
| **Data at rest** | Neon managed Postgres encryption at rest by provider default. |
| **Sensitive staffing data** | Access limited to authorized internal users; avoid publishing dashboard links outside Azumo. |
| **Client confidentiality** | Client names, staffing assignments, and due dates are commercially sensitive. Treat as internal confidential. |
| **Non-billable/internal data** | Explicit filters remove Epic Billing Type `Non-Billable` rows from dashboard outputs; remaining In Progress child Assignment rows are classed as Non-Billable only when their client is Azumo or Bench, and external-client rows are classed as Billable. |
| **XSS** | Dashboard should escape all rendered text values. Free-text notes/coverage fields, if added, must be sanitized. |
| **CSRF / mutation safety** | Mutating endpoints must require token/auth and reject unauthenticated calls. |
| **Logging** | Logs should include counts/status, not secrets or raw credentials. |

---

## 9. Compliance & Regulatory Requirements

- **Internal tool scope:** No external regulatory compliance regime applies in Phase 1.
- **Employee data:** Employee names/emails and assignment metadata are internal workforce data. Access should follow least-privilege principles.
- **Client confidentiality:** Client names, SOW due dates, and staffing details must be considered confidential business information.
- **Data retention:** Snapshot history is retained for operational trend analysis unless PMO defines a retention window.
- **Offboarding:** Target SSO implementation should automatically block access when an employee loses their Azumo Google account.
- **Auditability:** Snapshot history provides operational auditability of staffing state over time. Future refresh_runs/audit logs should track who triggered manual refreshes.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
| :---- | :---: | :---: | :---- |
| EazyBI report shape changes and metrics parse as 0 | Medium | High | Preserve previous valid metrics; add report-shape tests and monitoring. |
| Jira custom fields change IDs or semantics | Medium | High | Centralize field constants; document Jira field mapping; add validation counts. |
| Non-Billable rows leak into executive metrics | Low | High | Filter by parent Epic Billing Type, compute billable/non-billable FTE from child Assignment rows, and add automated checks for Non-Billable rows in output. |
| Bench report includes inactive resources | Medium | Medium | Enforce Active/New Hires filtering from AA Epic status. |
| Dashboard becomes trusted despite stale data | Medium | High | Prominent last updated timestamp; refresh health/status indicator. |
| Manual token is shared too broadly | Low | Medium | Human refresh now uses PMO/admin users and sessions; keep token only for cron/scripts and rotate it if leaked. |
| Single-day snapshot replacement hides intraday movement | Medium | Medium | Add timestamped snapshot IDs and morning/evening snapshot_type in future state. |
| Role-specific access is not implemented before wider sharing | Medium | High | Limit URL sharing until SSO/RBAC is implemented. |
| Vercel/Neon outage prevents latest refresh | Low | Medium | Keep embedded static fallback; alert on refresh failure. |
| Position labels differ between Jira and EazyBI | Medium | Low | Prefer AA Epic `Position - Assignee`; show a Position QA alert instead of inferring from child issues or EazyBI. |

---

## 11. Key Assumptions

1. Jira project `AA` Assignment issues are the source of truth for active assignment status and due dates.
2. Parent Epic Billing Type determines only whether an assignee/assignment should be excluded entirely; billable/non-billable headcount KPI values are sourced from EazyBI aggregate metrics.
3. EazyBI is the source of truth for executive utilization and billing metrics.
4. Bench resources should include only active/new-hire resources and exclude inactive Epic status rows.
5. Forecast should count In Progress assignment due dates, not pending/on-hold rows, and must exclude Bench rows because Bench due dates are placeholders.
6. Bench and Azumo are not external clients.
7. Dashboard language is English.
8. Production deployment is Vercel and persistence is Neon.
9. Expected scale remains small enough for JSONB snapshot payloads and client-side filtering.
10. PMO owns validation of odd data conditions where Jira/EazyBI disagree.
11. The dashboard should be optimized for executive/operational clarity over exhaustive data modeling in Phase 1.

---

## 12. Open Questions

1. **Authentication timing:** Should Google SSO/RBAC be required before broader internal rollout, or is token-protected refresh + private URL acceptable for Phase 1?
2. **Snapshot cadence:** Confirm whether snapshots should run 2x/day, and at which timezone/times.
3. **Intraday history:** Should multiple snapshots per date be stored separately, or is one latest snapshot per day sufficient?
4. **CSM/PM scoping:** What exact Jira/EazyBI fields should define a CSM's clients and a PM's projects?
5. **Account Coverage editing:** Should PM/CSM/TL coverage be editable in Phase 2, or should Jira remain the only write path?
6. **Monthly reports:** Should monthly reports be generated automatically as Markdown/PDF, or only displayed in-app?
7. **Forecast window:** Should Forecast show all future due dates or only 30/60/90/180-day windows by default?
8. **Risk thresholds:** What thresholds define due-soon, concentration risk, high bench risk, and underutilization?
9. **Data retention:** How long should snapshots be retained in Neon?
10. **Client naming:** Should client names be normalized from Jira/EazyBI to avoid duplicate variants?
11. **Azumo/internal work:** Should Azumo assignments remain visible in Assignees/Project Managers for all Executive users, or be hidden behind a dedicated internal-work toggle?
12. **Slack mentions:** Should PM names be mapped to Slack user IDs so the Due Assignments update creates real Slack mentions instead of text `@Name` mentions?

---

## 13. Out of Scope (Phase 1)

| Feature | Reason |
| :---- | :---- |
| External customer portal | Data is internal and sensitive. |
| Jira write-back/editing | Jira remains source of truth. |
| EazyBI report authoring | Dashboard consumes reports; does not manage EazyBI. |
| Full SOW financial modeling | Dashboard focuses on staffing/utilization, not revenue recognition. |
| Automated staffing recommendations | Requires demand/opportunity pipeline integration. |
| Harvest/timesheet replacement | EazyBI already aggregates utilization/billing. |
| Multi-tenant support | Single Azumo instance. |
| Native mobile application | Responsive web only. |
| Full audit log UI | Logs and snapshot data are enough for Phase 1. |
| Complex custom report builder | Fixed executive/operational views are sufficient. |
| AI-generated monthly commentary | Future enhancement after stable snapshot history. |
| Fine-grained row-level security | Targeted for later if CSM/PM scoped access becomes required. |

---

## 14. Screens & UI Scope

### Core Screens

| # | Screen | Notes |
| :---: | :---- | :---- |
| 1 | Dashboard / Metrics | KPI cards, source labels, deltas when history exists, last refresh metadata. |
| 2 | Operating Views | Tabs for Assignees, Project Managers, and Clients; shared search/filter controls; Position remains a filter, not a tab/count. |
| 3 | Bench & Assignments | Bench report, pending assignments, due assignments in next 60 days / overdue. |
| 4 | Historical Trends | Metric trend cards once 2+ snapshots exist; empty state for single snapshot. |
| 5 | Forecast — Assignment Due Dates | Clickable month chart, client/position/month/assignee filters, due-date table with clickable client/person values. |
| 6 | Refresh Info / Manual Snapshot | Explains refresh flow and supports user-authenticated snapshot trigger. |
| 7 | Light/Dark Toggle | Persistent user preference via local storage. |

### Future Admin / Security Screens

| # | Screen | Notes |
| :---: | :---- | :---- |
| 8 | Login | Google SSO, `@azumo.co` restriction. |
| 9 | User Management | Admin-only role assignment and last login visibility. |
| 10 | Account Coverage Editor | Client-level PM/CSM/TL assignments saved to Neon. |
| 11 | Refresh Runs | Admin-only list of manual/cron refresh attempts, source counts, errors. |
| 12 | Monthly Reports | Month selector, MoM comparison, export/share options. |

---

## 15. Brand & Visual Design (Azumo PMO Internal Tool)

The PMO Dashboard must feel like a first-party Azumo internal executive tool: clear, modern, data-dense, and calm. It should prioritize fast comprehension over decorative UI.

Any new module, report, or external embed (including EazyBI reports such as New Searches Triage) must visually inherit the existing PMO Dashboard pattern. The default implementation should reuse the same card shells, badges, KPI/source cards, table spacing, and source-detail toggles used by Billing, Bench, Harvest, and PMO QA. Exceptions require an explicit product/design reason in the PRD.

When an EazyBI report has an export endpoint available, the dashboard should render a native PMO table from the exported JSON and keep the iframe only as a collapsed source-detail / QA reference. New Searches Triage follows this rule: data comes from EazyBI export account `232624`, report `5434977`, not from an iframe-only visual embed.

### 15.1 Visual Identity

**Logo and header.** The dashboard header should use PMO/Azumo branding without personal names. The Azumo logo may appear in navigation or footer with low visual weight.

**Color system.** The existing navy/blue dashboard palette is appropriate for executive data. It should support both:

- Dark mode for control-room / executive dashboard viewing.
- Light mode for daytime review, screenshots, and sharing in documents.

Functional colors:

- Blue for primary actions and neutral KPIs.
- Green for healthy/positive values.
- Yellow/orange for warning/soon-due values.
- Red for urgent, high availability/bench risk, or concentration risk.
- Muted gray/blue for secondary metadata.

**Typography.** Use a clean system sans-serif optimized for tables and KPI cards. Numeric values should be large and scan-friendly; table text should remain compact enough for operational density.

**Iconography.** Use simple emoji/icon labels only where they improve scanning: Dashboard, Views, Bench, History, Forecast, Snapshot. Avoid decorative icon clutter in dense tables.

### 15.2 Layout & Composition

- Max content width approximately 1300px.
- Sticky top navigation with quick access to Dashboard, Views, Bench, History, Forecast.
- KPI cards above operational detail.
- Tables with horizontal overflow to preserve data fidelity on smaller screens.
- Summary cards at the top of each operational view.
- Filters should sit directly above the data they affect.
- Last updated timestamp should be visible in both header/footer context.

### 15.3 Tone & Copy

Copy should be direct, operational, and in English. Examples:

- “Forecast — Assignment Due Dates”
- “Operating Views”
- “Bench Report”
- “Last updated”
- “No assignments match the selected filters”
- “Snapshot saved”

Avoid informal, personal, or ambiguous labels in the production dashboard.

### 15.4 Accessibility

- Tables must preserve semantic `<table>`, `<thead>`, and `<tbody>` structure.
- Filter controls must have labels.
- Color should not be the only signal for risk; text badges should also be used.
- Theme contrast should meet WCAG 2.1 AA for standard text where possible.
- Keyboard navigation should support filters and navigation links.

### 15.5 Implementation Notes

- Keep data rendering escaped by default.
- Centralize formatting helpers for percentages, dates, missing values, and status labels.
- Keep business rules in transform layers, not scattered across UI rendering.
- Ensure generated static dashboard and production `index.html` stay synchronized.
- Add lightweight validation scripts to verify no `undefined` text appears in dashboard data.
- If the app moves to React/Next.js later, preserve current data contract so refresh automation does not need to be rewritten.
