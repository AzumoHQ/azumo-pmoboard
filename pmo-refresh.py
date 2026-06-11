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

import json, sys, os, argparse, base64, csv, ssl, subprocess, tempfile, unicodedata, urllib.error, urllib.request
from datetime import date, datetime, timedelta
from collections import defaultdict

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE    = os.path.join(SCRIPT_DIR, 'pmo-data.json')
DASH_FILES   = [
    os.path.join(SCRIPT_DIR, 'index.html'),
    os.path.join(SCRIPT_DIR, 'pmo-dashboard.html'),
]

# ── Custom fields (Azumo Jira) ─────────────────────────────────────────
CF_START_DATE  = 'customfield_10800'   # Start Date
CF_CLIENT      = 'customfield_11391'   # Client Name
CF_POSITION    = 'customfield_11525'   # Harvest Role / Position
CF_EPIC_POSITION = os.environ.get('JIRA_EPIC_POSITION_FIELD', CF_POSITION)  # Epic: Position - Assignee
# Jira rate is intentionally ignored. Rates live in Harvest only; Harvest is
# read-only here and rates are not imported into the PMO dashboard yet.
CF_RATE        = None
CF_PCT         = 'customfield_11528'   # Assignment (%)
CF_PROJECT_MANAGER = 'customfield_10828'  # Project Manager (SOW)
CF_EPIC_BILLING = 'customfield_11754'  # Epic Billing %
CF_FREELANCE   = 'customfield_13480'   # Epic Assignee Freelance Yes/No
CF_BILLING_TYPE = 'customfield_12711'  # Epic: assignee Billing Type
CF_COVERAGE_PM  = 'customfield_12678'  # PSA Epic PM Assigned
CF_COVERAGE_CSM = 'customfield_11425'  # PSA Epic CSM Assigned
CF_COVERAGE_TL  = 'customfield_11622'  # PSA Epic TL assigned
CF_COVERAGE_TL_FALLBACK = 'customfield_11490'  # Alternate TL assigned field

# ── EazyBI Billing Dashboard defaults ─────────────────────────────────
# These are the known Azumo EazyBI Cloud Export report identifiers.
# The report returns the global PMO metrics:
# Billable, Non-Billable, Utilization Rate (Assignment %),
# Unassigned Capacity, and Utilization Rate (Billing %).
DEFAULT_EAZYBI_ACCOUNT_ID = '211020'
DEFAULT_EAZYBI_REPORT_ID  = '4117808'
DEFAULT_EAZYBI_ASSIGNMENTS_ACCOUNT_ID = '207607'
DEFAULT_EAZYBI_ASSIGNMENTS_REPORT_ID  = '5348141'
DEFAULT_EAZYBI_BENCH_ACCOUNT_ID       = '232624'
DEFAULT_EAZYBI_BENCH_REPORT_ID        = '4814039'
HISTORY_PERCENT_FIELDS = (
    'utilization_assignment',
    'utilization_billing',
    'unassigned_capacity',
)
DEFAULT_EAZYBI_ENV_FILES  = [
    os.path.join(SCRIPT_DIR, '.env.local'),
    '/Users/federicagonzalez/Documents/pmo/pmo-dashboard/.env.local',
    '/Users/federicagonzalez/Documents/Codex/2026-05-27/tengo-un-repo-en-github-y/pmoboard/.env.local',
]
DEFAULT_NEON_STORE_LIB = '/Users/federicagonzalez/Documents/Codex/2026-05-27/tengo-un-repo-en-github-y/pmoboard/lib/data-store.js'
BENCH_ALLOWED_PROJECT_STATUSES = {'active', 'new hires', 'new hire'}
DEFAULT_ACCOUNT_COVERAGE_JQL = 'project = PSA AND issuetype = Epic AND status in ("In Progress", Backlog) ORDER BY updated DESC'
ACCOUNT_COVERAGE_FIELDS = [
    'summary',
    'status',
    'issuetype',
    'updated',
    CF_COVERAGE_PM,
    CF_COVERAGE_CSM,
    CF_COVERAGE_TL,
    CF_COVERAGE_TL_FALLBACK,
    CF_PROJECT_MANAGER,
]


def env_with_database_url(env_file: str = None) -> dict:
    """Merge process env with the first .env file containing DATABASE_URL."""
    env = dict(os.environ)
    candidates = [env_file] if env_file else DEFAULT_EAZYBI_ENV_FILES
    for candidate in candidates:
        values = load_dotenv(candidate)
        if values.get('DATABASE_URL'):
            env.update({k: v for k, v in values.items() if v != ''})
            env['_NEON_ENV_FILE'] = candidate
            break
    return env


def load_dotenv(path: str) -> dict:
    """Load a simple KEY=VALUE .env file without printing secrets."""
    env = {}
    if not path or not os.path.exists(path):
        return env

    with open(path, 'r', encoding='utf-8') as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def merged_env(env_file: str = None) -> dict:
    """Merge process env with the first usable EazyBI .env file."""
    env = dict(os.environ)
    candidates = [env_file] if env_file else DEFAULT_EAZYBI_ENV_FILES
    for candidate in candidates:
        values = load_dotenv(candidate)
        if values.get('EAZYBI_URL') and values.get('EAZYBI_EMAIL') and values.get('EAZYBI_TOKEN'):
            env.update({k: v for k, v in values.items() if v != ''})
            env['_EAZYBI_ENV_FILE'] = candidate
            break
    return env


def jira_env(env_file: str = None) -> dict:
    """Merge process env with the first .env file containing Jira credentials."""
    env = dict(os.environ)
    candidates = [env_file] if env_file else DEFAULT_EAZYBI_ENV_FILES
    for candidate in candidates:
        values = load_dotenv(candidate)
        if values.get('JIRA_BASE_URL') and values.get('JIRA_EMAIL') and values.get('JIRA_API_TOKEN'):
            env.update({k: v for k, v in values.items() if v != ''})
            env['_JIRA_ENV_FILE'] = candidate
            break
    return env


