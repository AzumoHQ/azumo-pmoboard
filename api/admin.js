// /api/admin — backs the tabbed Admin page (/admin): Accounts, Users, Roles, Audit log.
// PMO/Administrator only. Local edits (roles, role overrides) always save to Neon.
// Anything that changes Jira goes through updateIssueFields(), which refuses to run unless
// JIRA_WRITEBACK_ENABLED=true is set in Vercel — so Jira is never touched by accident.
const { getSessionContext, listUsers } = require('../lib/auth');
const {
  getPeopleEpics,
  findJiraAccountIdByEmail,
  updateIssueFields,
  isJiraWritebackEnabled,
  resolveEpicPositionFieldId
} = require('../lib/jira-client');
const store = require('../lib/admin-store');

// PSA Epic user-picker fields that hold each account's responsables (see lib/pmo-transform.js).
const COVERAGE_FIELDS = {
  pm: { field: 'customfield_12678', label: 'PM' },
  csm: { field: 'customfield_11425', label: 'CSM' },
  tl: { field: 'customfield_11622', label: 'TL' }
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function isPmo(user) {
  return Boolean(user && user.active !== false && String(user.role || '').toUpperCase() === 'PMO');
}

async function overview() {
  const [roles, people, coverage, audit, users] = await Promise.all([
    store.listRoles(),
    store.listPeople(),
    store.getLatestAccountCoverage(),
    store.listAudit(150),
    listUsers()
  ]);
  return {
    writeback_enabled: isJiraWritebackEnabled(),
    roles,
    people,
    users,
    accounts: coverage.accounts,
    accounts_snapshot_date: coverage.snapshot_date,
    audit
  };
}

async function syncPeople(actor) {
  const [{ issues, positionFieldId }, users] = await Promise.all([getPeopleEpics(), listUsers()]);
  const result = await store.syncPeopleFromJira({ issues, positionFieldId, users });
  await store.addAudit({
    actor_email: actor.email,
    entity: 'people',
    field: 'sync',
    new_value: `${result.people} people · ${result.positions} positions · ${result.roles_created} new roles`,
    jira_status: 'read'
  });
  return result;
}

async function setPersonRole(actor, body) {
  let person = null;
  if (body.epic_key) person = await store.getPerson(body.epic_key);
  if (!person && body.email) person = await store.findPersonByEmail(body.email);
  if (!person && body.email) person = await store.ensureManualPerson({ email: body.email, name: body.name });
  if (!person) throw new Error('Person not found.');

  const roles = await store.listRoles();
  const role = body.role_id ? roles.find((r) => Number(r.id) === Number(body.role_id)) : null;
  if (body.role_id && !role) throw new Error('Role not found.');
  const oldValue = person.role_id
    ? (roles.find((r) => Number(r.id) === Number(person.role_id))?.name || '')
    : (person.jira_position || '');

  await store.setPersonRole(person.jira_epic_key, role ? role.id : null);

  // Write the Position back to the person's AA Epic only when asked, switched on, and the
  // person really has an Epic (manual:* rows are local-only).
  let jiraStatus = 'local';
  let detail = '';
  const hasEpic = !String(person.jira_epic_key).startsWith('manual:');
  if (body.write_jira && role && hasEpic) {
    if (!isJiraWritebackEnabled()) {
      jiraStatus = 'skipped';
      detail = 'Write-back disabled (JIRA_WRITEBACK_ENABLED)';
    } else {
      try {
        const fieldId = await resolveEpicPositionFieldId();
        const value = person.position_field_kind === 'option' ? { value: role.name } : role.name;
        await updateIssueFields(person.jira_epic_key, { [fieldId]: value });
        await store.setPersonJiraPosition(person.jira_epic_key, role.name);
        jiraStatus = 'written';
      } catch (error) {
        jiraStatus = 'failed';
        detail = error.message.slice(0, 500);
      }
    }
  }

  await store.addAudit({
    actor_email: actor.email,
    entity: 'person',
    entity_key: person.jira_epic_key,
    field: 'company_role',
    old_value: oldValue,
    new_value: role ? role.name : '(back to Jira Position)',
    jira_status: jiraStatus,
    detail: [person.name, detail].filter(Boolean).join(' — ')
  });
  return { jira_status: jiraStatus, detail };
}

async function resolveAccountId(email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  const person = await store.findPersonByEmail(target);
  if (person?.jira_account_id) return person.jira_account_id;
  const accountId = await findJiraAccountIdByEmail(target);
  if (!accountId) throw new Error(`No Jira user found for ${target}.`);
  if (person) await store.setPersonAccountId(person.jira_epic_key, accountId);
  return accountId;
}

async function updateAccount(actor, body) {
  const key = String(body.key || '').trim();
  if (!key) throw new Error('Account key is required.');
  if (!isJiraWritebackEnabled()) {
    const error = new Error('Jira write-back is off. Ask for JIRA_WRITEBACK_ENABLED=true in Vercel before editing account responsables.');
    error.status = 409;
    throw error;
  }
  const { accounts } = await store.getLatestAccountCoverage();
  const current = accounts.find((row) => row.key === key);
  if (!current) throw new Error(`Account ${key} not found in the latest snapshot.`);

  const people = await store.listPeople();
  const users = await listUsers();
  const nameFor = (email) => {
    const target = String(email || '').toLowerCase();
    return people.find((p) => String(p.email || '').toLowerCase() === target)?.name
      || users.find((u) => String(u.email || '').toLowerCase() === target)?.name
      || target;
  };

  const fields = {};
  const patch = {};
  const changes = [];
  for (const [slot, meta] of Object.entries(COVERAGE_FIELDS)) {
    if (body[`${slot}_email`] === undefined) continue;
    const nextEmail = String(body[`${slot}_email`] || '').trim().toLowerCase();
    const prevEmail = String(current[`${slot}_assigned_email`] || '').trim().toLowerCase();
    if (nextEmail === prevEmail) continue;
    fields[meta.field] = nextEmail ? { accountId: await resolveAccountId(nextEmail) } : null;
    patch[`${slot}_assigned`] = nextEmail ? nameFor(nextEmail) : '';
    patch[`${slot}_assigned_email`] = nextEmail;
    changes.push({ field: meta.label, old_value: current[`${slot}_assigned`] || '', new_value: patch[`${slot}_assigned`] || '(empty)' });
  }
  if (!changes.length) return { changed: 0, account: current };

  let jiraStatus = 'written';
  let detail = '';
  try {
    await updateIssueFields(key, fields);
  } catch (error) {
    jiraStatus = 'failed';
    detail = error.message.slice(0, 500);
  }

  for (const change of changes) {
    await store.addAudit({
      actor_email: actor.email,
      entity: 'account',
      entity_key: key,
      field: change.field,
      old_value: change.old_value,
      new_value: change.new_value,
      jira_status: jiraStatus,
      detail: [current.client, detail].filter(Boolean).join(' — ')
    });
  }
  if (jiraStatus === 'failed') throw new Error(`Jira rejected the change: ${detail}`);

  const account = await store.patchLatestAccountCoverageRow(key, patch);
  return { changed: changes.length, account };
}

module.exports = async function adminHandler(req, res) {
  try {
    const { realUser } = await getSessionContext(req);
    if (!isPmo(realUser)) {
      res.status(403).json({ error: 'Administrator access required' });
      return;
    }
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    const action = url.searchParams.get('action') || 'overview';

    if (req.method === 'GET') {
      if (action === 'roles') {
        res.status(200).json({ roles: await store.listRoles() });
        return;
      }
      res.status(200).json(await overview());
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = await readJson(req);
    if (action === 'sync-people') {
      const result = await syncPeople(realUser);
      res.status(200).json({ result, ...(await overview()) });
      return;
    }
    if (action === 'role-save') {
      const role = await store.upsertRole(body);
      await store.addAudit({ actor_email: realUser.email, entity: 'role', entity_key: String(role.id), field: 'save', new_value: `${role.name}${role.coverage_slot ? ` (${role.coverage_slot})` : ''}`, jira_status: 'local' });
      res.status(200).json({ role, ...(await overview()) });
      return;
    }
    if (action === 'role-delete') {
      await store.deleteRole(body.id);
      await store.addAudit({ actor_email: realUser.email, entity: 'role', entity_key: String(body.id), field: 'delete', old_value: body.name || '', jira_status: 'local' });
      res.status(200).json(await overview());
      return;
    }
    if (action === 'person-role') {
      const result = await setPersonRole(realUser, body);
      res.status(200).json({ result, ...(await overview()) });
      return;
    }
    if (action === 'account-update') {
      const result = await updateAccount(realUser, body);
      res.status(200).json({ result, ...(await overview()) });
      return;
    }
    res.status(400).json({ error: `Unknown action "${action}"` });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unexpected error' });
  }
};
