const { addNote, deleteNote, getNotes } = require('../lib/data-store');

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

function hasNotesAccess(req) {
  const password = process.env.PMO_NOTES_PASSWORD;
  if (!password) return false;
  return req.headers['x-pmo-password'] === password;
}

module.exports = async function notesHandler(req, res) {
  if (!hasNotesAccess(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ notes: await getNotes() });
      return;
    }

    if (req.method === 'POST') {
      const note = await readJson(req);
      await addNote(note);
      res.status(201).json({ notes: await getNotes() });
      return;
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) {
        res.status(400).json({ error: 'Missing note id' });
        return;
      }

      await deleteNote(id);
      res.status(200).json({ notes: await getNotes() });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
