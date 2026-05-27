const CF_START_DATE = 'customfield_10800';
const CF_CLIENT = 'customfield_11391';
const CF_POSITION = 'customfield_11525';
const CF_RATE = 'customfield_11528';
const CF_PCT = 'customfield_12021';

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.name || '';
}

function parseJiraIssues(rawIssues) {
  const today = new Date();
  const todayIso = isoDate(today);
  const cutoff60 = addDays(today, 60);
  const cutoff180 = addDays(today, 180);

  const assignments = rawIssues
    .map((issue) => {
      const fields = issue.fields || {};
      const assignee = fields.assignee || {};

      return {
        key: issue.key,
        assignee: assignee.displayName || '',
        email: assignee.emailAddress || '',
        status: fieldValue(fields.status),
        client: fieldValue(fields[CF_CLIENT]),
        position: fieldValue(fields[CF_POSITION]),
        start: fields[CF_START_DATE] || '',
        due: fields.duedate || '',
        rate: Number(fields[CF_RATE] || 0),
        pct: Number(fields[CF_PCT] || 0)
      };
    })
    .filter((assignment) => !(assignment.position === 'CSM' && assignment.rate === 0));

  const bench = assignments.filter((assignment) => assignment.client === 'Bench' || assignment.status === 'On Hold');
  const pending = assignments.filter((assignment) => assignment.status === 'Assigned');
  const active = assignments.filter(
    (assignment) => assignment.status === 'In Progress' && assignment.client && assignment.client !== 'Bench'
  );

  const activeClients = [...new Set(active.map((assignment) => assignment.client).filter((client) => client !== 'Azumo'))].sort();

  const expiringSeen = new Set();
  const expiring60d = active
    .slice()
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
    .flatMap((assignment) => {
      const dueDate = parseDate(assignment.due);
      if (!dueDate || dueDate < today || dueDate > cutoff60) return [];

      const key = `${assignment.assignee}|${assignment.client}`;
      if (expiringSeen.has(key)) return [];
      expiringSeen.add(key);

      return [{
        assignee: assignment.assignee,
        client: assignment.client,
        position: assignment.position,
        due: assignment.due
      }];
    });

  const forecastSeen = new Set();
  const forecast = {};
  active.forEach((assignment) => {
    const dueDate = parseDate(assignment.due);
    if (!dueDate || dueDate < today || dueDate > cutoff180) return;

    const key = `${assignment.assignee}|${assignment.client}`;
    if (forecastSeen.has(key)) return;
    forecastSeen.add(key);

    const month = assignment.due.slice(0, 7);
    forecast[month] = forecast[month] || [];
    forecast[month].push({
      assignee: assignment.assignee,
      client: assignment.client,
      position: assignment.position
    });
  });

  return {
    todayIso,
    active,
    bench,
    pending,
    active_clients: activeClients,
    expiring_60d: expiring60d,
    forecast: Object.fromEntries(Object.entries(forecast).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function buildSnapshot(parsed, overrides = {}) {
  const active = parsed.active || [];
  const billablePeople = new Set(
    active
      .filter((assignment) => assignment.client !== 'Azumo' && assignment.rate > 0)
      .map((assignment) => assignment.assignee)
  );
  const nonbillablePeople = new Set(
    active
      .filter((assignment) => assignment.client === 'Azumo' || !assignment.rate)
      .map((assignment) => assignment.assignee)
  );

  const date = parsed.todayIso || isoDate(new Date());
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  return {
    date,
    label,
    metrics: {
      utilization_assignment: Number(overrides.utilization_assignment || 0),
      utilization_billing: Number(overrides.utilization_billing || 0),
      headcount_billable: billablePeople.size,
      headcount_nonbillable: nonbillablePeople.size,
      bench: (parsed.bench || []).length || Number(overrides.bench || 0),
      active_clients: (parsed.active_clients || []).length,
      pending_assignments: (parsed.pending || []).length,
      unassigned_capacity: Number(overrides.unassigned_capacity || 0)
    },
    expiring_60d: parsed.expiring_60d || [],
    active_clients: parsed.active_clients || [],
    forecast: parsed.forecast || {},
    bench_list: overrides.bench_list || parsed.bench || [],
    pending_list: (parsed.pending || []).map((assignment) => ({
      key: assignment.key,
      assignee: assignment.assignee,
      client: assignment.client,
      position: assignment.position,
      start: assignment.start
    }))
  };
}

function issuesFromJiraResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.issues)) return payload.issues;
  return [];
}

module.exports = {
  buildSnapshot,
  issuesFromJiraResponse,
  parseJiraIssues
};
