// AEVON - Pons API CORS Proxy
// Lightweight proxy to bypass CORS when fetching from Pons API

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3457;
const PONS_HOST = 'www.ponsfamily.com';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url);
  if (!parsed.pathname.startsWith('/api/') && !parsed.pathname.startsWith('/token-images/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /api/* or /token-images/* paths.' }));
    return;
  }

  const target = `https://${PONS_HOST}${req.url}`;

  const isImage = parsed.pathname.startsWith('/token-images/') ||
    parsed.pathname.includes('/ipfs/content/');

  https.get(target, {
    headers: {
      'User-Agent': 'AEVON-Launchpad/1.0',
      'Accept': isImage ? 'image/*,*/*' : 'application/json',
      'Referer': 'https://www.ponsfamily.com/'
    }
  }, (proxyRes) => {
    const ct = proxyRes.headers['content-type'] || (isImage ? 'image/jpeg' : 'application/json');
    const cacheTime = isImage ? 3600 : 10;
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': ct,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${cacheTime}`
    });
    proxyRes.pipe(res);
  }).on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  });
});

server.listen(PORT, () => {
  console.log(`AEVON Pons proxy running on http://localhost:${PORT}`);
});
