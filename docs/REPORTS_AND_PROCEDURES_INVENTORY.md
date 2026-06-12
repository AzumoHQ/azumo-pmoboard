# PMO Dashboard — Reports & Procedures Inventory

**Purpose:** master list of source reports used by the PMO Dashboard. Use this file to map every dashboard module to its source of truth, required report IDs/tokens, fields, and QA procedure.

**Security note:** do not commit raw API tokens or embed tokens. Store credentials in Vercel env vars / Neon secrets. In this document, keep only account IDs, report IDs, source names, and procedure notes.

---

## Connection fields to capture for every EazyBI report

| Field | Example | Notes |
|---|---:|---|
| Source name | Utilization Billing Rate by Month | Human-readable report name. |
| Account ID | 207607 | From `/accounts/{accountId}/...` in EazyBI URL/iframe. |
| Report ID | 5348141 | From `/report/{reportId}` or `/reports/{reportId}`. |
| Embed token | Stored in Vercel only | Do not paste into docs after initial setup. |
| Export method | API auth or embed export | Prefer API auth when available. |
| Dashboard module | Reports / QA / General / Harvest | Where the source is shown. |
| Procedure | Short QA formula / rule | What PMO checks daily/weekly. |

---

## Master report list

| # | Dashboard area | Source / report | System | Current status | Required fields | Procedure / QA use |
|---:|---|---|---|---|---|---|
| 1 | Reports | Utilization Billing Rate | EazyBI | Connected: account `232624`, report `5244970` | Month, Utilization Billing Rate, Total Headcount, Utilization | EazyBI is source of truth. Dashboard must show monthly billing % exactly as exported; do not calculate from Jira or Harvest rates. |
| 2 | Reports | Bench by Month | EazyBI | Needs report ID/token confirmation | Assignee, Availability by month, Utilization by month | Sort/view availability by assignee. Exclude aggregate “Assignees” row from people list. |
| 3 | Reports / General | Assignments & Billing Overview | EazyBI | Known report ID: `5348141` / account likely `207607` | Assignee, Client, Assignment %, Billing %, Availability %, Start, Due, Position, Technology, Frameworks, Potential Next | Source for row-level QA against Jira. Position visible in dashboard must still come from AA Epic “Position - Assignee”. |
| 4 | General | Operating Views | Jira AA + EazyBI enrichment | Connected | AA Epic assignee, Epic Position - Assignee, child Assignment %, Client, PM, Due Date | Group assignees by person. Count one position per person. Bench/Azumo are non-billable internal capacity. |
| 5 | General | Internal Projects / Azumo | EazyBI | Known report ID: `5259086` / account `216082` | Assignee, SOW, Assignment %, Start, Due, Position, Technology, Frameworks, Next | Show Azumo/internal SOWs expandable. Use Assignment (%) only; do not display rate. |
| 6 | PMO | Due Dates / Next Due Dates | Jira AA In Progress or EazyBI report | Needs final source decision | Assignee, Client, Position, Assignment key, Due Date, PM | Ignore Bench due dates. Person is considered overdue starting the day after last project day. Show upcoming due dates but alert only overdue. |
| 7 | PMO | Pending Assignments | Jira AA | Connected | Assignment issue, assignee, client, status, dates | Show assignments not yet active / pending staffing action. |
| 8 | PMO | QA Center / Data Quality Checks | Derived from Jira + EazyBI + Harvest + Neon | Connected/WIP | Check ID, severity, affected rows, source, owner, Billing 0 invoice discount deadline | Show only active issues prominently; passed checks compact. For external Billing 0 rows, PMO can record whether it is discounted from invoice and until what date; this is audit metadata only. Procedures at bottom as toggle. |
| 9 | Coverage | Account Coverage | Jira PSA Epics | Connected/WIP | Client, Status, PM Assigned, CSM Assigned, TL Assigned | Filter by status. Alert in PMO QA when PM/CSM/TL is missing. Do not duplicate in Operating Views. |
| 10 | Harvest | Harvest Assignments | Harvest API + Jira AA comparison | WIP | Active users, active projects, project team members, Jira active assignments | Read-only. Compare Jira active assignments vs Harvest project access. Non-PMs should only have assigned client + Other. |
| 11 | Harvest | Harvest Hours Control | Harvest API / harvesthours app | WIP | User, client/project, hours loaded, completion % | Show completion status. Copy names for Slack #billing-hub. Do not modify Harvest. |
| 12 | History | Snapshot History | Neon `pmo_snapshots` | Connected | Snapshot date/time, metrics, reports payloads | Keep multiple raw snapshots but show one summary per month in History. Comparisons/deltas live here, not in Reports. |
| 13 | Forecast | Assignment Due Dates Forecast | Jira AA / EazyBI Next Due Dates | Connected but needs QA | Due month, client, assignee, position, PM | Filter by month, client, assignee/person, position. Do not use Bench due dates. |

