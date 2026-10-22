// Serves one UI (seller or consumer) on its own port.
//   /            -> <publicDir>/index.html
//   /shared/*    -> ../shared (styles + client helpers)
//   /config.js   -> tells the browser which port the common server is on
const http = require('http');
const fs = require('fs');
const path = require('path');
const { HOST, SERVER_PORT } = require('../config');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function resolveSafe(root, rel) {
  const full = path.join(root, path.normalize(rel));
  return full.startsWith(root + path.sep) || full === root ? full : null;
}

module.exports = function startStaticServer({ name, port, publicDir }) {
  const sharedDir = __dirname;
  const srv = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); return res.end('Bad request'); }

    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      return res.end(`window.APP_CONFIG=${JSON.stringify({ apiPort: SERVER_PORT, role: name })};`);
    }

    let file;
    if (pathname.startsWith('/shared/')) {
      file = resolveSafe(sharedDir, pathname.slice('/shared/'.length));
      if (file && file.endsWith('static-server.js')) file = null; // don't expose server code
    } else {
      file = resolveSafe(publicDir, pathname === '/' ? 'index.html' : pathname.slice(1));
    }

    fs.readFile(file || '', (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  srv.listen(port, HOST, () => console.log(`[${name}] UI on http://localhost:${port}`));
  return srv;
};
