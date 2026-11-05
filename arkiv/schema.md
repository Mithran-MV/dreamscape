# Arkiv schema

Every entity Dreamscape writes to Arkiv: Rabdi testnet (chain 7794095), `@arkiv-network/sdk` 1.0.1. The code is in `src/lib/server/arkiv/` (`schemas.ts` defines the columns; `market.ts`, `agents.ts`, `visits.ts` and `world.ts` write and query them).

## Rules every entity follows

- **Public, and kept after expiry.** Anyone can read a live entity, and the indexer keeps every version of it after it expires or is deleted. So no entity holds a dream, a transcript, a voice note, an image link that decrypts, a key, or personal data. Those stay encrypted on 0G Storage.
- **Versioned names.** Each schema has a name such as `dreamscape.listing.v1`. The SDK writes it as the indexed attribute `arkiv.schema`, and every query filters on it.
- **Filtered by who wrote it.** Anyone can write an entity with our schema name, so every query also filters on `$creator` (the server wallet), or on `$creator = $owner` for entities an agent signs.
- **Index only what a screen filters on.** Sorting works on any non-bytes column, indexed or not.
- **Created by the server, owned by the user.** Where an entity belongs to a dreamer, buyer, visitor or agent, the server creates it and hands it over in the same `executeBatch`: it predicts the key with `predictEntityKeys`, creates with that salt, and transfers that key. `$creator` stays the server and `$owner` becomes the user. The server's writes run one at a time so the prediction holds; if another process takes the nonce first, the whole batch is refused and the server predicts again.
- **Access checks read the node, never the indexer.** The node stops returning an entity at its expiry block; the indexer doesn't.

## Wallets that write

| Wallet | Writes |
|---|---|
| Server, `0x55fF4c231f90585a06dfC877af6D3001d9cf1496` | creates every listing, stall, vendor stall, commission, knock, visit and World Dream count |
| Each dreamer's wallet | patches, extends or deletes their own listings; ends visits early |
| Each vendor agent's wallet | heartbeats on its stall, bids, claims |
| Each buyer's wallet | awards their commission |

## Listing: `dreamscape.listing.v1`

A piece for sale in the Night Market.

- **Creator:** the server, after NightMarket lists the piece. **Owner:** the dreamer. There is no separate dreamer column: `$owner` is the dreamer.
- **Expires:** at the sale deadline (`ExpirationTime.atDate(saleEndsAt)`), 30 days after listing by default and at most about 182 days. A sale that has ended leaves search by itself. The dreamer can push it out with `extendSale`, which moves the expiry and `saleEndsAt` together.
- **Who edits:** only the dreamer's wallet: `recordSale` (editions sold), `setPrice`, `extendSale`, `delist`. After the hand-over the server can't patch it; the engine refuses with `NotOwner`.
- **What it isn't:** the price and sold count that matter are NightMarket's. The listing mirrors them for search, and since its owner can patch it to anything, checkout always reads NightMarket.

| Column | Type | Indexed | For |
|---|---|---|---|
| `pieceId` | key | yes | NightMarket's `bytes32` piece id; finds the listing to update after a sale |
| `category` | str | yes | comic, portrait, saga, living or world |
| `priceUsdc` | u64 | yes | price in USDC, 6 decimals; range filter and price sort |
| `editionsTotal` | i32 | no | "3 of 10 left" |
| `editionsSold` | i32 | no | "3 of 10 left" |
| `soldOut` | bool | yes | the "available only" filter |
| `sellerEns` | str | yes | the dreamer's ENS name; filter by dreamer |
| `style` | str | yes | art style filter |
| `sagaLength` | i32, optional | yes | saga length filter |
| `sealed` | bool | yes | the Verified filter: made in 0G's sealed mode |
| `listedAt` | u64 | yes | unix seconds; "newest" sort and "listed tonight". `$createdAt` can't be sorted on |
| `saleEndsAt` | u64 | no | unix seconds, shown on the listing |
| `title` | str | no | the approved title, cut to 128 bytes |
| `model` | str | no | which 0G model made it |
| `previewRef` | str, optional | no | the public low-resolution preview, never the full file |
| `th_water` … `th_night` | bool, optional | yes | one column per theme, because the query language has no "contains". Only true ones are written. Themes: water, flight, falling, chase, home, animals, people, school, city, nature, fantasy, night |

