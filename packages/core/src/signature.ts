import { equalBytes, fromHex, hash, toHex } from "./bytes.ts";

/** RSABSSA-SHA384-PSS-Randomized verification parameters (spec/formats.md §2.1, §2.3). */
const RSA_PSS = { name: "RSA-PSS", hash: "SHA-384" } as const;
const SALT_LENGTH = 48;
const MODULUS_BYTES = 384;
const EXPONENT = new Uint8Array([1, 0, 1]);

/** `key_fingerprint = H(DER SubjectPublicKeyInfo)`. */
export function keyFingerprint(publicKey: string): string {
  return toHex(hash(fromHex(publicKey)));
}

/**
 * Imports a voting key given as hex DER SubjectPublicKeyInfo and checks that it is an
 * `rsaEncryption` key with a 3072-bit modulus and exponent 65537 in canonical encoding.
 * Returns null if any check fails. Uses WebCrypto; no primitive is implemented here.
 */
export async function importVotingKey(publicKey: string): Promise<CryptoKey | null> {
  try {
    const der = fromHex(publicKey);
    const key = await crypto.subtle.importKey("spki", der, RSA_PSS, true, ["verify"]);
    const { modulusLength, publicExponent } = key.algorithm as RsaHashedKeyAlgorithm;
    const reexported = new Uint8Array(await crypto.subtle.exportKey("spki", key));
    const ok = modulusLength === 8 * MODULUS_BYTES && equalBytes(publicExponent, EXPONENT) && equalBytes(reexported, der);
    return ok ? key : null;
  } catch {
    return null;
  }
}

/** Verifies `sig` over `token` as a standard RSASSA-PSS signature (SHA-384, MGF1-SHA-384, salt 48). */
export async function verifySignature(key: CryptoKey, token: Uint8Array<ArrayBuffer>, sig: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return sig.length === MODULUS_BYTES && crypto.subtle.verify({ name: "RSA-PSS", saltLength: SALT_LENGTH }, key, sig, token);
}
