const { runRefresh } = require('./refresh');
const { getDashboardData } = require('../lib/data-store');
const { buildDailyQaReport, renderDueTodaySvg, sendDailyQaEmail, sendSlackDueAlert } = require('../lib/daily-qa');

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

module.exports = async function cronSnapshotHandler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const params = queryParams(req);

    if (params.get('card') === 'due-today') {
      const expectedToken = process.env.PMO_PUBLIC_DUE_CARD_TOKEN;
      if (expectedToken && params.get('token') !== expectedToken) {
        res.status(401).send('Unauthorized');
        return;
      }
      const data = await getDashboardData();
      const report = buildDailyQaReport(data, { today: params.get('date') || undefined });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(renderDueTodaySvg(report));
      return;
    }

    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const shouldRefresh = params.get('refresh') !== 'false';
    const result = shouldRefresh ? await runRefresh({ triggeredBy: 'vercel-cron-daily-qa' }) : null;
    const data = await getDashboardData();
    const report = buildDailyQaReport(data);
    const [email, slack] = await Promise.all([
      sendDailyQaEmail(report),
      sendSlackDueAlert(report)
    ]);

    res.status(200).json({
      ok: true,
      ...(result || {}),
      counts: {
        due_today: report.due_today.length,
        overdue: report.overdue.length,
        external_zero_billing: report.external_zero_billing.length,
        position_qa: report.position_qa.length,
        account_coverage_gaps: report.account_coverage_gaps.length
      },
      email,
      slack
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
