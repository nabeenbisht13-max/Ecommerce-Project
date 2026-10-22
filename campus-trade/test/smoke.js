// Starts all three processes on test ports and checks the seller -> server -> consumer loop.
// Run: npm test
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ports = { SERVER_PORT: 4100, SELLER_PORT: 4101, CONSUMER_PORT: 4102, CONSUMER2_PORT: 4103, CONSUMER3_PORT: 4104 };
const env = { ...process.env, ...Object.fromEntries(Object.entries(ports).map(([k, v]) => [k, String(v)])),
  DATA_FILE: path.join(os.tmpdir(), `ct-test-${Date.now()}.json`) };
const procs = [
  ['server/server.js', {}],
  ['seller/server.js', {}],
  ['consumer/server.js', { CONSUMER_PORT: String(ports.CONSUMER_PORT) }],
  ['consumer/server.js', { CONSUMER_PORT: String(ports.CONSUMER2_PORT) }],
  ['consumer/server.js', { CONSUMER_PORT: String(ports.CONSUMER3_PORT) }]
].map(([f, overrides]) => spawn(process.execPath, [path.join(__dirname, '..', f)], {
  env: { ...env, ...overrides }, stdio: 'ignore'
}));

const api = (p, opts) => fetch(`http://localhost:${ports.SERVER_PORT}${p}`, opts);
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Listen to the live stream like the seller UI would.
async function collectEvents(out, signal) {
  const r = await api('/api/events', { signal });
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) return;
      buf += dec.decode(value);
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = /event: (.+)/.exec(chunk), data = /data: (.+)/.exec(chunk);
        if (ev && data) out.push({ event: ev[1], data: JSON.parse(data[1]) });
      }
    }
  } catch { /* aborted */ }
}

