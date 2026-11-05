// 0G Storage on Galileo: every dream file is AES-256 encrypted with the dreamer's key before it leaves the server.
// The SDK returns ciphertext silently on a wrong key, so each file starts with a short check header.
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { env } from "../env";

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
  if (err) throw err;
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

export const storageExplorer = (root: string) => `https://storagescan-galileo.0g.ai/file/${root}`;
