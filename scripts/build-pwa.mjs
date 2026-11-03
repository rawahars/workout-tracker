import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [path.resolve('node_modules', 'expo', 'bin', 'cli'), 'export', '--platform', 'web', '--output-dir', 'dist'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const root = path.resolve('dist');
const index = path.join(root, 'index.html');
let html = await readFile(index, 'utf8');
html = html.replace('</head>', `<meta name="theme-color" content="#101411"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="apple-mobile-web-app-title" content="FORM"/>
<link rel="manifest" href="./manifest.webmanifest"/>
<link rel="apple-touch-icon" href="./icon-192.png"/>
<style>html,body,#root{height:100%;height:100dvh;background:#101411}body{margin:0;overscroll-behavior:none}input,textarea{font-size:16px}*:focus-visible{outline:2px solid #c7f36b;outline-offset:3px}</style>
</head>`);
await writeFile(index, html);
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)));
  return nested.flat();
}
const all = (await files(root)).filter(file => !file.endsWith('.map') && !file.endsWith('sw.js') && !path.basename(file).startsWith('_headers'));
const hash = createHash('sha256');
for (const file of all) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 16);
const urls = all.map(file => path.relative(root, file).split(path.sep).join('/'));
await writeFile(path.join(root, 'sw.js'), `
const CACHE = 'form-shell-${version}';
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new URL(file, self.registration.scope).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('form-shell-') && key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const request = event.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : event.request;
    return await cache.match(request) || fetch(event.request);
  }));
});
`);
await writeFile(path.join(root, '_headers'), `/sw.js
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`);
console.log(`FORM PWA ready: ${urls.length} offline assets, version ${version}. Upload the dist folder to Cloudflare Pages.`);
