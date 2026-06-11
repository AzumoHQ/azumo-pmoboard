const { changePassword } = require('../../lib/auth');

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

module.exports = async function changePasswordHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const user = await changePassword(req, body.currentPassword, body.newPassword);
    res.status(200).json({ ok: true, user });
  } catch (error) {
    const status = /signed in|incorrect/i.test(error.message) ? 401 : 400;
    res.status(status).json({ error: error.message });
  }
};
