const { changePassword, clearSessionCookie, getSessionUser, login, logout, sessionCookie } = require('../lib/auth');

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

function requestAction(req) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  return String(url.searchParams.get('action') || '').trim().toLowerCase();
}

module.exports = async function authHandler(req, res) {
  const action = requestAction(req);

  if (req.method === 'GET' && (!action || action === 'me')) {
    try {
      const user = await getSessionUser(req);
      res.status(200).json({ user });
    } catch (error) {
      res.status(200).json({ user: null });
    }
    return;
  }

  if (req.method === 'POST' && action === 'login') {
    try {
      const body = await readJson(req);
      const result = await login(body.email, body.password);
      res.setHeader('Set-Cookie', sessionCookie(result.token));
      res.status(200).json({ user: result.user });
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
    return;
  }

  if ((req.method === 'POST' && action === 'logout') || (req.method === 'DELETE' && (!action || action === 'logout'))) {
    try {
      await logout(req);
    } finally {
      res.setHeader('Set-Cookie', clearSessionCookie());
      res.status(200).json({ ok: true });
    }
    return;
  }

  if ((req.method === 'POST' && action === 'change-password') || (req.method === 'PATCH' && (!action || action === 'change-password'))) {
    try {
      const body = await readJson(req);
      const user = await changePassword(req, body.currentPassword, body.newPassword);
      res.status(200).json({ ok: true, user });
    } catch (error) {
      const status = /signed in|incorrect/i.test(error.message) ? 401 : 400;
      res.status(status).json({ error: error.message });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
};