(async () => {
  let failed = false;
  const ac = new AbortController();
  try {
    await sleep(800);
    assert.strictEqual((await api('/health')).status, 200, 'server health');
    for (const [name, port] of [['seller', ports.SELLER_PORT], ['consumer 1', ports.CONSUMER_PORT], ['consumer 2', ports.CONSUMER2_PORT], ['consumer 3', ports.CONSUMER3_PORT]]) {
      const html = await (await fetch(`http://localhost:${port}/`)).text();
      assert(html.includes('Campus Trade'), `${name} page served`);
      if (name === 'seller') assert(html.includes('SELLER'), 'seller listing interface served');
      if (name.startsWith('consumer')) assert(html.includes('Me Page'), `${name} Me Page navigation served`);
      assert((await fetch(`http://localhost:${port}/shared/api.js`)).ok, `${name} shared assets`);
      assert((await fetch(`http://localhost:${port}/shared/static-server.js`)).status === 404, `${name} hides server code`);
      assert((await fetch(`http://localhost:${port}/..%2f..%2fconfig.js`)).status === 404, `${name} blocks path traversal`);
    }

    const events = []; collectEvents(events, ac.signal); await sleep(200);

    const photo = 'data:image/png;base64,aGVsbG8=';
    const created = await (await post('/api/items', { name: 'Giant city bike', price: 180, category: 'Transport', condition: 'Like new', description: 'Serviced', seller: 'Amir', sellerId: 'S1', photos: [photo] })).json();
    assert(created.id, 'item created');
    assert.deepStrictEqual(created.photos, [photo], 'listing photos saved');
    assert.strictEqual((await post('/api/items', { name: 'Bad photo', price: 5, category: 'Books', condition: 'Good', photos: ['data:text/html;base64,PGgxPm5vPC9oMT4='] })).status, 400, 'rejects non-image photos');
    assert.strictEqual((await post('/api/items', { name: '', price: 5, category: 'Books', condition: 'Good' })).status, 400, 'rejects empty name');

    assert.strictEqual((await post(`/api/items/${created.id}/bids`, { bidder: 'Linh', bidderId: 'B1', amount: 150 })).status, 201, 'first bid');
    assert.strictEqual((await post(`/api/items/${created.id}/bids`, { bidder: 'Kofi', bidderId: 'B2', amount: 165 })).status, 201, 'higher bid');
    assert.strictEqual((await post(`/api/items/${created.id}/bids`, { bidder: 'Mina', bidderId: 'B3', amount: 100 })).status, 201, 'lower bid is accepted');
    assert.strictEqual((await post('/api/items/999/bids', { bidderId: 'B4', amount: 10 })).status, 404, 'unknown item');

    const suspended = await post(`/api/items/${created.id}/bids/1-2/suspend`, { sellerId: 'S1' });
    assert.strictEqual(suspended.status, 200, 'seller can suspend the top bid');
    const afterSuspend = await suspended.json();
    assert.strictEqual(afterSuspend.bids.find((bid) => bid.id === '1-1').interest, 'requested', 'next bidder is asked first');

    const decline = await post(`/api/items/${created.id}/bids/1-1/interest`, { bidderId: 'B1', interested: false });
    assert.strictEqual(decline.status, 200, 'bidder can decline');
    const afterDecline = await decline.json();
    assert.strictEqual(afterDecline.pendingBidId, '1-3', 'declining prompts the next bidder');

    const confirm = await post(`/api/items/${created.id}/bids/1-3/interest`, { bidderId: 'B3', interested: true });
    assert.strictEqual(confirm.status, 200, 'bidder can confirm interest');
    assert.strictEqual((await confirm.json()).frontRunnerBidId, '1-3', 'confirmed bidder becomes front-runner');
    assert.strictEqual((await post(`/api/items/${created.id}/bids/1-3/interest`, { bidderId: 'B3', interested: true })).status, 409, 'stale interest request is rejected');

    assert.strictEqual((await post(`/api/items/${created.id}/sold`, { sellerId: 'not-S1' })).status, 403, 'only the listing seller can mark it sold');
    const sold = await post(`/api/items/${created.id}/sold`, { sellerId: 'S1' });
    assert.strictEqual(sold.status, 200, 'seller can mark listing sold');
    const soldItem = await sold.json();
    assert.strictEqual(soldItem.status, 'sold', 'sold listing is flagged');
    assert.strictEqual(soldItem.bids.find((bid) => bid.id === '1-3').status, 'won', 'front-runner is recorded as the winner');
    assert.strictEqual(soldItem.bids.find((bid) => bid.id === '1-1').status, 'lost', 'other bids are ended');
    assert.strictEqual((await post(`/api/items/${created.id}/bids`, { bidder: 'Late', bidderId: 'B4', amount: 999 })).status, 409, 'sold listing rejects new bids');

    const second = await (await post('/api/items', { name: 'Desk lamp', price: 60, category: 'Furniture', condition: 'Good', seller: 'Amir', sellerId: 'S1' })).json();
    assert.strictEqual((await post(`/api/items/${second.id}/bids`, { bidder: 'Linh', bidderId: 'B1', amount: 75 })).status, 201, 'buyer can place bid to cancel');
    assert.strictEqual((await post(`/api/items/${second.id}/bids`, { bidder: 'Kofi', bidderId: 'B2', amount: 55 })).status, 201, 'next bidder is recorded');
    assert.strictEqual((await post(`/api/items/${second.id}/bids/${second.id}-1/cancel`, { bidderId: 'B2' })).status, 403, 'buyer cannot cancel another buyer bid');
    const cancelTop = await post(`/api/items/${second.id}/bids/${second.id}-1/cancel`, { bidderId: 'B1' });
    assert.strictEqual(cancelTop.status, 200, 'buyer can cancel own bid');
    assert.strictEqual((await cancelTop.json()).pendingBidId, `${second.id}-2`, 'next bidder is asked after front-runner cancels');
    const cancelPending = await post(`/api/items/${second.id}/bids/${second.id}-2/cancel`, { bidderId: 'B2' });
    assert.strictEqual(cancelPending.status, 200, 'buyer can cancel while interest request is pending');
    assert.strictEqual((await cancelPending.json()).pendingBidId, null, 'cancelled pending bid clears request');

    const cancelled = await post(`/api/items/${second.id}/cancel`, { sellerId: 'S1' });
    assert.strictEqual(cancelled.status, 200, 'seller can cancel listing');
    assert.strictEqual((await cancelled.json()).status, 'cancelled', 'cancelled listing is flagged');

    await sleep(300);
    const names = events.map((e) => e.event);
    assert.deepStrictEqual(names, [
      'item:created', 'bid:placed', 'bid:placed', 'bid:placed',
      'item:updated', 'item:updated', 'item:updated', 'item:updated',
      'item:created', 'bid:placed', 'bid:placed', 'item:updated', 'item:updated', 'item:updated'
    ], 'live events delivered for listing and bid lifecycle changes');
    const list = await (await api('/api/items')).json();
    assert.strictEqual(list.find((item) => item.id === created.id).bids.length, 3, 'bids stored');
    assert.strictEqual(list.find((item) => item.id === second.id).status, 'cancelled', 'cancelled listing persists');
    console.log('All smoke checks passed.');
  } catch (e) {
    failed = true; console.error('FAILED:', e.message);
  } finally {
    ac.abort(); procs.forEach((p) => p.kill()); process.exit(failed ? 1 : 0);
  }
})();
