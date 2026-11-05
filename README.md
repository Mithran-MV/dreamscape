# Dreamscape

Your brain deletes your dreams. Dreamscape keeps them.

Tell your phone a dream when you wake up, and it becomes a painting on your gallery wall. Overnight, your recent dreams become a short comic in your own words. Every piece is a name you own, you can sell numbered editions, and you can let family visit your gallery for a while.

Built at ETHGlobal Mumbai, November 5–7, 2026. Scaffolded with `create-next-app` and `forge init`.

The first two commits are generated: the `create-next-app` template, then the dependency pins, whose size is `pnpm-lock.yaml`, written by pnpm. Everything after that is written during the event in small commits.

## How it's built

- **0G Private Computer** for the AI. Transcription, tagging and the portrait run on sealed models, and every piece keeps its request ID.
- **0G Storage** for the encrypted files, and **0G Chain** (Galileo) for the day record.
- **ENSv2** on Sepolia, under `dream-scape.eth`, for gallery names, day records, editions and family passes.
- **Arkiv** (Rabdi testnet) for the public market, vendor agents and time-limited visits.

`SPEC.md` has the details. How AI tools were used to build this is in `AI_USE.md`.

## Run it

Needs Node 22 or later, pnpm and Foundry.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
pnpm dev
```

```bash
pnpm worker
```

```bash
pnpm check
```

`pnpm check` confirms the ENS deployment, the Arkiv network and the 0G router are reachable.

Open http://localhost:3000. The worker runs the painting, the nightly comic, living portraits and the World Dream. The 0G credit page (`/0g`) uses 0G's own sign-in, which 0G allows on `localhost:3000` only, so run the dev server on that port.

Contracts:

```bash
cd contracts && forge build && forge test
```

## Deployed

| Contract | Network | Address |
|---|---|---|
| `DreamscapeRegistry` (names under `dream-scape.eth`) | Ethereum Sepolia | [`0xCB61EabBFdb446a561A29814312F5ECB542d5C87`](https://sepolia.etherscan.io/address/0xCB61EabBFdb446a561A29814312F5ECB542d5C87) |
| `NightMarket` (checkout in Circle's USDC, and editions) | Ethereum Sepolia | [`0xD40165F204E4E1f8014d331e1d4c2CFe1eF904bC`](https://sepolia.etherscan.io/address/0xD40165F204E4E1f8014d331e1d4c2CFe1eF904bC) |
| USDC (Circle, testnet) | Ethereum Sepolia | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |

## Arkiv

The server wallet `0x55fF4c231f90585a06dfC877af6D3001d9cf1496` writes every listing, stall, vendor stall, commission, knock, visit and World Dream count on Rabdi, then hands each one to the dreamer, buyer, visitor or agent it belongs to. Dreamers' and agents' own wallets sign their later edits. The entities, their columns and expiry are in [`arkiv/schema.md`](arkiv/schema.md), and [`arkiv/how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md) walks through each feature.

Listings with the water theme at or under 10 USDC, cheapest first:

```bash
curl https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data @- <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":[
 "arkiv.schema = str('dreamscape.listing.v1') AND th_water = true AND priceUsdc <= u64(10000000) AND $creator = addr(0x55fF4c231f90585a06dfC877af6D3001d9cf1496) ORDER BY priceUsdc:u64 ASC",
 {"select":{"key":true,"owner":true,"creator":true,"expiresAt":true,"attributes":true},"limit":"0xa"}]}
EOF
```

Tests: `pnpm market:arkiv-test` writes and searches on a local Arkiv node in Docker, and `pnpm market:fork-test` runs a whole sale on a fork of Sepolia.

## License

MIT
