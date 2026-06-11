const { getSessionUser } = require('../lib/auth');
const { reportConfig } = require('../lib/eazybi-client');

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function embedUrlFor(reportKey) {
  const config = reportConfig(reportKey);
  const publicBase = normalizeBaseUrl(process.env.EAZYBI_PUBLIC_URL || process.env.EAZYBI_URL).replace(/\/eazy$/, '');
  if (!publicBase || !config.account_id || !config.report_id || !config.embed_token) {
    return '';
  }
  return `${publicBase}/accounts/${encodeURIComponent(config.account_id)}/embed/report/${encodeURIComponent(config.report_id)}?embed_token=${encodeURIComponent(config.embed_token)}`;
}

module.exports = async function eazybiEmbedHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const user = await getSessionUser(req);
    if (!user || user.active === false) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }

    const reportKey = String(req.query.report || '').trim();
    const url = embedUrlFor(reportKey);
    if (!url) {
      res.status(404).json({ error: 'Embedded report is not configured.' });
      return;
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const html = await response.text();
    if (!response.ok) {
      res.status(502).json({ error: `EazyBI embed error ${response.status}` });
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
