import { hash, toHex, utf8 } from "./bytes.ts";
import { SpecError } from "./types.ts";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MEMBER_NAME = /^[a-z][a-z0-9_@-]*$/;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const ESCAPED = /[\u0000-\u001f"\\]/g;
const ESCAPES: Record<string, string> = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r", '"': '\\"', "\\": "\\\\" };

/** A value outside the restricted JSON profile. */
export class ProfileError extends SpecError {}

function escape(c: string): string {
  return ESCAPES[c] ?? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
}

/**
 * RFC 8785 serialisation under the restricted profile of spec/formats.md §1.3.
 * Throws ProfileError for any value outside the profile.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === true || value === false) return String(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new ProfileError("number outside the profile");
    return String(value);
  }
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value)) throw new ProfileError("lone surrogate");
    return '"' + value.replace(ESCAPED, escape) + '"';
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    const names = Object.keys(record).sort();
    for (const name of names) if (!MEMBER_NAME.test(name)) throw new ProfileError("member name outside the profile: " + name);
    return "{" + names.map((n) => '"' + n + '":' + canonicalize(record[n])).join(",") + "}";
  }
  throw new ProfileError("value outside the profile");
}

export function jcsBytes(value: unknown): Uint8Array {
  return utf8(canonicalize(value));
}

/** `HJ(v) = H(JCS(v))`. */
export function hashJson(value: unknown): Uint8Array {
  return hash(jcsBytes(value));
}

export function hashJsonHex(value: unknown): string {
  return toHex(hashJson(value));
}

/** Equality of two JSON values under the profile. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}
