// 0G Storage on Galileo: every dream file is AES-256 encrypted with the dreamer's key before it leaves the server.
// The SDK returns ciphertext silently on a wrong key, so each file starts with a short check header.
import { Indexer, MemData, StorageNode } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { env } from "../env";
import { getDb } from "../db";

const MAGIC = Buffer.from("DREAMSv1");

let signer: ethers.Wallet | undefined;
function serverSigner() {
  signer ??= new ethers.Wallet(env.serverKey(), new ethers.JsonRpcProvider(env.galileoRpc()));
  return signer;
}

export async function putEncrypted(bytes: Uint8Array, key: Uint8Array): Promise<{ root: string; tx: string }> {
  const indexer = new Indexer(env.storageIndexer());
  const file = new MemData(Buffer.concat([MAGIC, Buffer.from(bytes)]));
  const [res, err] = await indexer.upload(file, env.galileoRpc(), serverSigner(), {
    encryption: { type: "aes256", key },
  });
  // The SDK's gas errors dump the whole transaction; the dreamer only needs to know why it's waiting.
  if (err) throw /insufficient funds/i.test(String(err)) ? new Error("Waiting for the server's wallet to get Galileo 0G to pay for storage.") : err;
  return "rootHash" in res ? { root: res.rootHash, tx: res.txHash } : { root: res.rootHashes[0], tx: res.txHashes[0] };
}

export async function getDecrypted(root: string, key: Uint8Array): Promise<Buffer> {
  const indexer = new Indexer(env.storageIndexer());
  const [blob, err] = await indexer.downloadToBlob(root, { proof: true, decryption: { symmetricKey: key } });
  if (err) throw err;
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Wrong key for this file, or not a Dreamscape file.");
  return bytes.subarray(MAGIC.length);
}

// The explorer shows files by their storage sequence number, not their root, so links go through
// /api/storage/<root>, which finds the number once and redirects.
export const storageExplorer = (root: string) => `/api/storage/${root}`;
export const submissionUrl = (seq: number) => `https://storagescan-galileo.0g.ai/submission/${seq}`;

// The sequence number of the upload that holds `root`, asked of a node that stores it, and kept.
export async function fileSeq(root: string): Promise<number | null> {
  const db = getDb();
  const cached = db.prepare("SELECT value FROM kv WHERE key = ?").get(`seq:${root}`) as { value: string } | undefined;
  if (cached) return Number(cached.value);
  const nodes = await new Indexer(env.storageIndexer()).getFileLocations(root);
  for (const node of nodes ?? []) {
    const info = await new StorageNode(node.url).getFileInfo(root, false).catch(() => null);
    if (info?.tx && Number.isInteger(info.tx.seq)) {
      db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(`seq:${root}`, String(info.tx.seq));
      return info.tx.seq;
    }
  }
  return null;
}
