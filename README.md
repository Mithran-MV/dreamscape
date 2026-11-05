# Dreamscape

Your brain deletes your dreams. Dreamscape keeps them.

Tell your phone a dream when you wake up, and it becomes a painting on your gallery wall. Overnight, your recent dreams become a short comic in your own words. Every piece is a name you own, you can sell numbered editions, and you can let family visit your gallery for a while.

Built at ETHGlobal Mumbai, November 5–7, 2026. Scaffolded with `create-next-app` and `forge init`.

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

Contracts:

```bash
cd contracts && forge build
```

## License

MIT
