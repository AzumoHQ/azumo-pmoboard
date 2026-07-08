# PMO Board — Decision Log

Read before making changes.

## Design
- Use Azumo tokens: --fg-1/2/3, --fg-mute, --bg-1/2/3, --border-subtle/default/strong, --success, --warning, --danger, --highlight-blue. Never hardcode colors.
- Minimal UI: buttons say what they do, no channel names or redundant labels.
- Role scoping: PM/CSM/TL see only their projects/clients via effectiveUserRole() + effectiveOwnedClientKeys().

## Architecture  
- Snapshot model: pre-aggregated per project (AA). activity_log compares current vs previous.
- No new npm packages without discussion.
- Feature flags: window.PMO_FLAGS. Set false before merging to main.
- Fact table (pmo_assignments): planned Phase 5-6, do not pre-optimize.

## Patterns
- Modal: auth-modal/auth-card classes.
- Navigation: goTo('sectionId') + opsFilters for drill-down.
- Harvest control: Copy button only, no channel name.
- Overview PM: 3 cards (bench, clients, headcount) + charts + activity feed.

## Pending
- AEFU performance reviews: project = AEFU AND issuetype = File
- Resource Utilization matrix
- Multi-project scope (Phase 7)
- Freelance: chip instead of Avail%
