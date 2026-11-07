# How Dreamscape uses ENS

Everything below is live on Ethereum Sepolia under `dream-scape.eth`, on the ENSv2 contracts. Addresses come from the Universal Resolver at runtime; nothing about ENS's own deployment is hard-coded beyond the resolver and the implementation contracts. `pnpm check` confirms the deployment hasn't moved.

## The name tree

| Name | What it is | How it's controlled |
|---|---|---|
| `dream-scape.eth` | the app's name | its owner mounted `DreamscapeRegistry` under it, emancipated at birth |
| `mithran.dream-scape.eth` | a dreamer's gallery | registered by the server to the dreamer's wallet; the dreamer holds every role on its own Permissioned Resolver |
| `2026-11-05.mithran.dream-scape.eth` | one day of dreams | **no registry entry at all**: the gallery's resolver answers for it by wildcard |
| `the-sea-roof-1.mithran.dream-scape.eth` | an edition of a piece | minted by NightMarket to the buyer at the sale, with no expiry, in the dreamer's emancipated editions registry |
| `p7f3k.passes.mithran.dream-scape.eth` | a family pass | owned by the visitor, can't be transferred, expires in 30 days, revocable by the dreamer |
| `portraits.market.dream-scape.eth` | a vendor agent | its own resolver; the agent's key may change only two records |

## Features, and where to see them

- **Wildcard resolution.** Day records live on names nobody registered. The gallery's resolver serves `dreamscape.root`, `dreamscape.saga`, `dreamscape.date` and `dreamscape.scope` for any date, and any ENS client resolves them through the Universal Resolver. The day view reads them live and shows them. Code: `src/lib/server/ens/days.ts`.
- **A registry with its own rules.** `DreamscapeRegistry` ([`0xCB61…5C87`](https://sepolia.etherscan.io/address/0xCB61EabBFdb446a561A29814312F5ECB542d5C87)) is emancipated, so the app can't take a gallery name back. Each dreamer also gets an editions registry and a passes registry.
- **Editing only certain text records.** The scribe account `0x6D58…8Db5` writes each day's four records. It holds setter roles for exactly those keys and nothing else: it can't set `avatar`, `url` or the address, and the test proves the refusal (`EACUnauthorizedAccountRoles`). The server drops its own roles on the resolver after onboarding.
- **A Permissioned Resolver per subname.** Every dreamer and every vendor agent has a resolver of its own, so each name owns its data.
- **Expiring, revocable, non-transferable names.** Passes are registered with no transfer role and a 30-day expiry. A safe transfer fails with `TransferUnsafeUntilRegistryIsEmancipated`, and only the dreamer's wallet can unregister one. The visitor's page checks the pass with `findExactOwner` before every page.
- **Transferable forever names.** Editions are minted with no expiry and only the transfer role, in a registry nobody can change. Who may open the full piece is read from ENS on every request, so giving the edition away moves access with it.
- **Agents as namespaces.** `portraits.market.dream-scape.eth` carries `addr` (the human owner, who is paid), `agent-context`, `agent-endpoint[web]` and `prices`. The agent's own key may set only `agent-context` and `prices`; the agent page shows its refused attempts.

## Live examples

| What | Link |
|---|---|
| A gallery name | [mithran.dream-scape.eth](https://sepolia.app.ens.domains/mithran.dream-scape.eth), [mithran-12.dream-scape.eth](https://sepolia.app.ens.domains/mithran-12.dream-scape.eth) |
| A day record written by the scribe | [transaction](https://sepolia.etherscan.io/tx/0x145ef83072bed10369611659ba3af5880a9c68608292044694183beb48a03ea9) |
| `dreamscape.root` on `2026-11-06.mithran-12.dream-scape.eth`, set to that day's record on 0G Storage | [the TextUpdated log](https://sepolia.etherscan.io/tx/0xea5b188bd27f6209f96603bc0293530fbd19eca4040bf0823f5e635051625240#eventlog) |
| An edition bought from another wallet, minted by NightMarket to the buyer | [transaction](https://sepolia.etherscan.io/tx/0x4a82639e708b4166196371cc6ff8b55c86f3815a3b7c40649f0413530806a079) |
| That buyer giving an edition to a friend (`melody-among-silent-ston-1.mithran.dream-scape.eth`) | [ERC-1155 transfer](https://sepolia.etherscan.io/tx/0xc15bbca62225e97dc25159fe9b686ec2c3e561bc47da8ebca23f2f0db66b8bb9) |
| A pass to mithran-12's gallery, minted to the friend (`pysk7.passes.mithran-12.dream-scape.eth`) | [transaction](https://sepolia.etherscan.io/tx/0x943e3f58e5716ba9c3052c0d8af3a62f228b0cd120977048f4928620388791bf) |
| The vendor agent's resolver | [`0x1f05…4177`](https://sepolia.etherscan.io/address/0x1f05D35450C20BeA5380710D3D5792952C324177) |
| NightMarket, which mints editions | [`0xD401…04bC`](https://sepolia.etherscan.io/address/0xD40165F204E4E1f8014d331e1d4c2CFe1eF904bC) |

The ENS app opens registered names such as the gallery. It can't open a day name, because the day name was never registered; resolve it through the Universal Resolver instead.

## Tests

On a local fork of Sepolia, against the real ENS contracts:
- `pnpm ens:fork-test`: bootstrap, onboarding, wildcard day records, and the scribe's limits;
- `pnpm passes:fork-test`: grant, can't transfer, revoke, expire;
- `pnpm market:fork-test`: an edition minted to a buyer, then given away;
- `pnpm commission:fork-test`: the agent namespace and a delivered one-of-one name.