def jira_request(path: str, body: dict, env_file: str = None) -> dict:
    """Small Jira REST helper used only for Account Coverage enrichment."""
    env = jira_env(env_file)
    base_url = (env.get('JIRA_BASE_URL') or '').rstrip('/')
    email = env.get('JIRA_EMAIL') or ''
    token = env.get('JIRA_API_TOKEN') or ''
    if not (base_url and email and token):
        raise RuntimeError('Missing Jira config: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN')

    auth = base64.b64encode(f'{email}:{token}'.encode('utf-8')).decode('ascii')
    req = urllib.request.Request(
        f'{base_url}{path}',
        data=json.dumps(body).encode('utf-8'),
        method='POST',
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Basic {auth}',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except ssl.SSLCertVerificationError:
        with urllib.request.urlopen(req, timeout=45, context=ssl._create_unverified_context()) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        if isinstance(getattr(e, 'reason', None), ssl.SSLCertVerificationError):
            with urllib.request.urlopen(req, timeout=45, context=ssl._create_unverified_context()) as resp:
                return json.loads(resp.read().decode('utf-8'))
        raise
    except urllib.error.HTTPError as e:
        text = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Jira API error {e.code}: {text[:300]}')


def fetch_jira_issues(jql: str, fields: list, env_file: str = None, max_results: int = 100) -> list:
    """Fetch Jira issues from the current Search JQL API with pagination."""
    issues = []
    next_page_token = None
    while True:
        body = {
            'jql': jql,
            'fields': fields,
            'maxResults': max_results,
        }
        if next_page_token:
            body['nextPageToken'] = next_page_token
        payload = jira_request('/rest/api/3/search/jql', body, env_file=env_file)
        issues.extend(payload.get('issues') or [])
        next_page_token = payload.get('nextPageToken')
        if not next_page_token:
            break
    return issues


def percent_value(value):
    """Normalize EazyBI percentages. Values often arrive as 0-1 ratios."""
    if value is None or value == '':
        return 0
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0
    if abs(n) <= 1.5:
        n *= 100
    return round(n, 2)


def numeric_value(value):
    if value is None or value == '':
        return 0
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0
    return int(n) if n.is_integer() else round(n, 2)


def assignment_percent_value(assignment: dict) -> float:
    value = first_non_empty(
        assignment.get('assignment_pct'),
        assignment.get('pct'),
        0,
    )
    return float(numeric_value(value) or 0)


def child_issue_billing_class(assignment: dict) -> str:
    """Classify billable/non-billable directly from child Assignment issues."""
    if clean_report_value(assignment.get('status')) != 'In Progress':
        return ''
    client = clean_report_value(assignment.get('client'))
    if client in ('Azumo', 'Bench'):
        return 'Non-Billable'
    return 'Billable' if client else ''


def is_internal_capacity_client(client: str) -> bool:
    return clean_report_value(client) in ('Azumo', 'Bench')


def is_bench_client(client: str) -> bool:
    return clean_report_value(client) == 'Bench'


def normalize_internal_capacity(assignment: dict) -> dict:
    """Bench and Azumo are internal/non-billable capacity rows in the PMO model."""
    if not is_internal_capacity_client(assignment.get('client')):
        return assignment
    normalized = dict(assignment)
    assignment_pct = numeric_value(first_non_empty(
        normalized.get('assignment_pct'),
        normalized.get('pct'),
        '',
    ))
    normalized['pct'] = assignment_pct if assignment_pct != 0 or first_non_empty(normalized.get('assignment_pct'), normalized.get('pct'), '') != '' else ''
    normalized['assignment_pct'] = normalized['pct']
    normalized['billing_pct'] = 0
    if normalized.get('client') == 'Bench':
        normalized['availability_pct'] = first_non_empty(normalized.get('availability_pct'), normalized['assignment_pct'])
        normalized['bench_pct'] = first_non_empty(normalized.get('bench_pct'), normalized['assignment_pct'])
    else:
        normalized['availability_pct'] = max(0, 100 - float(normalized['assignment_pct'] or 0))
    normalized['epic_billing'] = 0
    normalized['billing_class'] = child_issue_billing_class(normalized)
    return normalized


def active_capacity_person_key(row: dict) -> str:
    email = clean_report_value(row.get('email')).lower()
    if email:
        return f'email:{email}'
    name = normalize_name(row.get('epic_assignee') or row.get('assignee') or '')
    return f'name:{name}' if name else ''


def apply_residual_bench_percent(assignments: list) -> list:
    """Model active Bench as residual capacity and flag Jira mismatches."""
    consumed_by_person = defaultdict(float)
    for assignment in assignments or []:
        if assignment.get('status') != 'In Progress':
            continue
        if is_bench_client(assignment.get('client')):
            continue
        person_key = active_capacity_person_key(assignment)
        if not person_key:
            continue
        consumed_by_person[person_key] += assignment_percent_value(assignment)

    adjusted = []
    for assignment in assignments or []:
        if not (is_bench_client(assignment.get('client')) and assignment.get('status') == 'In Progress'):
            adjusted.append(assignment)
            continue
        person_key = active_capacity_person_key(assignment)
        consumed = min(100, max(0, consumed_by_person.get(person_key, 0)))
        expected = round(100 - consumed, 2)
        jira_pct = assignment_percent_value(assignment)
        mismatch = abs(float(jira_pct or 0) - expected) > 0.01
        adjusted.append(normalize_internal_capacity({
            **assignment,
            'jira_bench_pct': jira_pct,
            'pct': expected,
            'assignment_pct': expected,
            'availability_pct': expected,
            'bench_pct': expected,
            'bench_expected_pct': expected,
            'bench_consumed_pct': round(consumed, 2),
            'bench_pct_mismatch': mismatch,
        }))
    return adjusted


def direct_child_issue_headcount(assignments: list) -> dict:
    totals = {'billable': 0.0, 'nonbillable': 0.0}
    for assignment in assignments or []:
        klass = child_issue_billing_class(assignment)
        if not klass:
            continue
        pct = assignment_percent_value(assignment)
        if klass == 'Non-Billable':
            totals['nonbillable'] += pct
        else:
            totals['billable'] += pct
    return {
        'billable': round(totals['billable'] / 100, 2),
        'nonbillable': round(totals['nonbillable'] / 100, 2),
    }


def eazybi_column_names(column_positions):
    names = []
    for col_set in column_positions or []:
        parts = []
        for col in col_set:
            parts.append(col.get('name') or col.get('full_name') or '?')
        names.append(' / '.join(parts))
    return names


def fetch_eazybi_report(env_file: str = None, account_id: str = None, report_id: str = None) -> dict:
    """Fetch an EazyBI Cloud Export report."""
    env = merged_env(env_file)
    base_url = (env.get('EAZYBI_URL') or '').rstrip('/')
    email    = env.get('EAZYBI_EMAIL') or env.get('JIRA_EMAIL') or ''
    token    = env.get('EAZYBI_TOKEN') or ''
    account  = account_id or env.get('EAZYBI_ACCOUNT_ID') or DEFAULT_EAZYBI_ACCOUNT_ID
    report   = report_id  or env.get('EAZYBI_REPORT_ID')  or DEFAULT_EAZYBI_REPORT_ID

    if not (base_url and email and token and account and report):
        raise RuntimeError('Missing EazyBI config: EAZYBI_URL, EAZYBI_EMAIL, EAZYBI_TOKEN, account ID, or report ID')

    url = f'{base_url}/accounts/{account}/export/report/{report}.json'
    auth = base64.b64encode(f'{email}:{token}'.encode('utf-8')).decode('ascii')
    req = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'Authorization': f'Basic {auth}',
    })

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except ssl.SSLCertVerificationError:
        # Some local Python installs on macOS miss CA certs; retry once with
        # an unverified context rather than blocking the scheduled refresh.
        with urllib.request.urlopen(req, timeout=45, context=ssl._create_unverified_context()) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.URLError as e:
        # Python wraps SSL verification failures in URLError on some versions.
        if isinstance(getattr(e, 'reason', None), ssl.SSLCertVerificationError):
            with urllib.request.urlopen(req, timeout=45, context=ssl._create_unverified_context()) as resp:
                payload = json.loads(resp.read().decode('utf-8'))
        else:
            raise
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'EazyBI API error {e.code}: {body[:300]}')

    return payload


def fetch_eazybi_billing_metrics(env_file: str = None, account_id: str = None, report_id: str = None) -> dict:
    """Fetch Billing Dashboard metrics from EazyBI Cloud Export API."""
    payload = fetch_eazybi_report(
        env_file=env_file,
        account_id=account_id or DEFAULT_EAZYBI_ACCOUNT_ID,
        report_id=report_id or DEFAULT_EAZYBI_REPORT_ID,
    )

    query_results = payload.get('query_results') or {}
    values = query_results.get('values') or []
    if not values:
        raise RuntimeError('EazyBI Billing report returned no values')

    columns = eazybi_column_names(query_results.get('column_positions') or [])
    row = {name: values[0][idx] if idx < len(values[0]) else None
           for idx, name in enumerate(columns)}

    metrics = {
        # EazyBI source-of-truth headcount values.
        'headcount_billable':    numeric_value(row.get('Billable')),
        'headcount_nonbillable': numeric_value(row.get('Non-Billable')),
        # EazyBI returns these as ratios; dashboard expects percentages.
        'utilization_assignment': percent_value(row.get('Utilization Rate (Assignment %)')),
        'unassigned_capacity':    percent_value(row.get('Unassigned Capacity')),
        'utilization_billing':    percent_value(row.get('Utilization Rate (Billing %)')),
    }
    metrics['_eazybi_report_name'] = payload.get('report_name', 'Billing Dashboard')
    metrics['_eazybi_last_import_at'] = payload.get('last_import_at', '')
    return metrics


def parse_eazybi_rows(payload: dict) -> list:
    query_results = payload.get('query_results') or {}
    values = query_results.get('values') or []
    formatted = query_results.get('formatted_values') or []
    columns = eazybi_column_names(query_results.get('column_positions') or [])
    rows = []
    for idx, row_position in enumerate(query_results.get('row_positions') or []):
        row_label = ' / '.join(
            col.get('name') or col.get('full_name') or '?'
            for col in row_position
        )
        row = {'row_label': row_label}
        for cidx, name in enumerate(columns):
            row[name] = values[idx][cidx] if idx < len(values) and cidx < len(values[idx]) else None
            row[f'{name}_formatted'] = (
                formatted[idx][cidx]
                if idx < len(formatted) and cidx < len(formatted[idx])
                else None
            )
        rows.append(row)
    return rows


def fetch_eazybi_assignment_metrics(env_file: str = None) -> dict:
    """Map Jira assignment issue key -> assignment/billing/availability metrics."""
    payload = fetch_eazybi_report(
        env_file=env_file,
        account_id=DEFAULT_EAZYBI_ASSIGNMENTS_ACCOUNT_ID,
        report_id=DEFAULT_EAZYBI_ASSIGNMENTS_REPORT_ID,
    )
    metrics = {}
    for row in parse_eazybi_rows(payload):
        key = row.get('row_label')
        if not key:
            continue
        metrics[key] = {
            'client': row.get('Client Name') or '',
            'assignment_pct': percent_value(row.get('% Assignment')),
            'billing_pct': percent_value(row.get('Billing (%)')),
            'availability_pct': percent_value(row.get('Availability (Assignment %)')),
            'start': row.get('Start Date') or '',
            'due': row.get('Due date.') or '',
            'position': row.get('Position') or '',
            'technology': row.get('Technology') or '',
            'frameworks': row.get('Frameworks') or '',
            'potential_next_assignment': row.get('Potential next assignment') or row.get('Potential Next Assignment') or '',
            'project_manager': row.get('Project Manager') or '',
            'csm': row.get('CSM Assigned') or '',
        }
    return metrics


