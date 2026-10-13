import { check, type Fraction } from "./types.js";

/** `[p, q]` with integers `0 ≤ p ≤ q` and `q > 0` (spec/methods.md §1.1). */
export function isFraction(value: unknown): value is Fraction {
  return (
    Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger) && value[1] > 0 && value[0] >= 0 && value[0] <= value[1]
  );
}

function parts(n: number, f: Fraction): [bigint, bigint, bigint] {
  check(Number.isSafeInteger(n) && n >= 0 && isFraction(f), "invalid fraction or count");
  return [BigInt(n), BigInt(f[0]), BigInt(f[1])];
}

/** `⌈n·p / q⌉` (spec/methods.md §1.1). */
export function ceilFrac(n: number, f: Fraction): number {
  const [N, p, q] = parts(n, f);
  return Number((N * p + q - 1n) / q);
}

/** `x·q ≥ n·p`. */
export function meets(x: number, n: number, f: Fraction): boolean {
  const [N, p, q] = parts(n, f);
  return BigInt(x) * q >= N * p;
}
