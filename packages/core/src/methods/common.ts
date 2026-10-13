import { check, type Counters, type Tallies } from "../types.ts";

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const RESERVED = new Set(["for", "against", "blank", "abstain", "against_all", "marked", "unmarked", "status"]);

/** Candidate, slate, post and degree ids (spec/formats.md §1.4). */
export function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && !RESERVED.has(value);
}

/** A non-empty list of distinct ids. */
export function idList(value: unknown, what: string): string[] {
  check(Array.isArray(value) && value.length > 0 && value.every(isId) && new Set(value).size === value.length, `invalid ${what}`);
  return value as string[];
}

export function nonNegativeInt(value: unknown, what: string): number {
  check(Number.isSafeInteger(value) && (value as number) >= 0, `invalid ${what}`);
  return value as number;
}

/**
 * Reads `tallies[cell]` and checks that it has exactly the given values,
 * each a non-negative integer (spec/formats.md §3).
 */
export function tallyOf(tallies: Tallies, cell: string, values: readonly string[]): Record<string, number> {
  const t = tallies[cell];
  check(t !== undefined, `missing tally for cell ${cell}`);
  const keys = Object.keys(t);
  check(keys.length === values.length && values.every((v) => Number.isSafeInteger(t[v]) && t[v]! >= 0), `invalid tally for cell ${cell}`);
  return t;
}

/** Position of each id in a tie-break order, which must be a permutation of `ids`. */
export function orderIndex(order: readonly string[] | undefined, ids: readonly string[]): Map<string, number> {
  check(order !== undefined, "a tie-break order is required");
  const index = new Map(order.map((id, i) => [id, i]));
  check(order.length === ids.length && ids.every((id) => index.has(id)), "the tie-break order is not a permutation of the candidates");
  return index;
}

/** Value of a threshold base (spec/methods.md §1.3). */
export function baseValue(base: "cast" | "present" | "present_plus_proxies" | "members", cast: number, c: Counters): number {
  return { cast, present: c.present, present_plus_proxies: c.present + c.proxies, members: c.members }[base];
}
