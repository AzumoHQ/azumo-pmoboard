#!/usr/bin/env python3
"""
pmo-refresh.py  —  PMO Dashboard Data Refresh
==============================================
Run this script after fetching Jira data via MCP.
Reads raw Jira JSON from stdin or a file, processes it,
appends a new snapshot to pmo-data.json, and injects
data into pmo-dashboard.html.

Usage (via scheduled Claude task):
    python3 pmo-refresh.py < jira-raw.json
    python3 pmo-refresh.py --file jira-raw.json
"""

import json, sys, os, argparse
from datetime import date, timedelta
from collections import defaultdict

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE    = os.path.join(SCRIPT_DIR, 'pmo-data.json')
DASH_FILE    = os.path.join(SCRIPT_DIR, 'pmo-dashboard.html')

# ── Custom fields (Azumo Jira) ─────────────────────────────────────────
CF_START_DATE  = 'customfield_10800'   # Start Date
CF_CLIENT      = 'customfield_11391'   # Client Name
CF_POSITION    = 'customfield_11525'   # Harvest Role / Position
CF_RATE        = 'customfield_11528'   # Rate (hourly)
CF_PCT         = 'customfield_12021'   # % Assignment


def parse_jira(raw_issues: list) -> dict:
    """Parse Jira issues into structured PMO data."""
    today = date.today()
    cutoff_60  = today + timedelta(days=60)
    cutoff_180 = today + timedelta(days=180)

    assignments = []
    for issue in raw_issues:
        f        = issue['fields']
        client   = (f.get(CF_CLIENT)   or {}).get('value', '')
        position = (f.get(CF_POSITION) or {}).get('value', '')
        assignee = (f.get('assignee')  or {}).get('displayName', '')
        email    = (f.get('assignee')  or {}).get('emailAddress', '')
        status   = f.get('status', {}).get('name', '')
        start    = f.get(CF_START_DATE, '') or ''
        due      = f.get('duedate', '') or ''
        rate     = f.get(CF_RATE)  or 0
        pct      = f.get(CF_PCT)   or 0

        # Skip internal CSM/account management rows
        if position == 'CSM' and rate == 0:
            continue

        assignments.append({
            'key': issue['key'], 'assignee': assignee, 'email': email,
            'status': status,    'client': client,     'position': position,
            'start': start,      'due': due,            'rate': rate, 'pct': pct
        })

    # ── Classify ─────────────────────────────────────────────────────
    bench   = [a for a in assignments if a['client'] == 'Bench' or a['status'] == 'On Hold']
    pending = [a for a in assignments if a['status'] == 'Assigned']
    active  = [a for a in assignments if a['status'] == 'In Progress'
               and a['client'] not in ('', 'Bench')]

    active_clients = sorted(set(
        a['client'] for a in active if a['client'] not in ('Azumo', '')
    ))

    # ── Dedup expiring (same person can have multiple assignments per client) ──
    seen_exp = set()
    expiring = []
    for a in sorted(active, key=lambda x: x['due']):
        if not a['due']:
            continue
        try:
            d = date.fromisoformat(a['due'])
        except ValueError:
            continue
        if today <= d <= cutoff_60:
            key = f"{a['assignee']}|{a['client']}"
            if key not in seen_exp:
                seen_exp.add(key)
                expiring.append({
                    'assignee': a['assignee'],
                    'client':   a['client'],
                    'position': a['position'],
                    'due':      a['due']
                })

    # ── Forecast: group by month (next 6 months), dedup per person+client ──
    seen_fc = set()
    forecast = defaultdict(list)
    for a in active:
        if not a['due']:
            continue
        try:
            d = date.fromisoformat(a['due'])
        except ValueError:
            continue
        if today <= d <= cutoff_180:
            month = d.strftime('%Y-%m')
            key   = f"{a['assignee']}|{a['client']}"
            if key not in seen_fc:
                seen_fc.add(key)
                forecast[month].append({
                    'assignee': a['assignee'],
                    'client':   a['client'],
                    'position': a['position']
                })

    forecast_sorted = dict(sorted(forecast.items()))

    return {
        'active':         active,
        'bench':          bench,
        'pending':        pending,
        'active_clients': active_clients,
        'expiring_60d':   expiring,
        'forecast':       forecast_sorted,
    }