def fetch_eazybi_bench_metrics(env_file: str = None) -> dict:
    """Map assignee name -> current-month availability/utilization from Bench report."""
    payload = fetch_eazybi_report(
        env_file=env_file,
        account_id=DEFAULT_EAZYBI_BENCH_ACCOUNT_ID,
        report_id=DEFAULT_EAZYBI_BENCH_REPORT_ID,
    )
    query_results = payload.get('query_results') or {}
    columns = eazybi_column_names(query_results.get('column_positions') or [])
    current_month = date.today().strftime('%b %Y')
    availability_col = next((c for c in columns if c.startswith('Availability /') and current_month in c), None)
    utilization_col  = next((c for c in columns if c.startswith('Utilization /') and current_month in c), None)
    availability_col = availability_col or next((c for c in columns if c.startswith('Availability /')), None)
    utilization_col  = utilization_col  or next((c for c in columns if c.startswith('Utilization /')), None)

    metrics = {}
    for row in parse_eazybi_rows(payload):
        name = row.get('row_label')
        if not name or name == 'Assignees':
            continue
        metrics[name] = {
            'availability_pct': percent_value(row.get(availability_col)) if availability_col else 0,
            'assignment_pct': percent_value(row.get(utilization_col)) if utilization_col else 0,
        }
    return metrics


def first_non_empty(*values):
    for value in values:
        if value not in (None, ''):
            return value
    return ''


def clean_report_value(value):
    """Normalize exported EazyBI/Jira display values."""
    if value is None:
        return ''
    value = str(value).strip()
    if value == '(none)':
        return ''
    return value


def jira_field_value(value):
    """Return a display value for Jira scalar/select/user fields."""
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return (
            value.get('value')
            or value.get('name')
            or value.get('displayName')
            or ''
        )
    if isinstance(value, list):
        return ', '.join(filter(None, (jira_field_value(v) for v in value)))
    return str(value)


def is_non_billable_billing_type(value):
    normalized = clean_report_value(value).lower().replace('-', '').replace(' ', '')
    return 'nonbillable' in normalized


def normalize_name(value):
    """Case/accent-insensitive assignee key used to join EazyBI CSV rows to Jira rows."""
    value = clean_report_value(value).lower()
    value = ''.join(
        c for c in unicodedata.normalize('NFKD', value)
        if not unicodedata.combining(c)
    )
    return ' '.join(value.split())


def normalize_client_key(value):
    """Accent/punctuation-insensitive client key used to join PSA Account Coverage to AA clients."""
    value = clean_report_value(value).lower()
    value = ''.join(
        c for c in unicodedata.normalize('NFKD', value)
        if not unicodedata.combining(c)
    )
    return ''.join(c for c in value if c.isalnum())


def account_coverage_row(issue: dict) -> dict:
    fields = issue.get('fields') or {}
    pm = first_non_empty(
        jira_field_value(fields.get(CF_COVERAGE_PM)),
        jira_field_value(fields.get(CF_PROJECT_MANAGER)),
    )
    csm = jira_field_value(fields.get(CF_COVERAGE_CSM))
    tl = first_non_empty(
        jira_field_value(fields.get(CF_COVERAGE_TL)),
        jira_field_value(fields.get(CF_COVERAGE_TL_FALLBACK)),
    )
    missing = [
        label
        for label, value in (('PM', pm), ('CSM', csm), ('TL', tl))
        if not value
    ]
    client = clean_report_value(fields.get('summary'))
    status = ''
    if isinstance(fields.get('status'), dict):
        status = fields['status'].get('name', '') or ''
    return {
        'key': issue.get('key', ''),
        'client': client,
        'client_key': normalize_client_key(client),
        'status': status,
        'pm_assigned': pm,
        'csm_assigned': csm,
        'tl_assigned': tl,
        'missing': missing,
        'complete': not missing,
        'source': 'Jira PSA Epic Account Coverage',
    }


def parse_account_coverage_issues(issues: list) -> list:
    by_client = {}
    for issue in issues or []:
        row = account_coverage_row(issue)
        key = row.get('client_key')
        if not key:
            continue
        if key not in by_client:
            by_client[key] = row
            continue
        existing = by_client[key]
        for field in ('pm_assigned', 'csm_assigned', 'tl_assigned'):
            if not existing.get(field) and row.get(field):
                existing[field] = row[field]
        existing['missing'] = [
            label
            for label, field in (('PM', 'pm_assigned'), ('CSM', 'csm_assigned'), ('TL', 'tl_assigned'))
            if not existing.get(field)
        ]
        existing['complete'] = not existing['missing']
    return sorted(by_client.values(), key=lambda row: row.get('client', ''))


def due_item_from_assignment(a: dict) -> dict:
    """Build a compact due-date row for dashboard forecast/expiring tables."""
    return {
        'key':      a.get('key', ''),
        'assignee': a.get('assignee', ''),
        'client':   a.get('client', ''),
        'position': a.get('position', ''),
        'due':      a.get('due', ''),
        'sow':      a.get('summary', ''),
        'status':   a.get('status', ''),
        'technology': a.get('technology', ''),
        'frameworks': a.get('frameworks', ''),
        'project_manager': a.get('project_manager', ''),
        'csm': a.get('csm') or a.get('csm_assigned', ''),
        'source':   a.get('source', 'Jira'),
    }


def assignment_row_from_assignment(a: dict) -> dict:
    """Build the richer row used by the Assignees / Clients / Positions views."""
    a = normalize_internal_capacity(a)
    return {
        'key': a.get('key', ''),
        'assignee': a.get('assignee', ''),
        'email': a.get('email', ''),
        'status': a.get('status', ''),
        'client': a.get('client', ''),
        'position': a.get('position', ''),
        'assignment_position': a.get('assignment_position', ''),
        'epic_position': a.get('epic_position', ''),
        'start': a.get('start', ''),
        'due': a.get('due', ''),
        'epic_due': a.get('epic_due', ''),
        'rate': '',
        'pct': a.get('pct', ''),
        'assignment_pct': a.get('assignment_pct', ''),
        'billing_pct': a.get('billing_pct', ''),
        'availability_pct': a.get('availability_pct', ''),
        'bench_pct': a.get('bench_pct', ''),
        'project_status': a.get('project_status', ''),
        'epic_status': a.get('epic_status', ''),
        'technology': a.get('technology', ''),
        'frameworks': a.get('frameworks', ''),
        'potential_next_assignment': a.get('potential_next_assignment', ''),
        'project_manager': a.get('project_manager', ''),
        'csm': a.get('csm') or a.get('csm_assigned', ''),
        'csm_assigned': a.get('csm_assigned') or a.get('csm', ''),
        'summary': a.get('summary', ''),
        'epic_key': a.get('epic_key', ''),
        'epic_assignee': a.get('epic_assignee', ''),
        'freelance': a.get('freelance', ''),
        'epic_billing': a.get('epic_billing', ''),
        'billing_class': a.get('billing_class', ''),
        'billing_type': a.get('billing_type', ''),
        'jira_bench_pct': a.get('jira_bench_pct', ''),
        'bench_expected_pct': a.get('bench_expected_pct', ''),
        'bench_consumed_pct': a.get('bench_consumed_pct', ''),
        'bench_pct_mismatch': bool(a.get('bench_pct_mismatch')),
        'source': a.get('source', 'Jira'),
    }


def build_due_date_rollups(rows: list, today: date = None) -> dict:
    """
    Build due-date rollups from assignment-like rows.

    Forecast intentionally uses only Assignment issues currently In Progress
    and counts each Jira assignment key once. There is no 6-month cap because
    the EazyBI "Next Due Dates" report is an assignment due-date schedule, not
    a short contract-risk projection.
    """
    today = today or date.today()
    cutoff_60 = today + timedelta(days=60)
    forecast = defaultdict(list)
    expiring = []

    for a in sorted(rows, key=lambda x: (x.get('due') or '', x.get('key') or '', x.get('assignee') or '')):
        if a.get('status') and a.get('status') != 'In Progress':
            continue
        if is_bench_client(a.get('client')):
            continue
        if not a.get('due'):
            continue
        try:
            d = date.fromisoformat(a['due'])
        except (TypeError, ValueError):
            continue

        item = due_item_from_assignment(a)
        forecast[d.strftime('%Y-%m')].append(item)
        # Include overdue In Progress assignments as urgent expiring items.
        if d <= cutoff_60:
            expiring.append({
                'key':      item['key'],
                'assignee': item['assignee'],
                'client':   item['client'],
                'position': item['position'],
                'due':      item['due'],
                'sow':      item.get('sow', ''),
                'project_manager': item.get('project_manager', ''),
                'csm': item.get('csm', ''),
            })

    forecast_sorted = {month: forecast[month] for month in sorted(forecast)}
    return {
        'expiring_60d': expiring,
        'forecast': forecast_sorted,
        'forecast_total': sum(len(items) for items in forecast_sorted.values()),
    }


