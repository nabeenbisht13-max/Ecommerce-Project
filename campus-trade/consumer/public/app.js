const $ = (s) => document.querySelector(s);
const { esc, topBid, emoji, tint, time, toast } = util;

let bidderName = util.local('ct.bidderName', () => '');
const bidderId = util.local('ct.bidderId', () => 'B' + Math.random().toString(36).slice(2, 12));
let categories = ['Transport', 'Appliances', 'Electronics', 'Books', 'Furniture'];
let items = [];
let st = { cat: 'All', q: '' };
let view = 'market';
let openId = null;
let bidFilter = 'all';

const listingStatus = (item) => item.status || 'active';
function bidStatus(item, bid) {
  if (bid.status === 'won') return 'won';
  if (bid.status === 'suspended') return 'suspended';
  if (bid.status === 'cancelled' || bid.status === 'lost' || bid.status === 'listing_cancelled' ||
      bid.interest === 'declined' || listingStatus(item) !== 'active') return 'ended';
  return 'ongoing';
}

function myBids() {
  return items.flatMap((item) => item.bids
    .filter((bid) => bid.bidderId === bidderId)
    .map((bid) => ({ item, bid, status: bidStatus(item, bid) })));
}

function market() {
  const q = st.q.toLowerCase();
  const l = items.filter((i) => listingStatus(i) === 'active').filter((i) =>
    (st.cat === 'All' || i.category === st.cat) &&
    (i.name + i.category + i.description).toLowerCase().includes(q));

  $('#main').innerHTML = `<div class="chips">${['All', ...categories].map((c) =>
      `<button class="chip ${c === st.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${l.length
      ? `<div class="grid">${l.map((i) => {
          const tb = topBid(i);
          return `<button class="item" data-id="${i.id}">
            ${i.photos && i.photos.length
              ? `<img class="pic" src="${esc(i.photos[0])}" alt="${esc(i.name)} photo">`
              : `<div class="pic" style="background:${tint[i.category] || '#e7e5e4'}">${emoji[i.category] || '📦'}</div>`}
            <div class="meta"><div class="name">${esc(i.name)}</div>
              <div><span class="tag">${esc(i.condition)}</span>${tb !== null ? `<span class="dim">Top bid ¥${tb}</span>` : ''}</div>
              <div class="price">¥${i.price}</div></div></button>`;
        }).join('')}</div>`
      : `<div class="empty">${items.length ? 'No items match these filters.' : 'Nothing listed yet.<br>New items from sellers appear here instantly.'}</div>`}`;
}

function renderMe() {
  const allBids = myBids().sort((a, b) => b.bid.at - a.bid.at);
  const bids = bidFilter === 'all' ? allBids : allBids.filter((entry) => entry.status === bidFilter);
  $('#main').innerHTML = `<h3 class="page-title">My bids</h3>
    <div class="chips bid-filters">${[['all', 'All'], ['ongoing', 'Ongoing'], ['suspended', 'Suspended'], ['won', 'Won'], ['ended', 'Ended']].map(([key, label]) =>
      `<button class="chip ${bidFilter === key ? 'on' : ''}" data-bid-filter="${key}">${label}</button>`).join('')}</div>
    ${bids.length
    ? bids.map(({ item, bid }) => {
      const isPending = item.pendingBidId === bid.id && bid.interest === 'requested';
      const state = bidStatus(item, bid);
      const status = state === 'won' ? 'Won'
        : state === 'suspended' ? 'Suspended by seller'
        : state === 'ended' ? (listingStatus(item) === 'sold' ? 'Listing sold' : listingStatus(item) === 'cancelled' ? 'Listing cancelled' : bid.status === 'lost' ? 'Seller sold to another bidder' : bid.status === 'cancelled' ? 'Bid cancelled' : 'No longer active')
        : bid.interest === 'declined' ? 'You declined'
          : isPending ? 'Seller wants to know if you are still interested'
            : item.frontRunnerBidId === bid.id ? 'Front-runner'
              : 'Bid placed';
      return `<div class="sec">
        <div class="row"><b>${esc(item.name)}</b><b>¥${bid.amount}</b></div>
        <div class="dim">${esc(item.seller)} · ${time(bid.at)}</div>
        <div class="row"><span>Status</span><span class="dim">${status}</span></div>
        ${isPending ? `<div class="interest-actions"><button class="btn" data-interest="yes" data-item="${item.id}" data-bid="${esc(bid.id)}">I’m still interested</button><button class="secondary-btn" data-interest="no" data-item="${item.id}" data-bid="${esc(bid.id)}">No, thank you</button></div>` : ''}
        ${state === 'ongoing' || state === 'suspended' ? `<button class="secondary-btn cancel-bid" data-cancel-bid="${esc(bid.id)}" data-item="${item.id}">Cancel my bid</button>` : ''}
      </div>`;
    }).join('')
    : `<div class="empty">${allBids.length ? 'No bids match this filter.' : 'You have not bid on any items yet.<br>Browse the market and place your first bid.'}</div>`}`;
}

function show(nextView) {
  view = nextView;
  document.querySelectorAll('nav button').forEach((button) => button.classList.toggle('on', button.dataset.view === view));
  $('#q').hidden = view !== 'market';
  view === 'market' ? market() : renderMe();
}

function bidInfo(i) {
  const tb = topBid(i);
  return `<div class="row"><span>Asking price</span><b>¥${i.price}</b></div>
    <div class="row"><span>Current top bid</span><b style="${tb !== null ? 'color:var(--green)' : ''}">${tb !== null ? '¥' + tb : 'No bids yet'}</b></div>
    ${i.bids.length ? `<ul class="log">${i.bids.slice().sort((a, b) => b.amount - a.amount || b.at - a.at).slice(0, 8).map((b) =>
        `<li><span>${esc(b.bidder)}</span><span><b>¥${b.amount}</b> <span class="dim">${b.status === 'suspended' ? 'suspended' : time(b.at)}</span></span></li>`).join('')}</ul>` : ''}`;
}

function detail(id) {
  const i = items.find((x) => x.id === id);
  if (!i) return;
  openId = id;
  const hero = i.photos && i.photos.length
    ? `<div class="photo-gallery">${i.photos.map((photo) => `<img src="${esc(photo)}" alt="${esc(i.name)} photo">`).join('')}</div>`
    : `<div class="hero" style="background:${tint[i.category] || '#e7e5e4'}">${emoji[i.category] || '📦'}</div>`;
  $('#sbody').innerHTML = `${hero}
    ${listingStatus(i) !== 'active' ? `<div class="note listing-notice">This listing is ${listingStatus(i)}.</div>` : ''}
    <div class="sec"><div style="font-weight:700;font-size:16px">${esc(i.name)}</div><div class="dim">Posted by ${esc(i.seller)}</div></div>
    <div class="sec"><h3>Condition</h3><div class="row"><span>State</span><b>${esc(i.condition)}</b></div><div class="row"><span>Category</span><span>${esc(i.category)}</span></div>
      <p style="margin:6px 0 0">${esc(i.description)}</p></div>
    <div class="sec"><h3>Bid instead of chatting</h3><div id="bidinfo">${bidInfo(i)}</div>
      ${listingStatus(i) === 'active' ? `
      <label for="bn">Your name</label><input type="text" id="bn" maxlength="40" placeholder="e.g. Linh, Friendship Apt" value="${esc(bidderName)}">
      <div class="inl"><input type="number" id="bv" min="0.01" step="0.5" inputmode="decimal" placeholder="Your bid in ¥" aria-label="Your bid"><button class="btn" id="bgo">Place bid</button></div>
      <div id="bmsg"></div>` : ''}</div>`;
  $('#sheet').classList.add('open');

  if (listingStatus(i) !== 'active') return;
  $('#bgo').onclick = async () => {
    const cur = items.find((x) => x.id === id);
    const v = Number($('#bv').value);
    const msg = (cls, t) => ($('#bmsg').innerHTML = `<div class="${cls}">${esc(t)}</div>`);
    if (!(v > 0)) return msg('note', 'Enter a valid bid amount first.');
    bidderName = $('#bn').value.trim();
    util.save('ct.bidderName', bidderName);
    $('#bgo').disabled = true;
    try {
      await api.placeBid(id, { bidder: bidderName, bidderId, amount: v });
      msg('ok', `Bid of ¥${v} sent. ${esc(cur.seller)} can see it right now.`);
      $('#bv').value = '';
    } catch (e) {
      msg('note', e.message);
    } finally {
      const b = $('#bgo'); if (b) b.disabled = false;
    }
  };
}

function upsert(item) {
  const i = items.findIndex((x) => x.id === item.id);
  i >= 0 ? (items[i] = item) : items.unshift(item);
}

$('#main').addEventListener('click', async (e) => {
  const chip = e.target.closest('.chip'), itemButton = e.target.closest('.item');
  const interestButton = e.target.closest('[data-interest]');
  const cancelButton = e.target.closest('[data-cancel-bid]');
  const filterButton = e.target.closest('[data-bid-filter]');
  if (filterButton) {
    bidFilter = filterButton.dataset.bidFilter;
    renderMe();
  } else if (cancelButton) {
    if (!window.confirm('Cancel this bid?')) return;
    cancelButton.disabled = true;
    try {
      const item = await api.cancelBid(Number(cancelButton.dataset.item), cancelButton.dataset.cancelBid, bidderId);
      upsert(item);
      renderMe();
      toast('Your bid was cancelled.');
    } catch (error) {
      toast(error.message);
    }
  } else if (interestButton) {
    interestButton.disabled = true;
    try {
      const item = await api.respondToInterest(
        Number(interestButton.dataset.item), interestButton.dataset.bid, bidderId, interestButton.dataset.interest === 'yes'
      );
      upsert(item);
      renderMe();
      toast(interestButton.dataset.interest === 'yes' ? 'You confirmed your interest.' : 'Your response was sent.');
    } catch (error) {
      toast(error.message);
    }
  } else if (chip && chip.dataset.c) {
    st.cat = chip.dataset.c;
    market();
  } else if (itemButton) detail(Number(itemButton.dataset.id));
});

document.querySelectorAll('nav button').forEach((button) => (button.onclick = () => show(button.dataset.view)));
$('#q').oninput = (e) => { st.q = e.target.value; if (view === 'market') market(); };
$('#back').onclick = () => { openId = null; $('#sheet').classList.remove('open'); };

api.meta().then((m) => { categories = m.categories; if (view === 'market') market(); }).catch(() => {});
market();

api.subscribe({
  status(on) { $('#live').classList.toggle('on', on); $('#livetxt').textContent = on ? 'Live · connected to server' : 'Reconnecting…'; },
  async open() {
    try {
      items = await api.items();
      view === 'market' ? market() : renderMe();
      $('#my-bid-badge').textContent = myBids().length ? `(${myBids().length})` : '';
      if (openId !== null && $('#sheet').classList.contains('open')) {
        const item = items.find((candidate) => candidate.id === openId);
        if (item) { $('#bidinfo').innerHTML = bidInfo(item); }
      }
    } catch { /* retry on reconnect */ }
  },
  'item:created'(item) { upsert(item); if (view === 'market') market(); toast(`New listing: ${item.name}`); },
  'bid:placed'({ item }) {
    upsert(item);
    if (view === 'market') market(); else renderMe();
    $('#my-bid-badge').textContent = myBids().length ? `(${myBids().length})` : '';
    if (openId === item.id) $('#bidinfo').innerHTML = bidInfo(item);
  },
  'item:updated'(item) {
    upsert(item);
    if (view === 'market') market(); else renderMe();
    if (openId === item.id) {
      if (listingStatus(item) !== 'active') detail(item.id);
      else $('#bidinfo').innerHTML = bidInfo(item);
    }
  }
});
