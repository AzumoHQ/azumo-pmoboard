module.exports = function healthHandler(req, res) {
  res.status(200).json({
    ok: true,
    database: Boolean(process.env.DATABASE_URL),
    notes: Boolean(process.env.PMO_NOTES_PASSWORD),
    jira: Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN),
    eazybi: Boolean(process.env.EAZYBI_URL && process.env.EAZYBI_TOKEN && process.env.EAZYBI_REPORT_ID)
  });
};
