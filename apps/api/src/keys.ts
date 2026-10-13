/**
 * Voting keys (ADR-0002, ADR-0003). Key generation, encryption at rest and the raw RSA operation
 * all come from OpenSSL through node:crypto; nothing here implements a primitive.
 */
import { constants, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, generateKeyPair, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const generate = promisify(generateKeyPair);
export const MODULUS_BYTES = 384;

export interface VotingKey {
  /** DER SubjectPublicKeyInfo (rsaEncryption), hex (spec/formats.md §2.1). */
  publicKey: string;
  /** PKCS#8 DER encrypted with AES-256-GCM under the master key: iv ‖ tag ‖ ciphertext, hex. */
  privateKey: string;
}

/** Parses the 32-byte master key given as 64 hex characters. */
export function masterKey(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("the master key must be 32 bytes in lowercase hex");
  return Buffer.from(hex, "hex");
}

function encrypt(master: Buffer, data: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", master, iv).setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("hex");
}

function decrypt(master: Buffer, hex: string, aad: string): Buffer {
  const raw = Buffer.from(hex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", master, raw.subarray(0, 12)).setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

/** A fresh RSA-3072 key with exponent 65537 for one voting. The voting id binds the ciphertext. */
export async function newVotingKey(master: Buffer, votingId: string): Promise<VotingKey> {
  const { publicKey, privateKey } = await generate("rsa", { modulusLength: 8 * MODULUS_BYTES, publicExponent: 65537 });
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("hex"),
    privateKey: encrypt(master, privateKey.export({ type: "pkcs8", format: "der" }), votingId),
  };
}

export class BlindSignError extends Error {}

/**
 * `blind_sig = RSASP1(sk, blinded_msg)` with the checks of RFC 9474 §4.3: the input is smaller
 * than the modulus, and RSAVP1 of the result gives the input back (spec/protocol.md §5).
 */
export function blindSign(master: Buffer, votingId: string, key: VotingKey, blindedMsg: Buffer): Buffer {
  const pub = createPublicKey({ key: Buffer.from(key.publicKey, "hex"), format: "der", type: "spki" });
  const n = Buffer.from(pub.export({ format: "jwk" }).n!, "base64url");
  if (blindedMsg.length !== MODULUS_BYTES || Buffer.compare(blindedMsg, n) >= 0) throw new BlindSignError("blinded message out of range");
  const priv = createPrivateKey({ key: decrypt(master, key.privateKey, votingId), format: "der", type: "pkcs8" });
  const sig = privateDecrypt({ key: priv, padding: constants.RSA_NO_PADDING }, blindedMsg);
  const check = publicEncrypt({ key: pub, padding: constants.RSA_NO_PADDING }, sig);
  if (!check.equals(blindedMsg)) throw new Error("RSAVP1 check failed");
  return sig;
}
