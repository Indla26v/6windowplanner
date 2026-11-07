// Tiny no-cache static server for previewing chrome/planner.html and popup.html
// outside the extension (storage falls back to localStorage). Usage: node scripts/serve.mjs [port] [folder]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 5178;
// Optional 2nd arg: folder to serve (default chrome/), e.g. vscode/media for the sidebar harness.
const root = join(base, process.argv[3] || 'chrome');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(p)).isDirectory()) p = join(p, 'planner.html');
    const body = await readFile(p);
    res.writeHead(200, { 'Content-Type': (types[extname(p)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`preview on http://localhost:${port}/planner.html`));
