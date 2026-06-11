const { getSessionUser } = require('../../lib/auth');

module.exports = async function meHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await getSessionUser(req);
    res.status(200).json({ user });
  } catch (error) {
    res.status(200).json({ user: null });
  }
};
