# Arkiv feedback

What got in the way while building Dreamscape on Arkiv (Rabdi testnet, `@arkiv-network/sdk` 1.0.1), written down the moment it happened. Each item links the issue filed on `Arkiv-Network/reported-issues` where there is one.

## Items

<!--
### Short title
- **Where:** SDK / RPC / docs / explorer / faucet, with versions
- **Expected:**
- **What happened:**
- **Reproduce:** a command or a minimal script in `arkiv/repro/`
- **Impact:**
- **Workaround:**
- **Suggested fix:**
- **Issue:** link
-->

### 2026-11-05: The access key in the RPC URL ends up in error messages
- **Where:** SDK 1.0.1 `rabdi({ accessKey })` with viem 2.57.16 `http()`, Rabdi RPC
- **Expected:** a key the docs ask us to keep on the server stays out of logs.
- **What happened:** `rabdi()` puts the key in the URL path, and viem prints the URL in every request error. viem strips only `user:pass@` credentials, so any logged RPC failure (a timeout, a 429, a 401) prints the key.
- **Reproduce:**
  ```ts
  const client = createPublicClient({ chain: rabdi({ accessKey: "not-a-real-key-123" }), transport: http(undefined, { retryCount: 0 }) })
  await client.getBlockNumber()
  // HttpRequestError … Status: 401 … URL: https://rpc.rabdi.db-chain.testnet.arkiv.network/not-a-real-key-123
  ```
- **Impact:** the key lands in server logs, error reports and pasted bug reports.
- **Workaround:** keep the URL key-free and send the key as `X-API-KEY`. Rabdi reads that header: a bogus key there gets the same `401 INVALID_KEY` as one in the path. `src/lib/server/arkiv/client.ts` does this.
- **Suggested fix:** have `rabdi()`, or a transport helper next to it, send the key in a header; or say on the access-keys page that the path form shows up in error messages.
- **Issue:** not filed yet.

### 2026-11-05: The dev node image runs 250 ms blocks, but the SDK assumes 2 s
- **Where:** `ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1` default command; SDK 1.0.1 `BLOCK_TIME = 2` and `ExpirationTime`
- **Expected:** `ExpirationTime.fromMinutes(10)` lives about 10 minutes on the local node, as on Rabdi.
- **What happened:** the image defaults to `--dev.block-time 250ms`, 4 blocks a second, but the SDK turns durations and `atDate` deadlines into blocks at 2 s each. Every expiry lands 8 times early: 10 minutes becomes 75 seconds. Block timestamps also step 1 s per block, so the chain clock runs 4 times ahead of the wall clock, and `arkiv_getBlockTiming` reports `duration: 1`.
- **Reproduce:**
  ```bash
  docker run -d --rm --name probe -p 127.0.0.1:18545:8545 ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1
  # run twice, 4 s apart
  curl -s 127.0.0.1:18545 -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"arkiv_getBlockTiming","params":[]}'
  ```
  Measured: block 42 to 58 in 4 s of wall time, `current_block_time` 30 s ahead of the wall clock by block 42, `duration` 1.
- **Impact:** a "the visit ends in 10 minutes" test passes or fails for the wrong reason locally.
- **Workaround:** override the command with `--dev.block-time 2s`, as the node repo's `docker/compose.yml` does. `scripts/arkiv-test.ts` does this.
- **Suggested fix:** default the dev image to 2 s blocks, or let the SDK take the block time from the chain.
- **Issue:** not filed yet.

### 2026-11-05: No docs for running a local node
- **Where:** docs.arkiv.network (the 28 pages in its sitemap, and `llms.txt`); SDK 1.0.1 exports a `localhost` chain
- **Expected:** since the SDK exports `localhost` (chain 1337 on `127.0.0.1:8545`), the docs say what to run there.
- **What happened:** no page mentions a local node. "localhost" appears only as that chain's entry in the API reference sidebar. I found `ghcr.io/arkiv-network/arkiv-reth-dev` in the SDK repo's `test/src/utils.ts` and the node repo's `docker/arkiv-reth-dev.Dockerfile`. The node repo's `kurtosis/integration/README.md` still says SDK writes aren't tested there because "SDK 0.7" sends a different format.
- **Impact:** without a local node, the only place to try writes is Rabdi, which needs faucet tGLM and an access key first.
- **Workaround:**
  ```bash
  docker run --rm -p 127.0.0.1:8545:8545 ghcr.io/arkiv-network/arkiv-reth-dev:v1.0.1 \
    node --dev --dev.block-time 2s --http --http.addr 0.0.0.0 --http.api eth,net,web3,txpool --datadir /data
  ```
  then fund accounts from the first account of the standard test mnemonic, which the dev node prefunds. Everything Dreamscape writes worked there: create plus hand-over in one batch, patches, extensions, deletes, `readonly`, and expiry.