def load_next_due_dates_csv(path: str) -> list:
    """Load an EazyBI "Next Due Dates" CSV export."""
    if not path:
        return []
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for raw in reader:
            due = clean_report_value(raw.get('Due Date') or raw.get('Due date.') or raw.get('Due Date '))
            if not due:
                continue
            rows.append({
                'key':             clean_report_value(raw.get('SOW Key') or raw.get('Key')),
                'assignee':        clean_report_value(raw.get('Assignee')),
                'client':          clean_report_value(raw.get('Client Name')),
                'summary':         clean_report_value(raw.get('SOW')),
                'project_manager': clean_report_value(raw.get('Project Manager')),
                'due':             due,
                'position':        clean_report_value(raw.get('Position')),
                'technology':      clean_report_value(raw.get('Technology')),
                'csm':             clean_report_value(raw.get('CSM Assigned')),
                'status':          'In Progress',
                'source':          'EazyBI Next Due Dates CSV',
            })
    return rows


def filter_non_billable_report_rows(rows: list, excluded_keys) -> list:
    """Remove CSV rows whose Jira assignment key was excluded as Non-Billable."""
    excluded_keys = set(excluded_keys or [])
    if not excluded_keys:
        return rows
    return [row for row in rows if row.get('key') not in excluded_keys]


def load_bench_report_csv(path: str) -> list:
    """Load the EazyBI Bench CSV export and keep only Active/New Hires resources."""
    if not path:
        return []
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            return []

        # EazyBI exports this report with two blank leading header cells:
        # ['', '', 'Status', 'Position', ...]. Treat them as Client/Assignee.
        normalized_headers = []
        for idx, header in enumerate(headers):
            header = clean_report_value(header)
            if idx == 0 and not header:
                header = 'Client'
            elif idx == 1 and not header:
                header = 'Assignee'
            normalized_headers.append(header or f'Column {idx + 1}')

        for raw_row in reader:
            if not any(clean_report_value(v) for v in raw_row):
                continue
            raw = {
                normalized_headers[idx]: raw_row[idx] if idx < len(raw_row) else ''
                for idx in range(len(normalized_headers))
            }
            project_status = clean_report_value(
                raw.get('Status') or raw.get('Project Status') or raw.get('AA Project Status')
            )
            if project_status.lower() not in BENCH_ALLOWED_PROJECT_STATUSES:
                continue

            bench_pct = percent_value(raw.get('% Bench') or raw.get('Bench %') or raw.get('Availability'))
            billing_pct = percent_value(raw.get('Billing %') or raw.get('Billing (%)'))
            rows.append({
                'client': clean_report_value(raw.get('Client')) or 'Bench',
                'assignee': clean_report_value(raw.get('Assignee')),
                'project_status': project_status,
                'position': clean_report_value(raw.get('Position')),
                'potential_next_assignment': clean_report_value(raw.get('Potential next assignment')),
                'availability_pct': bench_pct,
                'bench_pct': bench_pct,
                'billing_pct': billing_pct,
                'technology': clean_report_value(raw.get('Technology')),
                'frameworks': clean_report_value(raw.get('Frameworks')),
                'source': 'EazyBI Bench CSV',
            })
    return rows


def report_percent_value(value):
    """Convert EazyBI ratio or percentage exports to dashboard percent values."""
    if value in (None, ''):
        return 0
    try:
        number = float(str(value).replace('%', '').replace(',', '').strip())
    except ValueError:
        return 0
    if abs(number) <= 1.5:
        number *= 100
    return round(number, 2)


def load_bench_by_month_csv(path: str) -> dict:
    """Load the EazyBI Bench by Month CSV export."""
    if not path:
        return {}
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    with open(path, newline='', encoding='utf-8-sig') as f:
        raw_rows = list(csv.reader(f))
    if len(raw_rows) < 3:
        return {}

    measure_row = raw_rows[0]
    month_row = raw_rows[1]
    columns = []
    months = []
    for idx in range(1, max(len(measure_row), len(month_row))):
        measure = clean_report_value(measure_row[idx] if idx < len(measure_row) else '')
        month = clean_report_value(month_row[idx] if idx < len(month_row) else '')
        if measure and month:
            columns.append((idx, measure, month))
            if month not in months:
                months.append(month)

    rows = []
    totals = None
    for raw in raw_rows[2:]:
        if not raw or not any(clean_report_value(value) for value in raw):
            continue
        assignee = clean_report_value(raw[0] if raw else '')
        if not assignee:
            continue
        item = {'assignee': assignee, 'availability': {}, 'utilization': {}}
        for idx, measure, month in columns:
            value = raw[idx] if idx < len(raw) else ''
            if measure.lower() == 'availability':
                item['availability'][month] = report_percent_value(value)
            elif measure.lower() == 'utilization':
                item['utilization'][month] = report_percent_value(value)
        if assignee == 'Assignees':
            totals = item
        else:
            rows.append(item)

    return {
        'source': 'EazyBI Bench by Month CSV',
        'months': months,
        'totals': totals,
        'rows': rows,
    }


def load_utilization_billing_rate_csv(path: str) -> dict:
    """Load the EazyBI Utilization Billing Rate CSV export."""
    if not path:
        return {}
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    with open(path, newline='', encoding='utf-8-sig') as f:
        raw_rows = list(csv.reader(f))
    if len(raw_rows) < 3:
        return {}

    measure_row = raw_rows[0]
    month_row = raw_rows[1]
    data_row = next((row for row in raw_rows[2:] if row and clean_report_value(row[0]) == 'Assignees'), raw_rows[2])
    months = []
    rates = {}
    total_headcount = 0
    for idx in range(1, max(len(measure_row), len(month_row), len(data_row))):
        measure = clean_report_value(measure_row[idx] if idx < len(measure_row) else '')
        month = clean_report_value(month_row[idx] if idx < len(month_row) else '')
        value = data_row[idx] if idx < len(data_row) else ''
        if measure == 'Utilization Billing Rate' and month:
            months.append(month)
            rates[month] = report_percent_value(value)
        elif measure == 'Total Headcount':
            try:
                total_headcount = int(float(str(value).replace(',', '').strip() or 0))
            except ValueError:
                total_headcount = 0

    report = {
        'source': 'EazyBI Utilization Billing Rate CSV',
        'months': months,
        'rates': rates,
        'total_headcount': total_headcount,
        'raw_table': {
            'columns': ['Source row'] + [
                ' / '.join([clean_report_value(measure_row[idx] if idx < len(measure_row) else ''),
                            clean_report_value(month_row[idx] if idx < len(month_row) else '')]).strip(' /')
                for idx in range(1, max(len(measure_row), len(month_row), len(data_row)))
            ],
            'rows': [[clean_report_value(data_row[0] if data_row else 'Assignees')] + [
                data_row[idx] if idx < len(data_row) else ''
                for idx in range(1, max(len(measure_row), len(month_row), len(data_row)))
            ]]
        }
    }
    return normalize_utilization_billing_rate_report(report)


def load_generic_report_csv(path: str, source: str = 'EazyBI QA CSV') -> dict:
    """Load a generic QA CSV as a raw table for daily audit traceability."""
    if not path:
        return {}
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    with open(path, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.reader(f))
    if not rows:
        return {}
    return {
        'source': source,
        'columns': rows[0],
        'rows': rows[1:],
        'row_count': max(0, len(rows) - 1),
    }


def normalize_utilization_billing_rate_report(report: dict) -> dict:
    if not report:
        return {}
    months = report.get('months') or list((report.get('rates') or {}).keys())
    rates = {
        month: report_percent_value((report.get('rates') or {}).get(month))
        for month in months
    }
    total_headcount = numeric_value(report.get('total_headcount', 0))
    formula = report.get('formula') or {
        'label': 'Utilization Billing Rate',
        'calculation': 'Utilization Billing Rate = Billed / utilized billable capacity ÷ Total Headcount',
        'numerator': 'Billed / utilized billable capacity from EazyBI',
        'denominator': 'Total Headcount from EazyBI',
        'note': 'The dashboard stores the EazyBI percentage as the authoritative KPI. When the numerator is not exported by the report, billed headcount is estimated as Utilization Billing % × total headcount for review only. Hourly rates are not used; Harvest rates are read-only and are not imported yet.',
    }
    modeled_rows = report.get('modeled_rows') or []
    if not modeled_rows:
        for month in months:
            rate = rates.get(month, 0)
            estimated_billable = round((float(rate) / 100) * float(total_headcount or 0), 2)
            modeled_rows.append({
                'month': month,
                'utilization_billing_rate': rate,
                'total_headcount': total_headcount,
                'estimated_billable_headcount': estimated_billable,
                'formula': f"{estimated_billable} ÷ {total_headcount} = {rate}%" if total_headcount else f"EazyBI exported {rate}%",
            })
    raw_table = report.get('raw_table') or {
        'columns': ['Month', 'Utilization Billing Rate', 'Total Headcount', 'Estimated billed HC'],
        'rows': [
            [
                row.get('month'),
                f"{row.get('utilization_billing_rate')}%",
                row.get('total_headcount'),
                row.get('estimated_billable_headcount'),
            ]
            for row in modeled_rows
        ],
    }
    next_report = dict(report)
    next_report.update({
        'months': months,
        'rates': rates,
        'total_headcount': total_headcount,
        'formula': formula,
        'modeled_rows': modeled_rows,
        'raw_table': raw_table,
    })
    return next_report


