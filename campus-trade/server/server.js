// Common channel between seller (user 1) and consumer (user 2).
//   REST  : GET/POST /api/items, POST /api/items/:id/bids
//   Live  : GET /api/events  (Server-Sent Events, auto-reconnects in the browser)
const http = require('http');
const { HOST, SERVER_PORT, CORS_ORIGIN, CATEGORIES, CONDITIONS } = require('../config');
const store = require('./store');

const clients = new Set();
const MAX_BODY_SIZE = 5_600_000;
const MAX_PHOTO_SIZE = 1_000_000;
const MAX_PHOTOS = 4;

function cors(req, res) {
  const allowed = CORS_ORIGIN.split(',').map((s) => s.trim());
  const origin = req.headers.origin;
  if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > MAX_BODY_SIZE) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validateItem(b) {
  const name = str(b.name, 80);
  const price = Number(b.price);
  if (!name) return { error: 'Item name is required' };
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) return { error: 'Price must be a positive number' };
  if (!CATEGORIES.includes(b.category)) return { error: 'Unknown category' };
  if (!CONDITIONS.includes(b.condition)) return { error: 'Unknown condition' };
  const photos = Array.isArray(b.photos) ? b.photos : [];
  if (photos.length > MAX_PHOTOS) return { error: `Choose no more than ${MAX_PHOTOS} photos` };
  for (const photo of photos) {
    const match = typeof photo === 'string' && photo.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return { error: 'Photos must be JPEG, PNG, WebP, or GIF images under 1 MB each' };
    const encoded = match[2];
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const decodedSize = Math.floor(encoded.length * 3 / 4) - padding;
    if (decodedSize > MAX_PHOTO_SIZE)
      return { error: 'Photos must be JPEG, PNG, WebP, or GIF images under 1 MB each' };
  }
  return {
    data: {
      name, price, category: b.category, condition: b.condition,
      description: str(b.description, 500) || 'No description yet.',
      seller: str(b.seller, 40) || 'Anonymous seller',
      photos,
      sellerId: str(b.sellerId, 64)
    }
  };
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/health') return json(res, 200, { ok: true });

    if (req.method === 'GET' && p === '/api/meta')
      return json(res, 200, { categories: CATEGORIES, conditions: CONDITIONS });

    if (req.method === 'GET' && p === '/api/items') return json(res, 200, store.listItems());

    if (req.method === 'POST' && p === '/api/items') {
      const { data, error } = validateItem(await readJson(req));
      if (error) return json(res, 400, { error });
      const item = store.addItem(data);
      broadcast('item:created', item);
      return json(res, 201, item);
    }

    const listingAction = p.match(/^\/api\/items\/(\d+)\/(sold|cancel)$/);
    if (req.method === 'POST' && listingAction) {
      const b = await readJson(req);
      const action = listingAction[2];
      const out = action === 'sold'
        ? store.markSold(Number(listingAction[1]), str(b.sellerId, 64))
        : store.cancelListing(Number(listingAction[1]), str(b.sellerId, 64));
      if (out.error) return json(res, out.status, { error: out.error });
      broadcast('item:updated', out.item);
      return json(res, 200, out.item);
    }

    const m = p.match(/^\/api\/items\/(\d+)\/bids$/);
    if (req.method === 'POST' && m) {
      const b = await readJson(req);
      const amount = Number(b.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
        return json(res, 400, { error: 'Enter a valid bid amount' });
      const bidderId = str(b.bidderId, 64);
      if (!bidderId) return json(res, 400, { error: 'Buyer identity is required' });
      const out = store.addBid(Number(m[1]), { bidder: str(b.bidder, 40) || 'Anonymous buyer', bidderId, amount });
      if (out.error) return json(res, out.status, { error: out.error });
      broadcast('bid:placed', { itemId: out.item.id, bid: out.bid, item: out.item });
      return json(res, 201, out.item);
    }

    const bidAction = p.match(/^\/api\/items\/(\d+)\/bids\/([^/]+)\/(interest|suspend|cancel)$/);
    if (req.method === 'POST' && bidAction) {
      const b = await readJson(req);
      const itemId = Number(bidAction[1]);
      const bidId = decodeURIComponent(bidAction[2]);
      const out = bidAction[3] === 'suspend'
        ? store.suspendBid(itemId, bidId, str(b.sellerId, 64))
        : bidAction[3] === 'cancel'
          ? store.cancelBid(itemId, bidId, str(b.bidderId, 64))
          : store.respondToInterest(itemId, bidId, str(b.bidderId, 64), b.interested === true);
      if (out.error) return json(res, out.status, { error: out.error });
      broadcast('item:updated', out.item);
      return json(res, 200, out.item);
    }

    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // stop nginx buffering the stream
      });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    json(res, e.message === 'Body too large' ? 413 : 400, { error: e.message });
  }
});

// keep idle SSE connections alive through proxies
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25_000).unref();

server.listen(SERVER_PORT, HOST, () => console.log(`[server]   API + events on http://localhost:${SERVER_PORT}`));