Queries: `searchMarket` (any of the chosen themes, category, seller, price range, sealed, available; sorted by price either way or newest first; 24 a page with a total), `getListing`, `listingForPiece`.

## Stall: `dreamscape.stall.v1`

Tonight's picks in the Night Market.

- **Creator and owner:** the server. **Flags:** `readonly`.
- **Expires:** at the next 06:00 UTC. The shelf empties itself at dawn, so buyers come back the next night.

| Column | Type | Indexed | For |
|---|---|---|---|
| `listing` | key | yes | the listing on show |
| `night` | str | yes | `YYYY-MM-DD` of the evening, UTC |
| `slot` | i32 | no | order on the shelf |

Query: `tonightsStalls` reads tonight's stalls in slot order, then the listings they point to by `$key`.

## Vendor stall: `dreamscape.vendor.v1`

A vendor agent's menu in the agent directory.

- **Creator:** the server, once the agent is bound to its owner in NightMarket, so `$creator` marks agents Dreamscape vouches for. **Owner:** the agent's wallet.
- **Expires:** 6 hours after the last heartbeat. Each hour the running agent sends `heartbeat` from its own wallet: one batch that sets `lastBeat` and extends the entity to 6 hours from now. An agent that stops drops out of the directory on its own.

| Column | Type | Indexed | For |
|---|---|---|---|
| `ens` | str | yes | the agent's ENS name |
| `style` | str | yes | style filter |
| `fromPriceUsdc` | u64 | yes | "from" price; cheapest first |
| `does_comic`, `does_portrait`, `does_saga`, `does_living` | bool | yes | one column per service |
| `open` | bool | yes | taking work right now |
| `menu` | bytes | no | the public menu as JSON, at most 8 KB |
| `lastBeat` | u64 | no | unix seconds of the last heartbeat |

Query: `liveVendors` (open, by service, under a price), cheapest first.

## Commission request: `dreamscape.commission.v1`

A buyer asking vendor agents for a one-of-one piece.

- **Creator:** the server. **Owner:** the buyer, the only one who can award it.
- **Expires:** at its deadline. After that NightMarket refunds any escrow, so the request shouldn't be open anywhere.

| Column | Type | Indexed | For |
|---|---|---|---|
| `kind` | str | yes | which service |
| `budgetUsdc` | u64 | yes | budget filter |
| `status` | str | yes | `open` or `awarded`; the board shows open ones |
| `buyerEns` | str, optional | yes | the buyer's ENS name |
| `deadline` | u64 | no | unix seconds; closing-soonest sort, and the bids' expiry |
| `awardedBid` | key, optional | no | the winning bid, set by the buyer with `awardCommission` |
| `brief` | bytes | no | a short public brief, at most 1 KB, as the buyer writes it |

Query: `openCommissions` (by kind), closing soonest first.

## Bid: `dreamscape.bid.v1`

- **Creator and owner:** the agent's wallet.
- **Expires:** at the commission's deadline, read from the commission when the bid is placed. Bids go when the request goes.

| Column | Type | Indexed | For |
|---|---|---|---|
| `commission` | key | yes | which request |
| `vendorEns` | str | yes | the agent's ENS name |
| `priceUsdc` | u64 | yes | cheapest first |
| `etaHours` | i32 | no | promised turnaround |

Query: `bidsFor` lists bids on one commission, cheapest first, and keeps only bids whose `$creator` and `$owner` are the same agent and that agent owns a live vendor stall the server created.

## Claim: `dreamscape.claim.v1`

"Working on it", from the awarded agent.

- **Creator and owner:** the agent's wallet.
- **Expires:** 2 hours after the last `renewClaim`, which the agent sends while it works. If the agent dies mid-job, the claim lapses and the job shows as free again.

| Column | Type | Indexed | For |
|---|---|---|---|
| `commission` | key | yes | which request |
| `vendorEns` | str | yes | shown as "in progress by …" |

Query: `activeClaim(commission, agent)`.

## Knock: `dreamscape.knock.v1`

A pass holder asking to visit a gallery.

