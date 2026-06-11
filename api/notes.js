const { addNote, deleteNote, getNotes } = require('../lib/data-store');
const { createPmoActionIssue } = require('../lib/jira-client');
const { canRefresh, getSessionUser } = require('../lib/auth');

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

async function getNotesAccess(req) {
  const user = await getSessionUser(req);
  if (!user || user.active === false) {
    return { read: false, write: false };
  }
  return { read: true, write: canRefresh(user) };
}

module.exports = async function notesHandler(req, res) {
  const access = await getNotesAccess(req);
  if (!access.read) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ notes: await getNotes() });
      return;
    }

    if (req.method === 'POST') {
      if (!access.write) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const note = await readJson(req);

      if (note.type === 'jira_action_ticket') {
        const ticket = await createPmoActionIssue(note.action || {});
        res.status(201).json({ ticket });
        return;
      }

      await addNote(note);
      res.status(201).json({ notes: await getNotes() });
      return;
    }

    if (req.method === 'DELETE') {
      if (!access.write) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
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
