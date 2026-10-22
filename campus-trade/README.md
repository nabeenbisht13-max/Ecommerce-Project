# HUST Campus Trade – iterative marketplace

Five processes on separate localhost ports. Seller and buyers never talk to each other directly; everything goes through the common server. Three buyer pages run independently so you can test the full bid-suspension order with multiple consumers.

| Process  | Port | Role |
|----------|------|------|
| `server`   | 3000 | Common channel: REST API + live event stream (SSE), JSON-file storage |
| `seller`   | 3001 | **User 1** – lists items with description and original price, sees bids live |
| `consumer` | 3002 | **Buyer 1** – browses listings, places bids, tracks them on the Me Page |
| `consumer` | 3003 | **Buyer 2** – independent buyer session |
| `consumer` | 3004 | **Buyer 3** – independent buyer session |

## Run

Requires Node.js 18+. No `npm install` needed (zero dependencies).

```bash
npm start            # starts all three
# or individually, in three terminals:
npm run server
npm run seller
npm run consumer
```

Open http://localhost:3001 (seller) and http://localhost:3002, http://localhost:3003, and http://localhost:3004 (three independent buyers) side by side. Each port has its own browser storage and buyer identity.
Publish an item (with optional photos) on the seller side → it appears on the consumer side instantly → place bids at any amount → track and filter bids on the Me Page. Sellers can suspend a top bid, mark a listing sold, or cancel a listing. Buyers can cancel their own bids.

```bash
npm test             # end-to-end smoke test on ports 4100-4102
```

## Docker

```bash
docker compose up --build
```

Ports 3000-3004; listing data is kept in the `trade-data` volume. Or run all five processes in one container:
`docker build -t campus-trade . && docker run -p 3000-3004:3000-3004 campus-trade`.

## Structure

```
campus-trade/
├── config.js                 ports, CORS, categories, data file (env-overridable)
├── start-all.js              launches the server, seller, and three consumer processes
├── server/
│   ├── server.js             REST + SSE endpoints, validation, broadcasting
│   └── store.js              JSON-file persistence (swap for a DB later)
├── seller/
│   ├── server.js             serves the seller UI on :3001
│   └── public/{index.html,app.js}
├── consumer/
│   ├── server.js             serves the consumer UI on :3002
│   └── public/{index.html,app.js}
├── shared/
│   ├── static-server.js      tiny static file server used by both UIs
│   ├── api.js                browser client: fetch helpers + EventSource
│   └── styles.css            look & feel from the prototype
├── test/smoke.js
├── data/                     db.json is created here at runtime
├── Dockerfile  docker-compose.yml  .dockerignore  .env.example  .gitignore
└── package.json
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/items` | all listings, newest first (each includes its `bids`) |
| POST | `/api/items` | `{name, price, category, condition, description, seller, sellerId, photos?}` |
| POST | `/api/items/:id/sold` | `{sellerId}` – marks the listing sold and records its front-runner as the winner |
| POST | `/api/items/:id/cancel` | `{sellerId}` – cancels the listing and ends its active bids |
| POST | `/api/items/:id/bids` | `{bidder, bidderId, amount}` – any valid positive amount is accepted |
| POST | `/api/items/:id/bids/:bidId/suspend` | Seller suspends the front-runner bid and asks the next eligible bidder to confirm interest |
| POST | `/api/items/:id/bids/:bidId/cancel` | `{bidderId}` – buyer cancels their own active or suspended bid |
| POST | `/api/items/:id/bids/:bidId/interest` | `{bidderId, interested}` – buyer responds to an active request; declining automatically prompts the next bidder |
| GET  | `/api/events` | SSE stream: `item:created`, `bid:placed`, `item:updated` |
| GET  | `/health` | liveness check |

## Deployment notes

- Set `CORS_ORIGIN` to the real seller/consumer origins (comma-separated) instead of `*`.
- The UIs reach the server at `<same hostname>:SERVER_PORT`. Behind a reverse proxy, either expose port 3000 or change the `base` line in `shared/api.js` to a path like `/api`.
- If a proxy sits in front of the server, disable response buffering for `/api/events` (the server already sends `X-Accel-Buffering: no` for nginx).
- Identity is a random per-browser id plus a typed name. There is no login yet.
- Photos are optional and limited to four JPEG, PNG, WebP, or GIF images of at most 1 MB each. The buyer id keeps the Me Page scoped to bids placed from that browser.
- The Me Page filters bids by ongoing, suspended, won, and ended state. Marking a listing sold marks the front-runner as won and other active bids as lost; cancelled listings are removed from the active market.

## Next iterations (suggested)

1. Seller **accept / decline** a bid (the prototype's "accepts or declines in the app" flow), plus "Buy now".
2. Edit/delete listings.
3. Rent mode from the prototype (hourly price, deposit, owner rules).
4. Real accounts and a database.
