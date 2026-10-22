// Browser helper used by both interfaces: REST calls + live updates.
(function () {
  const base = `${location.protocol}//${location.hostname}:${window.APP_CONFIG.apiPort}`;

  async function request(path, opts) {
    const r = await fetch(base + path, opts);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }
  const post = (path, data) =>
    request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

  window.api = {
    meta: () => request('/api/meta'),
    items: () => request('/api/items'),
    createItem: (data) => post('/api/items', data),
    placeBid: (id, data) => post(`/api/items/${id}/bids`, data),
    respondToInterest: (id, bidId, bidderId, interested) =>
      post(`/api/items/${id}/bids/${encodeURIComponent(bidId)}/interest`, { bidderId, interested }),
    suspendBid: (id, bidId, sellerId) => post(`/api/items/${id}/bids/${encodeURIComponent(bidId)}/suspend`, { sellerId }),
    cancelBid: (id, bidId, bidderId) => post(`/api/items/${id}/bids/${encodeURIComponent(bidId)}/cancel`, { bidderId }),
    markSold: (id, sellerId) => post(`/api/items/${id}/sold`, { sellerId }),
    cancelListing: (id, sellerId) => post(`/api/items/${id}/cancel`, { sellerId }),

    // handlers: { 'item:created': fn, 'bid:placed': fn, status: fn(bool), open: fn }
    subscribe(handlers) {
      const es = new EventSource(base + '/api/events');
      es.onopen = () => { handlers.status && handlers.status(true); handlers.open && handlers.open(); };
      es.onerror = () => handlers.status && handlers.status(false);
      ['item:created', 'bid:placed', 'item:updated'].forEach((ev) =>
        es.addEventListener(ev, (e) => handlers[ev] && handlers[ev](JSON.parse(e.data)))
      );
      return es;
    }
  };

  window.util = {
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    topBid: (i) => {
      const bids = i.bids.filter((b) => (b.status === undefined || b.status === 'active' || b.status === 'won') && b.interest !== 'declined');
      return bids.length ? Math.max(...bids.map((b) => b.amount)) : null;
    },
    emoji: { Transport: '🚲', Appliances: '🧊', Electronics: '🖥️', Books: '📚', Furniture: '💡' },
    tint: { Transport: '#dbeafe', Appliances: '#e0f2fe', Electronics: '#ede9fe', Books: '#fef3c7', Furniture: '#fef9c3' },
    time: (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    // Simple per-browser identity (replace with real auth in a later iteration)
    local(key, make) {
      try {
        let v = localStorage.getItem(key);
        if (!v) { v = make(); localStorage.setItem(key, v); }
        return v;
      } catch { return make(); }
    },
    save(key, v) { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } },
    toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg; t.classList.add('on');
      clearTimeout(window.util._h); window.util._h = setTimeout(() => t.classList.remove('on'), 2400);
    }
  };
})();