- **Creator:** the server. **Owner:** the visitor's wallet.
- **Expires:** 12 hours. An ignored knock disappears by itself.
- **What it reveals:** the visitor's wallet (`$owner`), the dreamer's wallet (`host`) and when. Pass ownership is already public on ENS; the knock adds that a knock happened, and the indexer keeps that after the 12 hours.

| Column | Type | Indexed | For |
|---|---|---|---|
| `pass` | key | yes | namehash of the visitor's ENS pass. Pass labels are random, so the name says nothing about the relationship |
| `host` | addr | yes | the dreamer whose gallery it is; the dreamer's "who's knocking" query |
| `scope` | str | no | the scope asked for |

Query: `openKnocks(host)`, newest first and one per pass, leaving out knocks a live visit answers (through `Visit.knock`) or that the app lists as answered. Only the visitor can delete a knock, so after a short visit ends its knock would show again until it fades; the app passes answered knock keys in `exclude`.

## Visit: `dreamscape.visit.v1`

"You may come in now."

- **Creator:** the server, when the dreamer lets a pass in. **Owner:** the dreamer.
- **Expires:** when the visit ends: 10 minutes, 1 hour or midnight, as the dreamer picks (the code allows up to 24 hours). The expiry is what closes the door: no job, no button. The dreamer can end it early with `endVisit`, which deletes it from the dreamer's wallet. The visitor can't edit or delete it.
- **What it holds:** a permission record only. Never a dream, an image link or a key. The server decrypts the pass's slice for each page itself.

| Column | Type | Indexed | For |
|---|---|---|---|
| `pass` | key | yes | the pass let in, by namehash. The visitor's address isn't stored |
| `host` | addr | yes | the dreamer |
| `scope` | str | no | `gallery`, `published` or `saga:<id>` (an id, never a saga's title) |
| `knock` | key, optional | no | the knock it answers |
| `endsAt` | u64 | no | unix seconds; the visitor's countdown |

**The access check**, `activeVisit(dreamer, pass)`, runs before every page a visitor sees. It queries the node for a visit with that `pass` and `host`, owned by the dreamer and created by the server, latest expiry first. It grants nothing when there is no row, when `$expiresAt` is at or below the block the query read, when `endsAt` has passed, or when the scope isn't one the app knows. Checking that the visitor owns the pass on ENS is a separate step.

## World Dream count: `dreamscape.worlddream.v1`

One shared theme from one day, with no words.

- **Creator and owner:** the server. **Flags:** `readonly`.
- **Expires:** the longest Arkiv allows, about 182.5 days (`ExpirationTime.max()`). It's a public record people can search; a year isn't possible, and the server can extend it later.
- **Privacy:** one entity per date, circle and theme. A theme is published only when at least 5 dreamers share it that day; `publishWorldDream` refuses smaller counts, and refuses a second publish for the same date and circle.

| Column | Type | Indexed | For |
|---|---|---|---|
| `date` | str | yes | `YYYY-MM-DD`, UTC |
| `circle` | str | yes | `world`, or an event or family code such as `ethglobal-mumbai` |
| `theme` | str | yes | a theme from the list above |
| `feeling` | str | yes | the feeling most of those dreamers tapped: wonder, joy, calm, confused, scared or sad |
| `count` | i32 | yes | how many dreamers shared the theme |

Query: `worldDream(date, circle)`, most shared first.

## Kept off Arkiv

- Dreams, transcripts, voice notes, portraits, comics, videos and the dream log: encrypted on 0G Storage.
- Keys of any kind.
- Passes, the relationship behind a visit: ENS.
- Payments, escrow, edition ownership, and the price and sold count checkout trusts: NightMarket and ENS.

## A query to run

Listings with the water theme at or under `priceUsdc` 10000000 (6 decimals), cheapest first, created by the server:

```bash
curl https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data @- <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":[
 "arkiv.schema = str('dreamscape.listing.v1') AND th_water = true AND priceUsdc <= u64(10000000) AND $creator = addr(0x55fF4c231f90585a06dfC877af6D3001d9cf1496) ORDER BY priceUsdc:u64 ASC",
 {"select":{"key":true,"owner":true,"creator":true,"expiresAt":true,"attributes":true},"limit":"0xa"}]}
EOF
```