def apply_next_due_date_enrichment(parsed: dict, rows: list) -> dict:
    """Use EazyBI Next Due Dates rows as auxiliary metadata without overriding Epic Position."""
    by_key = {
        row.get('key'): row
        for row in rows or []
        if row.get('key')
    }
    if not by_key:
        return parsed

    for bucket in ('active', 'bench', 'pending'):
        for assignment in parsed.get(bucket, []):
            row = by_key.get(assignment.get('key'))
            if not row:
                continue

            # Never overwrite the current Jira assignee with auxiliary rows.
            # Bench due dates are placeholders and are never used in forecast
            # rollups; auxiliary data may only fill a missing assignee label.
            if not assignment.get('assignee'):
                old_assignee = assignment.get('assignee')
                assignment['assignee'] = first_non_empty(row.get('assignee'), assignment.get('assignee'))
                if assignment.get('assignee') != old_assignee and not row.get('email'):
                    assignment['email'] = ''
            # Jira Assignment due date is the source of truth. CSV/EazyBI can
            # fill a missing due date, but must not overwrite a Jira change.
            assignment['due'] = first_non_empty(assignment.get('due'), row.get('due'))
            assignment['summary'] = first_non_empty(row.get('summary'), assignment.get('summary'))
            assignment['technology'] = first_non_empty(row.get('technology'), assignment.get('technology'))
            assignment['project_manager'] = first_non_empty(row.get('project_manager'), assignment.get('project_manager'))
            assignment['csm'] = first_non_empty(row.get('csm'), assignment.get('csm'))
            assignment['csm_assigned'] = first_non_empty(row.get('csm'), assignment.get('csm_assigned'))
            assignment['source'] = first_non_empty(row.get('source'), assignment.get('source'), 'Jira')

    return parsed


def apply_bench_report(parsed: dict, rows: list) -> dict:
    """Replace Jira's broad Bench/On Hold list with the filtered EazyBI Bench report."""
    if not rows:
        return parsed

    existing_by_name = defaultdict(list)
    for assignment in parsed.get('bench', []):
        key = normalize_name(assignment.get('assignee'))
        if key:
            existing_by_name[key].append(assignment)

    bench = []
    for row in rows:
        matches = existing_by_name.get(normalize_name(row.get('assignee')), [])
        # Prefer the actual Bench client row if Jira has several On Hold rows for
        # the same person; otherwise keep the first useful match for due/key.
        match = next((m for m in matches if m.get('client') == 'Bench'), matches[0] if matches else {})
        merged = {
            **match,
            **row,
            'key': first_non_empty(match.get('key'), row.get('key')),
            'email': first_non_empty(match.get('email'), row.get('email')),
            'status': first_non_empty(match.get('status'), row.get('status')),
            'position': match.get('position', ''),
            'epic_position': match.get('epic_position', ''),
            'assignment_position': match.get('assignment_position', ''),
            'start': first_non_empty(match.get('start'), row.get('start')),
            'due': first_non_empty(match.get('due'), row.get('due')),
            'summary': first_non_empty(row.get('potential_next_assignment'), match.get('summary')),
            'epic_status': first_non_empty(match.get('epic_status'), row.get('project_status')),
            'project_status': first_non_empty(match.get('epic_status'), row.get('project_status')),
        }
        bench.append(normalize_internal_capacity(merged))

    residual_rows = apply_residual_bench_percent(parsed.get('active', []) + bench + parsed.get('pending', []))
    parsed['active'] = [row for row in residual_rows if row.get('status') == 'In Progress' and row.get('client') not in ('', 'Bench')]
    parsed['pending'] = [row for row in residual_rows if row.get('status') == 'Assigned']
    parsed['bench'] = sorted(
        [row for row in residual_rows if row.get('client') == 'Bench' and row.get('status') == 'In Progress'],
        key=lambda a: (-float(numeric_value(a.get('availability_pct')) or 0), normalize_name(a.get('assignee')))
    )
    parsed['bench_source'] = 'EazyBI Bench report · Active/New Hires only'
    return parsed


def parse_jira(raw_issues: list, assignment_metrics: dict = None, bench_metrics: dict = None) -> dict:
    """Parse Jira issues into structured PMO data."""
    today = date.today()
    cutoff_60  = today + timedelta(days=60)
    cutoff_180 = today + timedelta(days=180)
    assignment_metrics = assignment_metrics or {}
    bench_metrics = bench_metrics or {}
    excluded_nonbillable_keys = set()
    non_billable_epic_assignments = []

    assignments = []
    for issue in raw_issues:
        f        = issue['fields']
        parent   = f.get('parent') or {}
        parent_fields = parent.get('fields') or {}
        client   = (f.get(CF_CLIENT)   or {}).get('value', '')
        assignment_position = jira_field_value(f.get(CF_POSITION))
        epic_position = first_non_empty(
            jira_field_value(parent_fields.get(CF_EPIC_POSITION)),
            jira_field_value(parent_fields.get(CF_POSITION)),
        )
        position = epic_position
        assignee = (f.get('assignee')  or {}).get('displayName', '')
        email    = (f.get('assignee')  or {}).get('emailAddress', '')
        status   = f.get('status', {}).get('name', '')
        start    = f.get(CF_START_DATE, '') or ''
        due      = f.get('duedate', '') or ''
        rate     = ''
        pct      = f.get(CF_PCT)   or 0
        key      = issue['key']
        summary  = f.get('summary', '') or ''
        billing_type = first_non_empty(
            jira_field_value(parent_fields.get(CF_BILLING_TYPE)),
            jira_field_value(f.get(CF_BILLING_TYPE)),
        )
        epic_key = parent.get('key', '') or ''
        epic_due = parent_fields.get('duedate', '') or ''
        epic_status = ''
        if isinstance(parent_fields.get('status'), dict):
            epic_status = parent_fields['status'].get('name', '') or ''
        epic_assignee = ''
        if isinstance(parent_fields.get('assignee'), dict):
            epic_assignee = parent_fields['assignee'].get('displayName', '') or ''
        freelance = first_non_empty(
            jira_field_value(parent_fields.get(CF_FREELANCE)),
            jira_field_value(f.get(CF_FREELANCE)),
        )
        epic_billing = numeric_value(first_non_empty(
            parent_fields.get(CF_EPIC_BILLING),
            f.get(CF_EPIC_BILLING),
        ))
        eazy_assignment = assignment_metrics.get(key) or assignment_metrics.get(epic_key, {})
        eazy_bench = bench_metrics.get(assignee, {})
        assignment_pct = first_non_empty(
            numeric_value(pct),
            eazy_assignment.get('assignment_pct'),
            eazy_bench.get('assignment_pct'),
        )
        billing_pct = first_non_empty(eazy_assignment.get('billing_pct'), None)
        availability_pct = first_non_empty(
            eazy_assignment.get('availability_pct'),
            eazy_bench.get('availability_pct'),
            None,
        )

        start = first_non_empty(start, eazy_assignment.get('start'))
        due = first_non_empty(due, eazy_assignment.get('due'))
        technology = eazy_assignment.get('technology', '')
        frameworks = eazy_assignment.get('frameworks', '')
        potential_next_assignment = eazy_assignment.get('potential_next_assignment', '')
        project_manager = first_non_empty(
            jira_field_value(f.get(CF_PROJECT_MANAGER)),
            eazy_assignment.get('project_manager', ''),
        )
        csm = eazy_assignment.get('csm', '')
        billing_class = child_issue_billing_class({
            'status': status,
            'client': client,
            'assignment_pct': assignment_pct,
        })

        assignment = {
            'key': key,          'assignee': assignee, 'email': email,
            'status': status,    'client': client,     'position': position,
            'assignment_position': assignment_position,
            'epic_position': epic_position,
            'start': start,      'due': due,            'rate': rate, 'pct': pct,
            'epic_due': epic_due,
            'summary': summary,
            'assignment_pct': assignment_pct,
            'billing_pct': billing_pct,
            'availability_pct': availability_pct,
            'technology': technology,
            'frameworks': frameworks,
            'potential_next_assignment': potential_next_assignment,
            'project_manager': project_manager,
            'csm': csm,
            'csm_assigned': csm,
            'epic_key': epic_key,
            'epic_status': epic_status,
            'epic_assignee': epic_assignee,
            'freelance': freelance,
            'epic_billing': epic_billing,
            'billing_class': billing_class,
            'billing_type': billing_type,
        }
        # Skip rows whose Epic assignee Billing Type is Non-Billable, but keep
        # an audit index so Harvest Team can hide matching SOW/person access.
        if is_non_billable_billing_type(billing_type):
            excluded_nonbillable_keys.add(key)
            non_billable_epic_assignments.append(normalize_internal_capacity(assignment))
            continue
        assignments.append(normalize_internal_capacity(assignment))

    # ── Classify ─────────────────────────────────────────────────────
    assignments = apply_residual_bench_percent(assignments)
    bench   = [a for a in assignments if a['client'] == 'Bench' and a['status'] == 'In Progress']
    pending = [a for a in assignments if a['status'] == 'Assigned']
    active  = [a for a in assignments if a['status'] == 'In Progress'
               and a['client'] not in ('', 'Bench')]

    active_clients = sorted(set(
        a['client'] for a in active if a['client'] not in ('Azumo', '')
    ))

    # ── Due-date forecast ─────────────────────────────────────────────
    # Source of truth is Jira Assignment issues in "In Progress". Do not
    # include Assigned/On Hold, do not deduplicate, and do not cap at six
    # months; this mirrors the EazyBI "Next Due Dates" report shape.
    due_rollups = build_due_date_rollups(assignments, today=today)

    return {
        'active':         active,
        'bench':          bench,
        'pending':        pending,
        'active_clients': active_clients,
        'expiring_60d':   due_rollups['expiring_60d'],
        'forecast':       due_rollups['forecast'],
        'forecast_total':  due_rollups['forecast_total'],
        'forecast_source': 'Jira In Progress assignment due dates · Bench excluded',
        'bench_source':    'Jira Bench In Progress assignments',
        'account_coverage': [],
        'account_coverage_source': '',
        'excluded_nonbillable_keys': sorted(excluded_nonbillable_keys),
        'non_billable_epic_assignments': non_billable_epic_assignments,
    }


