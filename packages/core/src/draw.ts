import { compareUtf8, concat, hash, tag, u64be } from "./bytes.js";
import { check } from "./types.js";

/** drand quicknet parameters (spec/draws.md §1). */
export const QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  scheme: "bls-unchained-g1-rfc9380",
  genesisTime: 1692803367,
  period: 3,
} as const;

/** Delay between fixing a live round and the round itself (spec/draws.md §5, §6). */
export const LIVE_ROUND_DELAY_SECONDS = 30;

/** `time(R) = genesis_time + (R − 1)·period`. */
export function roundTime(round: number): number {
  check(Number.isSafeInteger(round) && round >= 1, "invalid round");
  return QUICKNET.genesisTime + (round - 1) * QUICKNET.period;
}

/** First round at or after the Unix time `t`: `⌈(t − genesis_time) / period⌉ + 1`. */
export function roundAt(t: number): number {
  check(Number.isSafeInteger(t) && t > QUICKNET.genesisTime, "time before drand genesis");
  return Math.ceil((t - QUICKNET.genesisTime) / QUICKNET.period) + 1;
}

/** `H(tag("pv/draw-commit/v1") ‖ seed)` (spec/draws.md §2). */
export function drawCommitment(seed: Uint8Array): Uint8Array {
  check(seed.length === 32, "the seed has 32 bytes");
  return hash(tag("pv/draw-commit/v1"), seed);
}

/** `randomness_R = H(signature_R)`. The BLS signature itself is not verified here. */
export function drandRandomness(signature: Uint8Array): Uint8Array {
  check(signature.length === 48, "a quicknet signature has 48 bytes");
  return hash(signature);
}

/** `σ = H(tag("pv/draw-seed/v1") ‖ seed ‖ randomness_R)` (spec/draws.md §3). */
export function drawSigma(seed: Uint8Array, randomness: Uint8Array): Uint8Array {
  check(seed.length === 32 && randomness.length === 32, "invalid seed or randomness");
  return hash(tag("pv/draw-seed/v1"), seed, randomness);
}

/**
 * `uniform(n)` of spec/draws.md §4: rejection sampling over 64-bit values from `next`,
 * so that every result in `0 … n − 1` is equally likely.
 */
export function uniformInt(next: () => bigint, n: number): number {
  check(Number.isSafeInteger(n) && n >= 1 && n < 2 ** 32, "invalid range");
  const limit = 2n ** 64n - ((2n ** 64n) % BigInt(n));
  for (;;) {
    const x = next();
    if (x < limit) return Number(x % BigInt(n));
  }
}

/**
 * Fisher–Yates shuffle of the ids sorted by UTF-8 bytes, driven by σ (spec/draws.md §4).
 * Returns the order (most preferred first) and the number of hash blocks consumed.
 */
export function shuffle(sigma: Uint8Array, ids: readonly string[]): { order: string[]; blocks: number } {
  check(sigma.length === 32, "invalid sigma");
  check(new Set(ids).size === ids.length, "repeated items");
  const items = [...ids].sort(compareUtf8);
  const prefix = concat(tag("pv/draw-prng/v1"), sigma);
  let blocks = 0;
  const next = (): bigint => {
    const block = hash(prefix, u64be(blocks++));
    return new DataView(block.buffer, block.byteOffset).getBigUint64(0);
  };
  for (let i = items.length - 1; i >= 1; i--) {
    const j = uniformInt(next, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return { order: items, blocks };
}
