// cron-harvest-digest.js
// Arma el mensaje de Harvest incompletos y lo manda a Slack.
//
// Modo preview (default): va al webhook privado de PMO_DIGEST_PREVIEW_WEBHOOK_URL
//   para revisarlo antes de publicarlo.
// Modo live: va al webhook del canal, PMO_DIGEST_WEBHOOK_URL.
//   Se cambia con PMO_DIGEST_MODE=live, sin tocar codigo.
//
// Parametros de query (utiles para probar a mano):
//   ?kind=friday|monday   cual de los dos mensajes
//   ?from=&to=            rango explicito, pisa el calculado
//   ?includeToday=true    viernes lunes-a-viernes en vez de lunes-a-jueves
//   ?dry=true             devuelve el texto en JSON y no postea nada

const { buildHarvestDigest, postToSlack } = require('../lib/harvest-digest');

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  const refreshToken = process.env.PMO_REFRESH_TOKEN;
  const auth = req.headers.authorization || '';

  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (refreshToken && (auth === `Bearer ${refreshToken}` || req.headers['x-pmo-token'] === refreshToken)) return true;
  return !cronSecret && !refreshToken;
}

function queryParams(req) {
  const base = `https://${req.headers.host || 'pmoboard.vercel.app'}`;
  return new URL(req.url || '/', base).searchParams;
}

module.exports = async function cronHarvestDigestHandler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const params = queryParams(req);
    const kind = params.get('kind') === 'monday' ? 'monday' : 'friday';
    const dry = params.get('dry') === 'true';

    const digest = await buildHarvestDigest({
      kind,
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
      includeToday: params.get('includeToday') === 'true'
    });

    if (dry) {
      res.status(200).json({ ok: true, dry: true, ...digest });
      return;
    }

    const live = String(process.env.PMO_DIGEST_MODE || 'preview').toLowerCase() === 'live';
    const webhookUrl = live
      ? process.env.PMO_DIGEST_WEBHOOK_URL
      : (process.env.PMO_DIGEST_PREVIEW_WEBHOOK_URL || process.env.PMO_DIGEST_WEBHOOK_URL);

    const context = live
      ? `Harvest digest · ${digest.range.from} → ${digest.range.to}`
      : `Preview del digest de ${kind === 'monday' ? 'los lunes' : 'los viernes'} · ${digest.range.from} → ${digest.range.to} · `
        + `${digest.counts.incomplete} incompletos sobre ${digest.counts.reviewed} revisados `
        + `(target ${digest.expected}h / ${digest.businessDays} dias habiles) · revisalo y pegalo en #azumo-billing-hub`;

    const slack = await postToSlack(webhookUrl, { context, body: digest.body });

    res.status(200).json({
      ok: slack.ok !== false,
      mode: live ? 'live' : 'preview',
      kind,
      range: digest.range,
      counts: digest.counts,
      slack
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