def snapshot_row_summary(row: dict) -> dict:
    return {
        'key': row.get('key', ''),
        'assignee': row.get('assignee', ''),
        'client': row.get('client', ''),
        'position': row.get('position', ''),
        'status': row.get('status', ''),
        'due': row.get('due', ''),
        'assignment_pct': row.get('assignment_pct', ''),
        'project_manager': row.get('project_manager', ''),
        'epic_status': row.get('epic_status', ''),
        'epic_key': row.get('epic_key', ''),
        'epic_due': row.get('epic_due', ''),
        'max_child_due': row.get('max_child_due', ''),
        'child_key': row.get('child_key', ''),
        'jira_bench_pct': row.get('jira_bench_pct', ''),
        'bench_expected_pct': row.get('bench_expected_pct', ''),
        'bench_consumed_pct': row.get('bench_consumed_pct', ''),
    }


def data_quality_check(check_id: str, label: str, severity: str, rows: list, description: str) -> dict:
    return {
        'id': check_id,
        'label': label,
        'severity': severity,
        'status': severity if rows else 'ok',
        'count': len(rows),
        'description': description,
        'rows': [snapshot_row_summary(row) for row in rows[:75]],
    }


def row_assignment_pct_value(row: dict):
    value = first_non_empty(row.get('assignment_pct'), row.get('pct'), '')
    if value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def row_billing_pct_value(row: dict):
    value = first_non_empty(row.get('billing_pct'), row.get('epic_billing'), '')
    if value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_external_in_progress(row: dict) -> bool:
    return (
        row.get('status') == 'In Progress'
        and bool(row.get('client'))
        and row.get('client') not in ('Bench', 'Azumo')
    )


def external_zero_billing_rows(rows: list) -> list:
    return [
        row for row in rows or []
        if is_external_in_progress(row) and row_billing_pct_value(row) == 0
    ]


def missing_epic_position_rows(rows: list) -> list:
    by_epic = {}
    for row in rows or []:
        if row.get('status') != 'In Progress':
            continue
        if not row.get('epic_key'):
            continue
        if clean_report_value(row.get('epic_position')):
            continue
        key = row.get('epic_key') or row.get('assignee') or row.get('key')
        if key not in by_epic:
            by_epic[key] = {
                **row,
                'key': row.get('epic_key') or row.get('key', ''),
                'due': row.get('epic_due') or row.get('due', ''),
                'position': row.get('epic_position') or '',
            }
    return sorted(by_epic.values(), key=lambda row: clean_report_value(row.get('assignee')))


def build_epic_due_before_child_due_rows(rows: list) -> list:
    by_epic = {}
    for row in rows or []:
        if row.get('status') != 'In Progress':
            continue
        if is_bench_client(row.get('client')):
            continue
        if not row.get('epic_key') or not row.get('epic_due') or not row.get('due'):
            continue
        key = row.get('epic_key')
        current = by_epic.get(key)
        if not current:
            by_epic[key] = {
                'key': key,
                'epic_key': key,
                'assignee': row.get('epic_assignee') or row.get('assignee', ''),
                'client': row.get('client', ''),
                'position': row.get('epic_position', ''),
                'status': row.get('epic_status', ''),
                'due': row.get('epic_due'),
                'epic_due': row.get('epic_due'),
                'max_child_due': row.get('due'),
                'child_key': row.get('key'),
                'project_manager': row.get('project_manager', ''),
            }
            continue
        if str(row.get('due')) > str(current.get('max_child_due') or ''):
            current['max_child_due'] = row.get('due')
            current['child_key'] = row.get('key')
            current['client'] = row.get('client') or current.get('client', '')
            current['project_manager'] = row.get('project_manager') or current.get('project_manager', '')
    return [
        item for item in by_epic.values()
        if str(item.get('epic_due') or '') < str(item.get('max_child_due') or '')
    ]


def build_data_quality(snapshot: dict) -> dict:
    rows = snapshot.get('assignment_rows') or []
    coverage = snapshot.get('account_coverage') or []
    checks = [
        data_quality_check(
            'missing_assignee',
            'Missing assignee',
            'error',
            [row for row in rows if not clean_report_value(row.get('assignee'))],
            'Assignment rows should identify the person or be explicitly investigated.',
        ),
        data_quality_check(
            'missing_epic_position',
            'Position QA — missing Epic Position - Assignee',
            'warning',
            missing_epic_position_rows(rows),
            'Visible Position comes only from the AA parent Epic field "Position - Assignee"; child Assignment positions are audit-only.',
        ),
        data_quality_check(
            'missing_due_date',
            'Missing due date',
            'warning',
            [
                row for row in rows
                if row.get('status') == 'In Progress'
                and not is_bench_client(row.get('client'))
                and not clean_report_value(row.get('due'))
            ],
            'Due dates feed Forecast and the 60-day expiration list. Bench due dates are placeholders and are ignored.',
        ),
        data_quality_check(
            'missing_project_manager',
            'Missing Project Manager',
            'warning',
            [row for row in rows if is_external_in_progress(row) and not clean_report_value(row.get('project_manager'))],
            'External client assignments should have a PM for escalation and Slack reminders.',
        ),
        data_quality_check(
            'zero_assignment_pct',
            'In-progress rows with 0% assignment',
            'warning',
            [
                row for row in rows
                if row.get('status') == 'In Progress'
                and row.get('client')
                and not is_bench_client(row.get('client'))
                and row_assignment_pct_value(row) == 0
            ],
            'Assignment (%) should be populated for active capacity calculations.',
        ),
        data_quality_check(
            'external_zero_billing',
            'External assignments with Billing 0',
            'warning',
            external_zero_billing_rows(rows),
            'List people with Billing 0 while assigned to a real client. Bench and Azumo are excluded.',
        ),
        data_quality_check(
            'account_coverage_gaps',
            'Account Coverage gaps',
            'warning',
            [
                row for row in coverage
                if row.get('complete') is False or row.get('missing')
            ],
            'PSA account coverage should include PM, CSM, and TL where applicable.',
        ),
        data_quality_check(
            'epic_due_before_child_due',
            'Epic due date before child assignment due date',
            'warning',
            build_epic_due_before_child_due_rows(rows),
            'The Epic due date should be equal to or later than the furthest In Progress child Assignment due date.',
        ),
        data_quality_check(
            'bench_residual_mismatch',
            'Bench assignment percent does not match residual capacity',
            'error',
            [
                row for row in rows
                if is_bench_client(row.get('client'))
                and row.get('status') == 'In Progress'
                and row.get('bench_pct_mismatch')
            ],
            'Active Bench should equal 100% minus all active non-Bench assignments for the same person, including Azumo/internal work. Correct Jira if the Bench issue percent differs.',
        ),
    ]
    issue_count = sum(check['count'] for check in checks)
    return {
        'generated_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'status': 'needs_review' if issue_count else 'ok',
        'issue_count': issue_count,
        'checks': checks,
        'daily_review': [
            'Sync Jira + EazyBI before reviewing the board.',
            'Review Position QA: visible Position must come from AA Epic "Position - Assignee".',
            'Review external assignments with Billing 0, excluding Bench and Azumo.',
            'Review Bench residual capacity: active Bench must equal 100% minus all active non-Bench assignments for the person.',
            'Review assignments whose last day has passed, plus upcoming due dates for planning.',
            'Review Account Coverage gaps so PM, CSM, and TL stay current.',
            'Confirm EazyBI Bench by Month and Utilization Billing Rate imports are fresh.',
        ],
    }


