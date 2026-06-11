const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

if (process.env.PMO_LOCAL_USE_DATABASE !== '1') {
  delete process.env.DATABASE_URL;
}

const dashboardHandler = require('../api/dashboard');
const authHandler = require('../api/auth');
const cronSnapshotHandler = require('../api/cron-snapshot');
const healthHandler = require('../api/health');
const notesHandler = require('../api/notes');
const refreshHandler = require('../api/refresh');
const snapshotsHandler = require('../api/snapshots');
const usersHandler = require('../api/users');

const ROOT = path.join(__dirname, '..');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);

const API_ROUTES = {
  '/api/auth': authHandler,
  '/api/cron-snapshot': cronSnapshotHandler,
  '/api/dashboard': dashboardHandler,
  '/api/health': healthHandler,
  '/api/notes': notesHandler,
  '/api/refresh': refreshHandler,
  '/api/snapshots': snapshotsHandler,
  '/api/users': usersHandler
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, 'Not found');
      return;
    }

    const type = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': type });
  });
}

function decorateJsonResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    const body = JSON.stringify(payload);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(body);
  };
  res.send = (payload) => {
    res.end(payload);
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const handler = API_ROUTES[url.pathname];

  if (handler) {
    decorateJsonResponse(res);
    await handler(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`PMO Board local server running at http://${HOST}:${PORT}`);
});
