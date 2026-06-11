const { canAdmin, getSessionUser, listUsers, upsertUser } = require('../lib/auth');

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

module.exports = async function usersHandler(req, res) {
  try {
    const currentUser = await getSessionUser(req);
    if (!canAdmin(currentUser)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (req.method === 'GET') {
      res.status(200).json({ users: await listUsers() });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const user = await upsertUser(body);
      res.status(200).json({ user, users: await listUsers() });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