def build_data_lineage(snapshot: dict) -> dict:
    return {
        'generated_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'sources': [
            {
                'name': 'Jira AA Assignments',
                'feeds': ['assignment_rows', 'bench_list', 'forecast', 'expiring_60d'],
                'rule': 'Assignment issues in project AA; Forecast uses In Progress assignment due dates, excluding Bench because its due date is a required placeholder. Jira due date wins over stale snapshot/CSV values.',
            },
            {
                'name': 'Jira AA parent Epic Position - Assignee',
                'feeds': ['assignment_rows.position', 'data_quality.missing_epic_position'],
                'rule': 'Visible Position is read only from the AA parent Epic Position - Assignee field; child Assignment position is audit-only.',
            },
            {
                'name': 'EazyBI Utilization Billing Rate',
                'feeds': ['metrics.utilization_billing', 'utilization_billing_rate'],
                'rule': 'Authoritative percentage from EazyBI. Procedure: billed / utilized billable capacity ÷ total headcount. Hourly rates are not used; Harvest rates remain read-only and are not imported yet.',
            },
            {
                'name': 'EazyBI headcount metrics',
                'feeds': ['metrics.headcount_billable', 'metrics.headcount_nonbillable', 'metrics.unassigned_capacity'],
                'rule': 'Headcount Billable, Non-Billable, and unassigned capacity are taken from EazyBI, not recalculated from Jira child issues.',
            },
            {
                'name': 'Jira PSA Account Coverage',
                'feeds': ['account_coverage'],
                'rule': 'PSA epics provide PM Assigned, CSM Assigned, and TL Assigned for client coverage checks.',
            },
        ],
    }


def build_snapshot(parsed: dict, overrides: dict = None) -> dict:
    """Build a snapshot dict to append to history."""
    today   = date.today()
    active  = parsed['active']
    bench   = parsed['bench']
    pending = parsed['pending']
    clients = parsed['active_clients']

    overrides = overrides or {}
    metrics = {
        'utilization_assignment': overrides.get('utilization_assignment', 0),
        'utilization_billing':    overrides.get('utilization_billing', 0),
        'headcount_billable':     overrides.get('headcount_billable', 0),
        'headcount_nonbillable':  overrides.get('headcount_nonbillable', 0),
        'bench':                  len(bench) if bench else overrides.get('bench', 0),
        'active_clients':         len(clients),
        'pending_assignments':    len(pending),
        'unassigned_capacity':    overrides.get('unassigned_capacity', 0),
    }

    snap = {
        'date':         today.isoformat(),
        'label':        today.strftime('%b %Y'),
        'metrics':      metrics,
        'expiring_60d': parsed['expiring_60d'],
        'active_clients': parsed['active_clients'],
        'forecast':     parsed['forecast'],
        'forecast_total': parsed.get(
            'forecast_total',
            sum(len(items) for items in (parsed.get('forecast') or {}).values())
        ),
        'forecast_source': parsed.get('forecast_source', 'Jira In Progress assignment due dates · Bench excluded'),
        'bench_source': parsed.get('bench_source', 'Jira Bench In Progress assignments'),
        'account_coverage': parsed.get('account_coverage', []),
        'account_coverage_source': parsed.get('account_coverage_source', 'Jira PSA Epic Account Coverage'),
        'non_billable_epic_assignments': [
            assignment_row_from_assignment(a)
            for a in parsed.get('non_billable_epic_assignments', [])
        ],
        'bench_by_month': parsed.get('bench_by_month', {}),
        'utilization_billing_rate': normalize_utilization_billing_rate_report(parsed.get('utilization_billing_rate', {})),
        'assignment_rows': [
            assignment_row_from_assignment(a)
            for a in (parsed.get('active', []) + parsed.get('bench', []) + parsed.get('pending', []))
        ],
        'bench_list':   parsed['bench'] if parsed['bench'] else overrides.get('bench_list', []),
        'pending_list': [
            {'key': a['key'], 'assignee': a['assignee'], 'client': a['client'],
             'position': a['position'], 'start': a['start']}
            for a in parsed['pending']
        ],
    }
    snap['data_quality'] = build_data_quality(snap)
    snap['data_lineage'] = build_data_lineage(snap)
    return snap


def load_or_create_data() -> dict:
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'cloudId': '226f839b-1eed-48eb-993a-618d9bd89189',
        'project': 'AA',
        'last_refresh': '',
        'last_refresh_at': '',
        'history_start_date': date.today().isoformat(),
        'snapshots': []
    }


def zero_historical_percentages(data: dict) -> dict:
    """Keep percentage history at 0 before the configured start date."""
    start_date = data.get('history_start_date') or date.today().isoformat()
    data['history_start_date'] = start_date
    for snapshot in data.get('snapshots', []):
        if snapshot.get('date', '') < start_date:
            metrics = snapshot.setdefault('metrics', {})
            for field in HISTORY_PERCENT_FIELDS:
                metrics[field] = 0
    return data


def update_data_file(snapshot: dict, reset_history: bool = False) -> dict:
    data = load_or_create_data()
    if reset_history:
        data['snapshots'] = []
        data['history_start_date'] = snapshot['date']

    data['last_refresh'] = date.today().isoformat()
    data['last_refresh_at'] = datetime.now().isoformat(timespec='seconds')
    data.setdefault('history_start_date', date.today().isoformat())

    # Replace today's snapshot if it already exists, else append
    existing = next((i for i, s in enumerate(data['snapshots'])
                     if s['date'] == snapshot['date']), None)
    if existing is not None:
        data['snapshots'][existing] = snapshot
    else:
        data['snapshots'].append(snapshot)

    zero_historical_percentages(data)

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✓ pmo-data.json updated — {len(data['snapshots'])} snapshots")
    return data


def inject_into_dashboard(data: dict):
    """Replace the DATA_PLACEHOLDER in dashboard HTML files with fresh data."""
    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    placeholder = '/*%%PMO_DATA%%*/'

    for dash_file in DASH_FILES:
        if not os.path.exists(dash_file):
            print(f"⚠ Dashboard not found at {dash_file} — skipping HTML injection")
            continue

        with open(dash_file, 'r', encoding='utf-8') as f:
            html = f.read()

        if placeholder not in html:
            print(f"⚠ DATA placeholder not found in {os.path.basename(dash_file)} — skipping injection")
            continue

        # Replace the current data object
        import re
        html = re.sub(
            r'/\*%%PMO_DATA%%\*/.*?/\*%%PMO_DATA_END%%\*/',
            f'{placeholder}{json_str}/*%%PMO_DATA_END%%*/',
            html,
            flags=re.DOTALL
        )
        with open(dash_file, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"✓ {os.path.basename(dash_file)} updated with latest data")


