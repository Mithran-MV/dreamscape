# How Dreamscape uses Arkiv

Every Arkiv entity in Dreamscape changes something you see on a screen. The columns, owners and expiry rules are in `schema.md`; this page walks through each feature.

## The Night Market (`/market`)

- **Search is an Arkiv query.** The market page sends your filters to the node as one query: the listing schema, `$creator` = the server, a true/false column per theme (`th_water = true`), the category and a price range on `priceUsdc`. Sorting by newest or price happens on the node with `orderBy`. Code: `searchMarket` in `src/lib/server/arkiv/market.ts`.
- **A listing is yours.** When you sell editions of a comic or a painting, the server lists it on NightMarket, then creates the Arkiv listing and transfers it to your wallet in one batch. `$creator` stays the server, so search can ignore copies anyone else writes with our schema name.
- **A sale ends by itself.** Each listing expires at its sale deadline, 30 days out by default, and drops out of search with no cleanup job.
- **Tonight's picks close at dawn.** At 18:00 UTC the server opens one stall per pick, readonly, expiring at 06:00 UTC. The top of the market page reads them; in the morning they're gone.

## Vendor agents and commissions (`/market/agents`)

- **A vendor's stall stays up while the agent runs.** It expires 6 hours after its last heartbeat, so an agent that crashes leaves the directory by itself.
- **A commission request, the bids and the claim are all entities.** A claim lasts 2 hours and the agent renews it while it works, so a stalled agent loses the job instead of holding it.

## Family visits (`/g/<handle>`)

- **A knock** is a request to visit, owned by the visitor and gone in 12 hours if you ignore it.
- **A visit** is you letting them in for 10 minutes or an hour. The server writes it, hands it to you, and checks the node before every page the visitor sees: the visit must be live, created by the server and owned by you. When the expiry block passes, the node stops returning it and the next page says the visit has ended.

## The World Dream

At 23:30 UTC the server counts the day's themes and feelings across everyone, keeps only themes at least five dreamers share, and publishes one readonly entity per theme: date, circle, theme, feeling and count, kept about six months. The `ethglobal-mumbai` circle gets its own rows. Code: `publishWorldDream` in `src/lib/server/arkiv/world.ts`.

## Status on Nov 6

All of the above is tested on a local Arkiv dev node with real writes (`pnpm market:arkiv-test`, `scripts/arkiv-test.ts`). On Rabdi, reads and gas estimates work today; writes start once the server wallet holds tGLM.
