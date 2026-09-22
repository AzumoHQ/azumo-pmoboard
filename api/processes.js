const {
  getProcesses,
  getProcessDetail,
  upsertProcess,
  deleteProcess,
  replaceProcessSteps,
  replaceProcessValidations,
  replaceProcessResources
} = require('../lib/data-store');
const { canAdmin, getSessionUser } = require('../lib/auth');

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

// Read access: any signed-in user (matches the rest of the Portal — Processes is a
// read surface for everyone, edits are gated separately below).
// Write access: PMO role only (Federica's call — see "Portal de Procesos: Plan de
// Backend", section D). Reuses the auth already built for the rest of the board
// instead of inventing a second permission system for this module.
async function getProcessesAccess(req) {
  const user = await getSessionUser(req);
  if (!user || user.active === false) {
    return { read: false, write: false };
  }
  return { read: true, write: canAdmin(user) };
}

module.exports = async function processesHandler(req, res) {
  const access = await getProcessesAccess(req);
  if (!access.read) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  try {
    if (req.method === 'GET') {
      if (id) {
        const process = await getProcessDetail(id);
        if (!process) {
          res.status(404).json({ error: 'Process not found' });
          return;
        }
        res.status(200).json({ process });
        return;
      }
      res.status(200).json({ processes: await getProcesses() });
      return;
    }

    if (!access.write) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);

      if (action === 'steps') {
        if (!id) {
          res.status(400).json({ error: 'Missing process id' });
          return;
        }
        const process = await replaceProcessSteps(id, body.steps || []);
        res.status(200).json({ process });
        return;
      }

      if (action === 'validations') {
        if (!id) {
          res.status(400).json({ error: 'Missing process id' });
          return;
        }
        const process = await replaceProcessValidations(id, body.validations || []);
        res.status(200).json({ process });
        return;
      }

      if (action === 'resources') {
        if (!id) {
          res.status(400).json({ error: 'Missing process id' });
          return;
        }
        const process = await replaceProcessResources(id, body.resources || []);
        res.status(200).json({ process });
        return;
      }

      // No action: create/update the process record itself.
      const process = await upsertProcess(body);
      res.status(201).json({ process });
      return;
    }

    if (req.method === 'DELETE') {
      if (!id) {
        res.status(400).json({ error: 'Missing process id' });
        return;
      }
      await deleteProcess(id);
      res.status(200).json({ processes: await getProcesses() });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