def save_to_neon(data: dict, env_file: str = None, store_lib: str = DEFAULT_NEON_STORE_LIB):
    """Persist dashboard snapshots to Neon using the existing Node data-store layer."""
    env = env_with_database_url(env_file)
    if not env.get('DATABASE_URL'):
        raise RuntimeError('DATABASE_URL not found in environment or known .env files')
    if not os.path.exists(store_lib):
        raise RuntimeError(f'Neon data-store helper not found: {store_lib}')

    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as data_tmp:
        json.dump(data, data_tmp, ensure_ascii=False)
        data_path = data_tmp.name

    node_code = r"""
const fs = require('node:fs');
const dataPath = process.argv[1];
const storeLib = process.argv[2];
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const { importDashboardData } = require(storeLib);
importDashboardData(data)
  .then((saved) => {
    console.log(`✓ Neon updated — ${saved.snapshots.length} snapshots`);
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
"""
    try:
        result = subprocess.run(
            ['node', '-e', node_code, data_path, store_lib],
            env=env,
            text=True,
            capture_output=True,
            timeout=90,
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or 'Node Neon save failed').strip())
        print(result.stdout.strip())
    finally:
        try:
            os.unlink(data_path)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description='PMO data refresh script')
    parser.add_argument('--file', help='Path to Jira raw JSON file (default: stdin)')
    parser.add_argument('--util-assignment', type=float, help='Utilization rate (assignment) from EazyBI')
    parser.add_argument('--util-billing',    type=float, help='Utilization rate (billing) from EazyBI')
    parser.add_argument('--bench',           type=int,   help='Bench count override')
    parser.add_argument('--unassigned',      type=float, help='Unassigned capacity %% from EazyBI')
    parser.add_argument('--no-eazybi', action='store_true',
                        help='Do not fetch EazyBI Billing Dashboard metrics automatically')
    parser.add_argument('--eazybi-env',
                        help='Path to .env file with EAZYBI_URL, EAZYBI_EMAIL, and EAZYBI_TOKEN')
    parser.add_argument('--eazybi-account-id', default=DEFAULT_EAZYBI_ACCOUNT_ID,
                        help='EazyBI account ID for Billing Dashboard export')
    parser.add_argument('--eazybi-report-id', default=DEFAULT_EAZYBI_REPORT_ID,
                        help='EazyBI report ID for Billing Dashboard export')
    parser.add_argument('--no-neon', action='store_true',
                        help='Do not save refreshed dashboard snapshots to Neon')
    parser.add_argument('--neon-env',
                        help='Path to .env file with DATABASE_URL')
    parser.add_argument('--neon-store-lib', default=DEFAULT_NEON_STORE_LIB,
                        help='Path to the Node data-store.js helper used for Neon writes')
    parser.add_argument('--next-due-dates-csv',
                        help='Optional EazyBI "Next Due Dates" CSV export used to enrich/validate forecast rows')
    parser.add_argument('--bench-report-csv',
                        help='Optional EazyBI "Bench" CSV export used as filtered Bench report source')
    parser.add_argument('--bench-by-month-csv',
                        help='Optional EazyBI "Bench by Month" CSV export used for the Bench by Month report module')
    parser.add_argument('--utilization-billing-rate-csv',
                        help='Optional EazyBI "Utilization Billing Rate" CSV export used for the utilization report module')
    parser.add_argument('--jira-env',
                        help='Path to .env file with JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN')
    parser.add_argument('--account-coverage-jql', default=DEFAULT_ACCOUNT_COVERAGE_JQL,
                        help='JQL used to fetch PSA Account Coverage PM/CSM/TL assignments')
    parser.add_argument('--no-account-coverage', action='store_true',
                        help='Do not fetch Jira PSA Account Coverage fields')
    parser.add_argument('--reset-history', action='store_true',
                        help='Discard previous local snapshots and start history with this refresh')
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

    overrides = {}
    eazybi_metrics = {}
    assignment_metrics = {}
    bench_metrics = {}
    if not args.no_eazybi:
        try:
            eazybi_metrics = fetch_eazybi_billing_metrics(
                env_file=args.eazybi_env,
                account_id=args.eazybi_account_id,
                report_id=args.eazybi_report_id,
            )
            overrides.update({
                k: v for k, v in eazybi_metrics.items()
                if not k.startswith('_')
                and v not in (None, '')
            })
            print(
                "✓ EazyBI Billing Dashboard metrics extracted"
                f" — Assignment {overrides.get('utilization_assignment', 0)}%,"
                f" Billing {overrides.get('utilization_billing', 0)}%"
            )
        except Exception as e:
            print(f"⚠ EazyBI metrics not extracted: {e}")

        try:
            assignment_metrics = fetch_eazybi_assignment_metrics(env_file=args.eazybi_env)
            print(f"✓ EazyBI assignment detail extracted — {len(assignment_metrics)} Jira rows")
        except Exception as e:
            print(f"⚠ EazyBI assignment detail not extracted: {e}")

        try:
            bench_metrics = fetch_eazybi_bench_metrics(env_file=args.eazybi_env)
            print(f"✓ EazyBI bench availability extracted — {len(bench_metrics)} assignees")
        except Exception as e:
            print(f"⚠ EazyBI bench availability not extracted: {e}")

    # Explicit CLI values always win over auto-extracted EazyBI values.
    if args.util_assignment is not None:
        overrides['utilization_assignment'] = args.util_assignment
    if args.util_billing is not None:
        overrides['utilization_billing'] = args.util_billing
    if args.bench is not None:
        overrides['bench'] = args.bench
    if args.unassigned is not None:
        overrides['unassigned_capacity'] = args.unassigned

    parsed   = parse_jira(issues, assignment_metrics=assignment_metrics, bench_metrics=bench_metrics)
    if not args.no_account_coverage:
        try:
            coverage_issues = fetch_jira_issues(
                args.account_coverage_jql,
                ACCOUNT_COVERAGE_FIELDS,
                env_file=args.jira_env,
            )
            parsed['account_coverage'] = parse_account_coverage_issues(coverage_issues)
            parsed['account_coverage_source'] = 'Jira PSA Epic Account Coverage'
            missing_count = sum(1 for row in parsed['account_coverage'] if row.get('missing'))
            print(f"✓ Account Coverage loaded — {len(parsed['account_coverage'])} clients, {missing_count} incomplete")
        except Exception as e:
            print(f"⚠ Account Coverage not loaded: {e}")

    if args.next_due_dates_csv:
        try:
            next_due_rows = load_next_due_dates_csv(args.next_due_dates_csv)
            next_due_rows = filter_non_billable_report_rows(
                next_due_rows,
                parsed.get('excluded_nonbillable_keys', []),
            )
            parsed = apply_next_due_date_enrichment(parsed, next_due_rows)
            due_rollups = build_due_date_rollups(
                parsed.get('active', []) + parsed.get('bench', []) + parsed.get('pending', [])
            )
            parsed['expiring_60d'] = due_rollups['expiring_60d']
            parsed['forecast'] = due_rollups['forecast']
            parsed['forecast_total'] = due_rollups['forecast_total']
            parsed['forecast_source'] = 'Jira In Progress assignment due dates · Bench excluded · enriched with EazyBI Next Due Dates CSV'
            excluded = len(parsed.get('excluded_nonbillable_keys', []))
            suffix = f", {excluded} Non-Billable Jira rows excluded" if excluded else ""
            print(f"✓ Next Due Dates forecast loaded — {due_rollups['forecast_total']} In Progress rows{suffix}")
        except Exception as e:
            print(f"⚠ Next Due Dates CSV not loaded: {e}")
    if args.bench_report_csv:
        try:
            bench_rows = load_bench_report_csv(args.bench_report_csv)
            parsed = apply_bench_report(parsed, bench_rows)
            print(f"✓ Bench report loaded — {len(parsed.get('bench', []))} Active/New Hires rows")
        except Exception as e:
            print(f"⚠ Bench report CSV not loaded: {e}")
    if args.bench_by_month_csv:
        try:
            parsed['bench_by_month'] = load_bench_by_month_csv(args.bench_by_month_csv)
            print(
                "✓ Bench by Month report loaded"
                f" — {len(parsed['bench_by_month'].get('rows', []))} assignees,"
                f" {len(parsed['bench_by_month'].get('months', []))} months"
            )
        except Exception as e:
            print(f"⚠ Bench by Month CSV not loaded: {e}")
    if args.utilization_billing_rate_csv:
        try:
            parsed['utilization_billing_rate'] = load_utilization_billing_rate_csv(args.utilization_billing_rate_csv)
            print(
                "✓ Utilization Billing Rate report loaded"
                f" — {len(parsed['utilization_billing_rate'].get('months', []))} months,"
                f" headcount {parsed['utilization_billing_rate'].get('total_headcount', 0)}"
            )
        except Exception as e:
            print(f"⚠ Utilization Billing Rate CSV not loaded: {e}")
    snapshot = build_snapshot(parsed, overrides)
    data     = update_data_file(snapshot, reset_history=args.reset_history)
    inject_into_dashboard(data)
    if not args.no_neon:
        try:
            save_to_neon(data, env_file=args.neon_env, store_lib=args.neon_store_lib)
        except Exception as e:
            print(f"⚠ Neon save skipped: {e}")

    # Print summary
    s = snapshot
    print(f"\n📊 Snapshot summary — {s['label']}")
    print(f"   Active clients:   {s['metrics']['active_clients']}")
    print(f"   Assignment util:  {s['metrics']['utilization_assignment']}%")
    print(f"   Billing util:     {s['metrics']['utilization_billing']}%")
    print(f"   Billable HC:      {s['metrics']['headcount_billable']}")
    print(f"   Non-billable HC:  {s['metrics']['headcount_nonbillable']}")
    print(f"   Unassigned cap:   {s['metrics']['unassigned_capacity']}%")
    print(f"   Bench:            {s['metrics']['bench']}")
    print(f"   Pending:          {s['metrics']['pending_assignments']}")
    print(f"   Expiring 60d:     {len(s['expiring_60d'])}")
    print(f"   Forecast months:  {list(s['forecast'].keys())}")


if __name__ == '__main__':
    main()
