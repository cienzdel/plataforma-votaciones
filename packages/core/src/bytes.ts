import { sha256 } from "@noble/hashes/sha2.js";

const encoder = new TextEncoder();

/** `H(a ‖ b ‖ …)`: SHA-256 of the concatenation (spec/formats.md §1.1). */
export function hash(...parts: Uint8Array[]): Uint8Array {
  return sha256(concat(...parts));
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Domain-separation prefix `utf8(t) ‖ 0x00`. */
export function tag(t: string): Uint8Array {
  return concat(utf8(t), new Uint8Array(1));
}

export function u64be(n: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n));
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True if `value` is lowercase hex of exactly `length` bytes (any length if omitted). */
export function isHex(value: unknown, length?: number): value is string {
  return (
    typeof value === "string" &&
    /^(?:[0-9a-f]{2})*$/.test(value) &&
    (length === undefined || value.length === 2 * length)
  );
}

/** Decodes lowercase hex; uppercase and odd lengths are rejected (formats.md §1.2). */
export function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!isHex(value)) throw new TypeError("invalid hex string");
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Bytewise comparison of UTF-8 encodings, for sorting ids. */
export function compareUtf8(a: string, b: string): number {
  const x = utf8(a);
  const y = utf8(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}
