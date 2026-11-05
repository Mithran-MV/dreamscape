// Each dreamer gets their own AES-256 key, derived from the server's master key.
// The same key encrypts their files on 0G Storage and in the local cache, and never leaves the server.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

export function dreamerKey(userId: string): Uint8Array {
  const master = Buffer.from(env.masterKey().replace(/^0x/, ""), "hex");
  if (master.length !== 32) throw new Error("MASTER_KEY must be 32 bytes of hex.");
  return new Uint8Array(hkdfSync("sha256", master, Buffer.from(userId), Buffer.from("dreamscape/dreamer-key/v1"), 32));
}

// Local cache format: 12-byte IV | 16-byte tag | ciphertext.
export function seal(key: Uint8Array, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function open(key: Uint8Array, sealed: Uint8Array): Buffer {
  const buf = Buffer.from(sealed);
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
