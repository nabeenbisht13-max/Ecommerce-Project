const $ = (s) => document.querySelector(s);
const { esc, topBid, emoji, tint, time, toast } = util;

const sellerId = util.local('ct.sellerId', () => 'S' + Math.random().toString(36).slice(2, 10));
let sellerName = util.local('ct.sellerName', () => '');
let meta = { categories: ['Transport', 'Appliances', 'Electronics', 'Books', 'Furniture'], conditions: ['Like new', 'Good', 'Fair'] };
let items = [];
let view = 'list';
let flashId = null;

const mine = () => items.filter((i) => i.sellerId === sellerId);

function renderForm() {
  $('#main').innerHTML = `<div class="sec" style="margin:0"><h3>List an item for sale</h3>
    <label for="sn">Your name / dorm</label><input type="text" id="sn" maxlength="40" placeholder="e.g. Amir, Dorm 6" value="${esc(sellerName)}">
    <label for="pn">Item name</label><input type="text" id="pn" maxlength="80" placeholder="e.g. Electric kettle">
    <label for="pc">Category</label><select id="pc">${meta.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    <label for="pk">Condition</label><select id="pk">${meta.conditions.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    <label for="pp">Original (asking) price (¥)</label><input type="number" id="pp" min="1" step="0.5" inputmode="decimal">
    <label for="pd">Description</label><textarea id="pd" rows="3" maxlength="500" placeholder="Age, any damage, what is included"></textarea>
    <label for="photos">Photos (up to 4, 1 MB each)</label><input type="file" id="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
    <div class="photo-preview" id="photo-preview"></div>
    <button class="btn" id="go" style="margin-top:14px">Publish listing</button></div>`;

  $('#photos').onchange = () => {
    const files = Array.from($('#photos').files || []);
    $('#photo-preview').innerHTML = files.map((file) => `<span>${esc(file.name)}</span>`).join('');
  };
  $('#go').onclick = async () => {
    const name = $('#pn').value.trim(), price = Number($('#pp').value);
    if (!name || !(price > 0)) return toast('Add an item name and a price');
    const files = Array.from($('#photos').files || []);
    if (files.length > 4) return toast('Choose no more than 4 photos');
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 1_000_000))
      return toast('Photos must be JPEG, PNG, WebP, or GIF images under 1 MB each');
    sellerName = $('#sn').value.trim();
    util.save('ct.sellerName', sellerName);
    $('#go').disabled = true;
    try {
      const photos = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
      })));
      await api.createItem({
        name, price, sellerId, seller: sellerName,
        category: $('#pc').value, condition: $('#pk').value, description: $('#pd').value, photos
      });
      toast('Listing published');
      show('mine'); // the item itself arrives through the live event stream
    } catch (e) {
      toast(e.message);
    } finally {
      const b = $('#go'); if (b) b.disabled = false;
    }
  };
}