- **Suggested fix:** a "Run a local node" page with that command, the prefunded account and the block-time flag.
- **Issue:** not filed yet.

### 2026-11-05: The engine's error name is only reachable through `cause`
- **Where:** SDK 1.0.1 `EntityMutationError`
- **Expected:** code can branch on the engine's error: retry when a predicted key went stale (`EntityNotFound`), or show "only the owner can change this" on `NotOwner`.
- **What happened:** the error carries a sentence such as "no entity 0x… — it may have been deleted, or have expired", not the error name. To branch, you walk viem's cause chain to `ContractFunctionRevertedError` and read `data.errorName`. For a stale prediction the sentence also points the wrong way: nothing was deleted or expired. The batch's own predicted key was never minted, because the creator's entity nonce had moved.
- **Reproduce:** predict a key with `predictEntityKeys`, create any other entity from the same account, then send `executeBatch({ creates: [{ …, salt: predicted.salt }], ownershipChanges: [{ entityKey: predicted.key, newOwner }] })`. `scripts/arkiv-test.ts` does this in "a stale key prediction is refused whole".
- **Impact:** a retry loop has to parse prose or dig into viem's errors.
- **Workaround:** `revertName()` in `src/lib/server/arkiv/client.ts` walks the cause chain.
- **Suggested fix:** an `errorName` and the decoded arguments on `EntityMutationError`, and a hint about stale predictions when a batch names a key that one of its own creates was meant to mint.
- **Issue:** not filed yet.

### 2026-11-05: Gas on the dev image is far below Rabdi's estimates
- **Where:** `arkiv-reth-dev:v1.0.1` and Rabdi, the same batches from the same code
- **Expected:** gas measured on a local node is a fair budget for Rabdi.
- **What happened:** Rabdi's `eth_estimateGas` for the same batch is 1.5 to 3.9 times what the dev node uses. On the dev node, the estimate for a listing matched its receipt within 1%, so the gap is in metering, not in estimating.

  | Batch | Dev node, gas used | Rabdi, estimate |
  |---|---|---|
  | listing (17 attributes, 30 days), create + hand-over | 138,222 | 344,969 |
  | knock (12 hours), create + hand-over | 41,653 | 156,597 |
  | visit (10 minutes), create + hand-over | 46,591 | 159,759 |
  | vendor stall (6 hours), create + hand-over | 58,109 | 227,417 |
  | World Dream counts (readonly, maximum lifetime), per row | about 259,000 | about 398,000 |

- **Reproduce:** `node --env-file-if-exists=.env.local --import tsx scripts/arkiv-test.ts` prints both. The Rabdi side sends nothing: a transport that only answers reads stops each write after the node's estimate, and an unfunded account gets estimates.
- **Impact:** a faucet budget worked out locally runs short on Rabdi.
- **Workaround:** budget from Rabdi's estimates.
- **Suggested fix:** give the dev image Rabdi's gas parameters, or document that they differ.
- **Issue:** not filed yet.

### 2026-11-05: The public client leaves out `getGasPrice` and `estimateGas`
- **Where:** SDK 1.0.1 `PublicArkivClient`, which picks ten of viem's public actions
- **Expected:** `client.getGasPrice()` works on the client the SDK hands back, as on a viem public client.
- **What happened:** a type error. The client has `getBalance`, `getBlock` and `getTransactionReceipt`, but not `getGasPrice` or `estimateGas`.
- **Impact:** small; it costs a search through the SDK's types.
- **Workaround:** `getGasPrice(client)` from `viem/actions`.
- **Suggested fix:** expose viem's full public actions, or list what's missing in the clients page.
- **Issue:** not filed yet.

### 2026-11-05: `ExpirationTime.atDate` can end an entity before the date
- **Where:** SDK 1.0.1 `ExpirationTime.atDate`, local dev node with 2 s blocks
- **Expected:** what the docstring says: the date "rounds up to the next block", so the entity "lives until at least the instant asked for".
- **What happened:** a visit created with `atDate(now + 10 s)` stopped being returned by the node 0.6 s before that instant. The SDK places the date as `currentBlock + ceil(secondsAway / 2)` from `Date.now()`, but the current block was sealed up to 2 s before now, and the entity is gone from the moment its expiry block is sealed. So it can end up to one block early.
- **Reproduce:** `scripts/arkiv-test.ts`, check "visit: active, then gone when it ends", prints how long after `endsAt` the visit went away; one run printed -0.6 s.
- **Impact:** small for 10-minute visits; it matters for anything that promises "open until exactly this time".
- **Workaround:** Dreamscape stores `endsAt` on the visit and the server refuses access at `endsAt` itself, so the door never stays open late; it may close a block early.
- **Suggested fix:** place the date against the current block's timestamp and add one block, or soften the docstring.
- **Issue:** not filed yet.
