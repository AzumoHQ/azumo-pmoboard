const { clearSessionCookie, logout } = require('../../lib/auth');

module.exports = async function logoutHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await logout(req);
  } finally {
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(200).json({ ok: true });
  }
};
