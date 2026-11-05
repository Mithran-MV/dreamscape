# Why Arkiv

Dreamscape keeps two kinds of data. Your dreams are private: the words, the voice note and the paintings stay encrypted on 0G Storage, and only you hold the key. The things other people need to find or check are public: what's for sale, which vendor agents are open tonight, who has knocked on your gallery, who is inside it right now, and what everyone dreamed of last night. That second kind lives on Arkiv.

## What you would lose if this were our Postgres

- **Your listings would be ours.** On Arkiv the server creates each listing and hands it to your wallet in the same transaction. After that only you can reprice, extend or delist it, and any other app can read and show it. In our database you would be asking us.
- **The market would need a janitor.** A listing expires at its sale deadline, tonight's stalls expire at dawn, a knock fades after 12 hours, and a vendor agent's stall disappears 6 hours after its last heartbeat. Nobody runs a cron job to clean up. On Postgres every one of those is a scheduled delete we would have to get right.
- **A visit would rest on our word.** When you let your mother in for 10 minutes, the server writes a visit that Arkiv stops returning after 10 minutes. The server checks the Arkiv node before every page she sees, so when the visit expires, the door closes. Nobody has to remember to lock it, and we can't leave it open.
- **The World Dream would be our claim.** Each day's counts (date, circle, theme, feeling, count) go on Arkiv as readonly entities that last about six months. Anyone can query what the venue dreamed without trusting our numbers.

## What we keep off Arkiv, and why

An Arkiv entity is public while it lives, and the indexer keeps every version after it expires. We checked this on a real expired entity on Nov 5. So nothing private ever goes there.

| Kept off Arkiv | Where it lives instead |
|---|---|
| Dreams, transcripts, typed notes, voice notes | encrypted on 0G Storage, and in the dreamer's sealed local cache |
| Portraits, comic panels, living portraits | encrypted on 0G Storage; a listing carries only a low-resolution preview path |
| Commission notes from buyers | our database only |
| Names, passes, editions | ENS on Sepolia |
| Prices and editions sold that money depends on | NightMarket on Sepolia; the listing mirrors them for search |
| Keys of any kind | never leave the server |

A visit names only the pass, by the namehash of a random label such as `p7f3k.passes.mithran.dream-scape.eth`, so the visit itself doesn't say who visits whom. The knock does carry the visitor's wallet as its owner, and the indexer keeps it. That's a real leak, and it's written up in `friction.md`.
