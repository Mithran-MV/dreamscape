// Arkiv clients: a reader for queries, the server's wallet for writes, and wallets for dreamers and agents.
// Every read goes to the node, never the indexer: the indexer still serves entities after they expire.
import {
  createPublicClient,
  createWalletClient,
  NoEntityFoundError,
  type CreationFlags,
  type CreateEntityValues,
  type Expiry,
  type PublicArkivClient,
  type Schema,
  type WalletArkivClient,
} from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { BaseError, ContractFunctionRevertedError, http, isAddressEqual, type Account, type Address, type Chain, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../env";
import { arkivConfig, type ArkivConfig, type ArkivNetwork } from "./config";

export type ArkivReader = PublicArkivClient<Transport, Chain>;
export type ArkivWallet = WalletArkivClient<Transport, Chain, Account>;

export type Arkiv = {
  network: ArkivNetwork;
  chain: Chain;
  reader: ArkivReader;
  server: ArkivWallet;
  serverAddress: Address;
  wallet: (account: Account) => ArkivWallet;
  // Runs the server's writes one at a time, so a key predicted from its entity nonce is still right when the batch lands.
  serial: <T>(task: () => Promise<T>) => Promise<T>;
};

export type Written = { key: Hex; txHash: Hex };

function chainFor(config: ArkivConfig): Chain {
  const base = config.network === "rabdi" ? rabdi({ accessKey: config.accessKey }) : localhost;
  // The key stays out of the chain's URLs and goes in a header instead, because viem prints the URL in every request error.
  return { ...base, rpcUrls: { default: { http: [config.rpcUrl] } } };
}

function transportFor(config: ArkivConfig): Transport {
  const headers = config.accessKey ? { "X-API-KEY": config.accessKey } : undefined;
  // No retries: a rate-limited call should fail now, not wait out a long Retry-After.
  return http(config.rpcUrl, { retryCount: 0, timeout: config.timeoutMs, fetchOptions: headers ? { headers } : undefined });
}

function queue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

export function createArkiv(options: Partial<ArkivConfig> & { serverKey?: Hex } = {}): Arkiv {
  const { serverKey, ...overrides } = options;
  const merged = { ...arkivConfig(overrides.network), ...overrides };
  const config = { ...merged, accessKey: merged.network === "rabdi" ? merged.accessKey : "" };
  const chain = chainFor(config);
  const transport = transportFor(config);
  const wallet = (account: Account) => createWalletClient({ account, chain, transport, pollingInterval: 1_000 });
  const server = wallet(privateKeyToAccount(serverKey ?? env.serverKey()));
  return {
    network: config.network,
    chain,
    reader: createPublicClient({ chain, transport, pollingInterval: 1_000 }),
    server,
    serverAddress: server.account.address,
    wallet,
    serial: queue(),
  };
}

let current: Arkiv | undefined;

// The process-wide context, configured from the environment on first use.
export function arkiv(): Arkiv {
  return (current ??= createArkiv());
}

// The engine error a failed write was rejected with, such as "NotOwner" or "EntityNotFound".
export function revertName(error: unknown): string | undefined {
  const cause = error instanceof BaseError ? error : error instanceof Error ? error.cause : undefined;
  if (!(cause instanceof BaseError)) return undefined;
  const reverted = cause.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
}

type CreateOptions = { expiration: Expiry; flags?: CreationFlags };

// Creates one entity as the server and hands it to `owner` in the same batch, so $creator stays the server.
export function createFor<S extends Schema>(ctx: Arkiv, schema: S, values: CreateEntityValues<S>, owner: Address, options: CreateOptions): Promise<Written> {
  if (isAddressEqual(owner, ctx.serverAddress)) return createAsServer(ctx, schema, [values], options).then(([written]) => written);
  return ctx.serial(async () => {
    for (let attempt = 0; ; attempt++) {
      const [predicted] = await ctx.reader.predictEntityKeys({ owner: ctx.serverAddress, count: 1 });
      try {
        const result = await ctx.server.executeBatch({
          creates: [{ schema, values, ...options, salt: predicted.salt }],
          ownershipChanges: [{ entityKey: predicted.key, newOwner: owner }],
        });
        return { key: predicted.key, txHash: result.txHash };
      } catch (error) {
        // Another process created first and moved the nonce. The batch is refused whole, so predict again once.
        if (attempt === 0 && revertName(error) === "EntityNotFound") continue;
        throw error;
      }
    }
  });
}

// Creates entities the server keeps, all in one transaction.
export function createAsServer<S extends Schema>(ctx: Arkiv, schema: S, rows: CreateEntityValues<S>[], options: CreateOptions): Promise<Written[]> {
  if (!rows.length) return Promise.resolve([]);
  return ctx.serial(async () => {
    const result = await ctx.server.executeBatch({ creates: rows.map((values) => ({ schema, values, ...options })) });
    return result.createdEntities.map((key) => ({ key, txHash: result.txHash }));
  });
}

// A read straight after a write can miss it, so poll briefly before telling anyone it's there.
export async function waitVisible(key: Hex, ctx: Arkiv = arkiv(), tries = 10): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      await ctx.reader.getEntity(key);
      return true;
    } catch (error) {
      if (!(error instanceof NoEntityFoundError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return false;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