| 14 | Reports / New Searches Reports | New Searches Triage | EazyBI | **Export JSON + embedded source** account `232624`, report `5434977` | Native PMO table populated from EazyBI export: search key/title, client, priority, status, created date, age, candidates/quantity | Delivery report used to review/triage new searches. Lives under Reports → New Searches Reports → New Searches Triage and must follow the same UX/UI pattern as the rest of the dashboard; iframe remains only in Source details for QA. |

---

## Report procedure notes

### Utilization Billing Rate

**Source:** EazyBI — account `232624`, report `5244970`  
**Source link:** https://aod.eazybi.com/accounts/232624/reports/5244970

**What this report shows**  
Utilization Billing Rate shows how much of the billable, non-freelance headcount is effectively utilized on external client work during the selected month.

**How it is calculated**  
The KPI is calculated as:

```text
Utilization Billing Rate = Utilization / Total Headcount
```

**Total Headcount** counts active Epic issues where:

- Issue type is `Epic`
- Freelance is `No`
- Billing Type is `Billable`
- The Epic is active in the selected period

**Utilization** sums assignment issues that are active during the month, excluding assignments where the client is `Bench` or `Azumo`. Each assignment is weighted by its `Assignment (%)`. If an assignment starts or ends during the month, only the overlapping working days are counted. The total is then divided by the number of working days in the month.

**How to read it**  
A value of `90%` means the company has the equivalent of 90 fully utilized billable resources for every 100 billable headcount in that month. Lower values can come from bench, internal Azumo work, partial allocations, mid-month starts or ends, or missing assignment data.

**QA checks**

- Bench and Azumo must not contribute to Utilization.
- Freelancers must not contribute to Total Headcount.
- Only Billable Epics must contribute to Total Headcount.
- Assignment (%) must be populated and correct.
- Start Date and Due Date must correctly prorate partial-month assignments by working days.
- Jira and Harvest hourly rates are not used for this KPI.


---

## Environment variables to configure

| Variable | Use |
|---|---|
| `EAZYBI_URL` | Base EazyBI URL, e.g. `https://aod.eazybi.com`. |
| `EAZYBI_EMAIL` | API user email. |
| `EAZYBI_TOKEN` | EazyBI API token. |
| `EAZYBI_ACCOUNT_ID` | Default account for primary PMO EazyBI reports. |
| `EAZYBI_REPORT_ID` | Aggregate KPI/Billing Dashboard report, if used. |
| `EAZYBI_UTILIZATION_BILLING_ACCOUNT_ID` | Utilization Billing Rate account, currently `232624`. |
| `EAZYBI_UTILIZATION_BILLING_REPORT_ID` | Utilization Billing Rate report, currently `5244970`. |
| `EAZYBI_UTILIZATION_BILLING_TOKEN` | Embed token stored in Vercel only. Do not document raw token. |
| `EAZYBI_BENCH_BY_MONTH_REPORT_ID` | Bench by Month report. **Needed.** |
| `EAZYBI_INTERNAL_PROJECTS_ACCOUNT_ID` | Internal Projects account, currently `216082`. |
| `EAZYBI_INTERNAL_PROJECTS_REPORT_ID` | Internal Projects report, currently `5259086`. |
| `EAZYBI_INTERNAL_PROJECTS_TOKEN` | Optional embed token. If absent, the dashboard uses the main EazyBI API token. |
| `EAZYBI_NEW_SEARCHES_ACCOUNT_ID` | New Searches account, currently `232624`. |
| `EAZYBI_NEW_SEARCHES_REPORT_ID` | New Searches Triage report, currently `5434977`. |
| `EAZYBI_NEW_SEARCHES_TOKEN` | Optional embed token. If absent, the dashboard uses the main EazyBI API token. |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Jira API access. |
| `HARVEST_ACCOUNT_ID`, `HARVEST_ACCESS_TOKEN` | Harvest read-only API access. |
| `DATABASE_URL` | Neon snapshot/account coverage storage. |

---

## What Federica can send for each new report

Paste either:

```html
<iframe src="https://aod.eazybi.com/accounts/ACCOUNT_ID/embed/report/REPORT_ID?embed_token=TOKEN"></iframe>
```

or:

```txt
https://aod.eazybi.com/accounts/ACCOUNT_ID/reports/REPORT_ID
```

Then PMO Dashboard setup can extract:

- `ACCOUNT_ID`
- `REPORT_ID`
- `embed_token` if needed
- report name / procedure
- dashboard module where it belongs

---

## Open items

1. Capture exact EazyBI report ID for **Bench by Month**.
2. Confirm if **Next Due Dates** should be Jira-only or EazyBI report-backed.
3. Confirm the complete set of Reports & Procedures links to expose at the bottom of Reports.
4. Add natural-language formulas for the remaining reports as PMO provides them.
