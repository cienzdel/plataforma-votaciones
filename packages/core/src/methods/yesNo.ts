import { isFraction, meets } from "../fraction.js";
import { check, type Counters, type Fraction, type Tallies } from "../types.js";
import { baseValue, tallyOf } from "./common.js";

export const YES_NO_VALUES = ["for", "against", "blank", "abstain"] as const;

export interface YesNoResult {
  for: number;
  against: number;
  blank: number;
  abstain: number;
  cast: number;
  base: number;
  outcome: "approved" | "rejected";
}

export type Base = "cast" | "present" | "present_plus_proxies" | "members";

export interface YesNoParams {
  base: Base;
  rule: "simple" | "absolute" | Fraction;
}

const BASES = ["cast", "present", "present_plus_proxies", "members"];

/** Validates the parameters of spec/methods.md §2. */
export function yesNoParams(params: Record<string, unknown>): YesNoParams {
  const { base, rule } = params;
  check(BASES.includes(base as string), "invalid base");
  check(rule === "simple" || rule === "absolute" || isFraction(rule), "invalid rule");
  return { base: base as Base, rule };
}

/** spec/methods.md §2. */
export function yesNo(params: Record<string, unknown>, tallies: Tallies, counters: Counters): YesNoResult {
  const t = tallyOf(tallies, "q", YES_NO_VALUES);
  const [f, a, b, ab] = YES_NO_VALUES.map((v) => t[v]!) as [number, number, number, number];
  const cast = f + a + b;
  const { base: baseName, rule } = yesNoParams(params);
  const base = baseValue(baseName, cast, counters);
  const approved = rule === "simple" ? f > a : rule === "absolute" ? 2 * f > base : meets(f, base, rule);
  return { for: f, against: a, blank: b, abstain: ab, cast, base, outcome: approved ? "approved" : "rejected" };
}
