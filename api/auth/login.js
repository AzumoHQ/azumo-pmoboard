const { login, sessionCookie } = require('../../lib/auth');

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

module.exports = async function loginHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const result = await login(body.email, body.password);
    res.setHeader('Set-Cookie', sessionCookie(result.token));
    res.status(200).json({ user: result.user });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};
