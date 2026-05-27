const { getDashboardData, saveSnapshot } = require('../lib/data-store');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  const token = process.env.PMO_REFRESH_TOKEN;
  if (!token) return true;
  return req.headers['x-pmo-token'] === token || req.headers.authorization === `Bearer ${token}`;
}

module.exports = async function snapshotsHandler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await getDashboardData();
      res.status(200).json(data.snapshots || []);
      return;
    }

    if (req.method === 'POST') {
      if (!isAuthorized(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const body = await readJson(req);
      const data = await saveSnapshot(body.snapshot || body, body.meta || {});
      res.status(200).json(data);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