function renderMine() {
  const l = mine();
  $('#main').innerHTML = l.length
    ? l.map((i) => {
        const tb = topBid(i);
        return `<div class="sec ${i.id === flashId ? 'flash' : ''}" data-item-id="${i.id}" style="margin:0 0 10px">
          <div style="display:flex;gap:10px;align-items:center">
            ${i.photos && i.photos.length
              ? `<img class="thumb" src="${esc(i.photos[0])}" alt="${esc(i.name)} photo">`
              : `<div class="pic" style="width:56px;height:56px;border-radius:10px;font-size:28px;background:${tint[i.category] || '#e7e5e4'}">${emoji[i.category] || '📦'}</div>`}
            <div style="flex:1;min-width:0"><div class="name" style="min-height:0">${esc(i.name)}</div>
              <div><span class="tag">${esc(i.condition)}</span><span class="dim">${esc(i.category)}</span></div></div>
          </div>
          <div class="row" style="margin-top:8px"><span>Asking price</span><b>¥${i.price}</b></div>
          <div class="row"><span>Listing status</span><b>${esc(i.status || 'active')}</b></div>
          <div class="row"><span>Top bid</span><b class="${tb ? '' : 'dim'}" style="${tb ? 'color:var(--green)' : ''}">${tb ? '¥' + tb : 'No bids yet'}</b></div>
          ${i.pendingBidId ? `<div class="note">Waiting for ${esc((i.bids.find((b) => b.id === i.pendingBidId) || {}).bidder || 'a bidder')} to confirm interest.</div>` : ''}
          ${i.bids.length ? `<ul class="log">${i.bids.slice().sort((a, b) => b.amount - a.amount || b.at - a.at).map((b) => {
            const front = i.frontRunnerBidId ? i.frontRunnerBidId === b.id : b.amount === tb && b.status === 'active';
            return `<li><span>${esc(b.bidder)} ${front ? '<b class="dim">· front-runner</b>' : ''}<br><span class="dim">${esc(b.status || 'active')}${b.interest === 'requested' ? ' · awaiting interest' : b.interest === 'declined' ? ' · not interested' : b.interest === 'interested' ? ' · interested' : ''}</span></span><span><b>¥${b.amount}</b> <span class="dim">${time(b.at)}</span>${i.status !== 'sold' && i.status !== 'cancelled' && front && !i.pendingBidId ? `<button class="small-btn" data-suspend="${esc(b.id)}">Suspend & ask next</button>` : ''}</span></li>`;
          }).join('')}</ul>` : ''}
          ${(!i.status || i.status === 'active') ? `<div class="listing-actions"><button class="btn" data-mark-sold="${i.id}">Mark sold</button><button class="secondary-btn" data-cancel-listing="${i.id}">Cancel listing</button></div>` : ''}
        </div>`;
      }).join('')
    : `<div class="empty">You have not listed anything yet.<br>Use “List an item” to add your first one.</div>`;
  $('#badge').textContent = l.length ? `(${l.length})` : '';
}

function show(v) {
  view = v;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  v === 'list' ? renderForm() : renderMine();
}

function upsert(item) {
  const i = items.findIndex((x) => x.id === item.id);
  i >= 0 ? (items[i] = item) : items.unshift(item);
}

$('#main').addEventListener('click', async (e) => {
  const button = e.target.closest('[data-suspend], [data-mark-sold], [data-cancel-listing]');
  if (!button) return;
  const itemId = Number(button.dataset.itemId || button.dataset.markSold || button.dataset.cancelListing || button.closest('.sec')?.dataset.itemId);
  const action = button.hasAttribute('data-suspend') ? 'suspend'
    : button.hasAttribute('data-mark-sold') ? 'sold' : 'cancel';
  if (action === 'cancel' && !window.confirm('Cancel this listing?')) return;
  if (action === 'sold' && !window.confirm('Mark this listing as sold? The current front-runner will be marked as the winner.')) return;
  button.disabled = true;
  try {
    let updated;
    if (action === 'suspend') updated = await api.suspendBid(itemId, button.dataset.suspend, sellerId);
    else if (action === 'sold') updated = await api.markSold(itemId, sellerId);
    else updated = await api.cancelListing(itemId, sellerId);
    upsert(updated);
    if (view === 'mine') renderMine();
    toast(action === 'suspend' ? 'Bid suspended; the next bidder has been asked to confirm.'
      : action === 'sold' ? 'Listing marked sold.' : 'Listing cancelled.');
  } catch (error) {
    toast(error.message);
  }
});

async function refresh() {
  try { items = await api.items(); $('#badge').textContent = mine().length ? `(${mine().length})` : ''; if (view === 'mine') renderMine(); } catch { /* retry on next reconnect */ }
}

document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => show(b.dataset.v)));

api.meta().then((m) => { meta = m; if (view === 'list') renderForm(); }).catch(() => {});
show('list');

api.subscribe({
  status(on) { $('#live').classList.toggle('on', on); $('#livetxt').textContent = on ? 'Live · connected to server' : 'Reconnecting…'; },
  open: refresh, // re-sync after every (re)connect
  'item:created'(item) { upsert(item); if (view === 'mine') renderMine(); else $('#badge').textContent = mine().length ? `(${mine().length})` : ''; },
  'bid:placed'({ item, bid }) {
    upsert(item);
    if (item.sellerId !== sellerId) return;
    flashId = item.id;
    toast(`New bid: ¥${bid.amount} on ${item.name} from ${bid.bidder}`);
    if (view === 'mine') renderMine();
  },
  'item:updated'(item) { upsert(item); if (view === 'mine') renderMine(); }
});
