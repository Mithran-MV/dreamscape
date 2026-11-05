# Dreamscape: spec

Written at the start of ETHGlobal Mumbai (Nov 5, 2026). This is the spec the coding assistant works from; it changes as the build goes.

## The idea

You forget most dreams within minutes of waking. Dreamscape keeps them. Each morning you hold one button and tell your phone what you dreamed. The app turns it into a painting on your gallery wall. Overnight it turns your recent dreams into a short comic in your own words, and a portrait that moves. You own each piece as a name, you can sell numbered editions, and you can let family visit your gallery for a while.

## Surfaces

- **Phone (installable web app):** one screen. Hold to record or type, pick a feeling, lock the phone. Notifications when the painting is ready and when last night's drafts are waiting.
- **Website (same codebase):** the gallery wall, each day's page, drafts to approve, the market, passes and visits, the World Dream, settings.

## The daily loop

1. **Capture:** a voice note or one line of text, plus a one-tap feeling.
2. **Background pipeline:** transcribe, tag, paint a portrait, encrypt and store the files, record the day, notify.
3. **Nightly run** (opt-in, before the daily credit reset): link the dream to earlier ones, write a 4-panel comic script, draw textless panels, letter them in the app, and animate the portrait with whatever credit is left.
4. **Morning:** approve or discard the drafts. Approved pieces can be listed for sale.

## Components

| Part | Technology | What it does |
|---|---|---|
| AI | 0G Private Computer (OpenAI-compatible router) | `whisper-large-v3`, `0gm-1.0-35b-a3b` and `z-image-turbo` run sealed for the raw dream. `tencent/hy-image-3.5-preview` draws comic panels and `bytedance/seedance-2.0` animates portraits, from scene descriptions only. Every response's `request_id` is stored with the piece |
| Files | 0G Storage (TS SDK, AES-256) | Encrypted dreams, voice notes, portraits, comics, videos |
| Proof | `DreamRegistry` on 0G Galileo | Anchors each day: root hash, owner, model, request ID |
| Credits | iAI and 0G Pay | "Sign in with 0G" on localhost shows the balance going down as dreams become art; background jobs use a scoped key |
| Names | ENSv2 on Sepolia, under `dream-scape.eth` | A gallery name and Permissioned Resolver for each dreamer; day records on names with no registry entry, written by a scribe limited to three keys; editions as forever subnames; family passes that expire, can't be transferred and can be revoked; vendor agents as namespaces with ENSIP-25/26 records |
| Market and visits | Arkiv (Rabdi testnet, SDK 1.0.1) | Listings that expire at their sale deadline, vendor-agent leases, commission requests, bids and claims, knocks and time-limited visits, World Dream counts |
| Checkout | `NightMarket` on Sepolia | USDC checkout, the split, edition minting, commission delivery |

## Rules the code must keep

- Raw dreams, voice notes and keys never go on Arkiv or ENS. Both are public, and Arkiv keeps an entity's history after it expires.
- Visit checks read the Arkiv node, never the indexer. The server decrypts pages itself and never sends a dreamer's key to a visitor.
- Only sealed 0G providers see the raw dream. If none is free, the step waits; it never falls back.
- Discover ENS addresses at runtime from the Universal Resolver. Never hard-code a resolver.
- No secrets in the repo. `.env.example` lists the names.

## Milestones

| Hour | Done when |
|---|---|
| H5 | Speak into the phone, and a portrait comes back with a request ID, a root hash and a Verified badge |
| H8 | Record on the phone, lock it, and the frame fills in on the laptop |
| H17 | Dream, nightly comic, publish, end to end |
| H24 | Find a piece through an Arkiv search, buy an edition in USDC, and the buyer holds the edition name |
| H30 | A family visit: knock, let in for 10 minutes, see the slice, door closes by itself |
| H33 | Feature freeze |
