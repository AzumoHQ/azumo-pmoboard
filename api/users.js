const {
  createManagedUser,
  getSessionContext,
  listUsers,
  updateManagedUser,
  VALID_USER_ROLES
} = require('../lib/auth');

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
  return Boolean(user && user.active !== false && user.role === 'PMO');
}

function jsonError(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = async function usersHandler(req, res) {
  try {
    const { realUser: currentUser } = await getSessionContext(req);
    if (!isPmo(currentUser)) {
      jsonError(res, 403, 'Administrator access required');
      return;
    }

    if (req.method === 'GET') {
      res.status(200).json({
        users: await listUsers(),
        roles: VALID_USER_ROLES
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const user = await createManagedUser({
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        role: body.role,
        is_active: body.is_active !== false,
        azumo_id: body.azumo_id ?? null
      });
      res.status(201).json({ user, users: await listUsers() });
      return;
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const targetEmail = String(body.email || '').trim().toLowerCase();
      if (!targetEmail) {
        jsonError(res, 400, 'Email is required');
        return;
      }
      if (targetEmail === String(currentUser.email || '').trim().toLowerCase() && body.role !== undefined) {
        jsonError(res, 403, 'You cannot change your own role.');
        return;
      }

      const user = await updateManagedUser({
        email: targetEmail,
        role: body.role,
        is_active: body.is_active
      });
      res.status(200).json({ user, users: await listUsers() });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    jsonError(res, 405, 'Method not allowed');
  } catch (error) {
    const message = error?.message || 'Unexpected error';
    if (/already exists/i.test(message)) {
      jsonError(res, 409, message);
      return;
    }
    if (/not found/i.test(message)) {
      jsonError(res, 404, message);
      return;
    }
    if (/required|role must|nothing to update/i.test(message)) {
      jsonError(res, 400, message);
      return;
    }
    jsonError(res, 500, message);
  }
};
