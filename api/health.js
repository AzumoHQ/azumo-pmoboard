module.exports = function healthHandler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ status: 'error' });
      return;
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
};