def build_snapshot(parsed: dict, overrides: dict = None) -> dict:
    """Build a snapshot dict to append to history."""
    today   = date.today()
    active  = parsed['active']
    bench   = parsed['bench']
    pending = parsed['pending']
    clients = parsed['active_clients']

    # Headcount = unique active assignees (non-internal)
    billable_people = set(
        a['assignee'] for a in active
        if a['client'] not in ('Azumo', '') and a['rate'] and a['rate'] > 0
    )
    nonbill_people = set(
        a['assignee'] for a in active
        if a['client'] in ('Azumo',) or not a['rate']
    )

    metrics = {
        'utilization_assignment': overrides.get('utilization_assignment', 0) if overrides else 0,
        'utilization_billing':    overrides.get('utilization_billing', 0)    if overrides else 0,
        'headcount_billable':     len(billable_people),
        'headcount_nonbillable':  len(nonbill_people),
        'bench':                  len(bench) if bench else (overrides or {}).get('bench', 0),
        'active_clients':         len(clients),
        'pending_assignments':    len(pending),
        'unassigned_capacity':    overrides.get('unassigned_capacity', 0) if overrides else 0,
    }

    snap = {
        'date':         today.isoformat(),
        'label':        today.strftime('%b %Y'),
        'metrics':      metrics,
        'expiring_60d': parsed['expiring_60d'],
        'active_clients': parsed['active_clients'],
        'forecast':     parsed['forecast'],
        'bench_list':   parsed['bench'] if parsed['bench'] else (overrides or {}).get('bench_list', []),
        'pending_list': [
            {'key': a['key'], 'assignee': a['assignee'], 'client': a['client'],
             'position': a['position'], 'start': a['start']}
            for a in parsed['pending']
        ],
    }
    return snap


def load_or_create_data() -> dict:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'cloudId': '226f839b-1eed-48eb-993a-618d9bd89189',
        'project': 'AA',
        'last_refresh': '',
        'snapshots': []
    }


def update_data_file(snapshot: dict) -> dict:
    data = load_or_create_data()
    data['last_refresh'] = date.today().isoformat()

    # Replace today's snapshot if it already exists, else append
    existing = next((i for i, s in enumerate(data['snapshots'])
                     if s['date'] == snapshot['date']), None)
    if existing is not None:
        data['snapshots'][existing] = snapshot
    else:
        data['snapshots'].append(snapshot)

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✓ pmo-data.json updated — {len(data['snapshots'])} snapshots")
    return data


def inject_into_dashboard(data: dict):
    """Replace the DATA_PLACEHOLDER in pmo-dashboard.html with fresh data."""
    if not os.path.exists(DASH_FILE):
        print(f"⚠ Dashboard not found at {DASH_FILE} — skipping HTML injection")
        return

    with open(DASH_FILE, 'r', encoding='utf-8') as f:
        html = f.read()

    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    placeholder = '/*%%PMO_DATA%%*/'

    if placeholder not in html:
        print("⚠ DATA placeholder not found in HTML — skipping injection")
        return

    # Replace the current data object
    import re
    html = re.sub(
        r'/\*%%PMO_DATA%%\*/.*?/\*%%PMO_DATA_END%%\*/',
        f'{placeholder}{json_str}/*%%PMO_DATA_END%%*/',
        html,
        flags=re.DOTALL
    )
    with open(DASH_FILE, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"✓ pmo-dashboard.html updated with latest data")


def main():
    parser = argparse.ArgumentParser(description='PMO data refresh script')
    parser.add_argument('--file', help='Path to Jira raw JSON file (default: stdin)')
    parser.add_argument('--util-assignment', type=float, help='Utilization rate (assignment) from EazyBI')
    parser.add_argument('--util-billing',    type=float, help='Utilization rate (billing) from EazyBI')
    parser.add_argument('--bench',           type=int,   help='Bench count override')
    parser.add_argument('--unassigned',      type=float, help='Unassigned capacity % from EazyBI')
    args = parser.parse_args()

    # Load Jira raw data
    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            raw = json.load(f)
    else:
        raw = json.load(sys.stdin)

    # Support both raw issues array or wrapped {"issues": [...]}
    if isinstance(raw, list):
        issues = raw
    elif 'issues' in raw:
        issues = raw['issues']
    else:
        # Maybe it's the MCP tool result format
        if isinstance(raw, list) and raw and 'text' in raw[0]:
            issues = json.loads(raw[0]['text'])['issues']
        else:
            print("ERROR: Could not parse Jira JSON format", file=sys.stderr)
            sys.exit(1)

    overrides = {
        'utilization_assignment': args.util_assignment or 0,
        'utilization_billing':    args.util_billing    or 0,
        'bench':                  args.bench           or 0,
        'unassigned_capacity':    args.unassigned      or 0,
    }

    parsed   = parse_jira(issues)
    snapshot = build_snapshot(parsed, overrides)
    data     = update_data_file(snapshot)
    inject_into_dashboard(data)

    # Print summary
    s = snapshot
    print(f"\n📊 Snapshot summary — {s['label']}")
    print(f"   Active clients:   {s['metrics']['active_clients']}")
    print(f"   Bench:            {s['metrics']['bench']}")
    print(f"   Pending:          {s['metrics']['pending_assignments']}")
    print(f"   Expiring 60d:     {len(s['expiring_60d'])}")
    print(f"   Forecast months:  {list(s['forecast'].keys())}")


if __name__ == '__main__':
    main()
