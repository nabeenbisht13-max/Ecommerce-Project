// Tiny JSON-file store. Swap this module for a real database later;
// server.js only depends on the functions exported here.
const fs = require('fs');
const path = require('path');
const { DATA_FILE } = require('../config');

let db = { nextId: 1, items: [] };
const isActiveListing = (item) => item.status === undefined || item.status === 'active';

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[store] could not read data file, starting empty:', e.message);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE); // atomic replace
  } catch (e) {
    console.error('[store] save failed:', e.message);
  }
}

const eligibleBids = (item) =>
  item.bids.filter((bid) => (bid.status === undefined || bid.status === 'active') && bid.interest !== 'declined');
const rankedBids = (item) => eligibleBids(item).slice().sort((a, b) => b.amount - a.amount || a.at - b.at);
const topBid = (item) => {
  const bids = eligibleBids(item);
  return bids.length ? Math.max(...bids.map((b) => b.amount)) : null;
};

function promptNextBidder(item) {
  const bid = rankedBids(item).find((candidate) => candidate.interest !== 'declined' && candidate.bidderId);
  item.pendingBidId = bid ? bid.id : null;
  if (bid) bid.interest = 'requested';
  return bid || null;
}

function listItems() {
  return db.items.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function getItem(id) {
  return db.items.find((i) => i.id === id);
}

function addItem(data) {
  const item = {
    id: db.nextId++, ...data, status: 'active', bids: [], pendingBidId: null, frontRunnerBidId: null, createdAt: Date.now()
  };
  db.items.push(item);
  save();
  return item;
}

function addBid(id, { bidder, bidderId, amount }) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  if (!isActiveListing(item)) return { error: 'This listing is no longer active', status: 409 };
  const bid = {
    id: `${id}-${item.bids.length + 1}`, bidder, bidderId, amount, at: Date.now(),
    status: 'active', interest: 'unasked'
  };
  item.bids.push(bid);
  if (item.pendingBidId) {
    const pending = item.bids.find((candidate) => candidate.id === item.pendingBidId);
    if (pending && bid.amount > pending.amount) {
      pending.interest = 'unasked';
      item.pendingBidId = bid.id;
      bid.interest = 'requested';
    }
  } else {
    const frontRunner = item.bids.find((candidate) => candidate.id === item.frontRunnerBidId);
    if (!frontRunner || bid.amount > frontRunner.amount) item.frontRunnerBidId = bid.id;
  }
  save();
  return { item, bid };
}

function respondToInterest(id, bidId, bidderId, interested) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  const bid = item.bids.find((candidate) => candidate.id === bidId);
  if (!isActiveListing(item)) return { error: 'This listing is no longer active', status: 409 };
  if (!bid || bid.bidderId !== bidderId || item.pendingBidId !== bidId || bid.interest !== 'requested')
    return { error: 'This interest request is no longer active', status: 409 };

  item.pendingBidId = null;
  if (interested) {
    bid.interest = 'interested';
    item.frontRunnerBidId = bid.id;
  } else {
    bid.interest = 'declined';
    item.frontRunnerBidId = null;
    promptNextBidder(item);
  }
  save();
  return { item, bid };
}

function suspendBid(id, bidId, sellerId) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  if (item.sellerId !== sellerId) return { error: 'You cannot update this listing', status: 403 };
  const bid = item.bids.find((candidate) => candidate.id === bidId);
  if (!isActiveListing(item)) return { error: 'This listing is no longer active', status: 409 };
  if (!bid || (bid.status !== undefined && bid.status !== 'active'))
    return { error: 'This bid is not active', status: 409 };
  if (item.pendingBidId)
    return { error: 'Resolve the current interest request before suspending a bid', status: 409 };
  if (item.frontRunnerBidId && item.frontRunnerBidId !== bidId)
    return { error: 'Only the current front-runner bid can be suspended', status: 409 };
  const highest = rankedBids(item)[0];
  if (!highest || highest.id !== bidId)
    return { error: 'Only the highest active bid can be suspended', status: 409 };

  bid.status = 'suspended';
  item.frontRunnerBidId = null;
  const next = promptNextBidder(item);
  save();
  return { item, bid, next };
}

function markSold(id, sellerId) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  if (item.sellerId !== sellerId) return { error: 'You cannot update this listing', status: 403 };
  if (!isActiveListing(item)) return { error: 'This listing is no longer active', status: 409 };

  item.status = 'sold';
  item.soldAt = Date.now();
  item.pendingBidId = null;
  const winnerId = item.frontRunnerBidId || rankedBids(item)[0]?.id;
  item.bids.forEach((bid) => {
    if (bid.id === winnerId && (bid.status === undefined || bid.status === 'active')) bid.status = 'won';
    else if (bid.status === undefined || bid.status === 'active' || bid.status === 'suspended') bid.status = 'lost';
    if (bid.interest === 'requested') bid.interest = 'unasked';
  });
  item.frontRunnerBidId = winnerId && item.bids.some((bid) => bid.id === winnerId && bid.status === 'won')
    ? winnerId : null;
  save();
  return { item };
}

function cancelListing(id, sellerId) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  if (item.sellerId !== sellerId) return { error: 'You cannot update this listing', status: 403 };
  if (item.status !== 'active') return { error: 'This listing is no longer active', status: 409 };

  item.status = 'cancelled';
  item.cancelledAt = Date.now();
  item.pendingBidId = null;
  item.frontRunnerBidId = null;
  item.bids.forEach((bid) => {
    if (bid.status === undefined || bid.status === 'active' || bid.status === 'suspended') bid.status = 'listing_cancelled';
    if (bid.interest === 'requested') bid.interest = 'unasked';
  });
  save();
  return { item };
}

function cancelBid(id, bidId, bidderId) {
  const item = getItem(id);
  if (!item) return { error: 'Item not found', status: 404 };
  const bid = item.bids.find((candidate) => candidate.id === bidId);
  if (!bid || bid.bidderId !== bidderId) return { error: 'You cannot cancel this bid', status: 403 };
  if (!isActiveListing(item) || (bid.status && bid.status !== 'active' && bid.status !== 'suspended'))
    return { error: 'This bid can no longer be cancelled', status: 409 };

  const wasPending = item.pendingBidId === bidId;
  const wasFrontRunner = item.frontRunnerBidId === bidId;
  bid.status = 'cancelled';
  bid.interest = 'unasked';
  if (wasPending) item.pendingBidId = null;
  if (wasFrontRunner) item.frontRunnerBidId = null;
  if ((wasPending || wasFrontRunner) && !item.pendingBidId) promptNextBidder(item);
  save();
  return { item, bid };
}

load();
module.exports = {
  listItems, getItem, addItem, addBid, respondToInterest, suspendBid,
  markSold, cancelListing, cancelBid, topBid
};
