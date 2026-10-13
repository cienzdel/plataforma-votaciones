import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assentMinClose,
  assentOutcome,
  buildChain,
  canonicalize,
  cellIdHex,
  computeQuorum,
  computeResult,
  drandRandomness,
  drawCommitment,
  drawSigma,
  fromHex,
  hashJsonHex,
  jcsBytes,
  roundAt,
  roundTime,
  shuffle,
  toHex,
  vacancyNext,
  verifyBoard,
  verifyChain,
  type PostsResult,
} from "../src/index.js";

/** The shared case corpus of spec/cases (spec/cases/README.md). */
const dir = new URL("../../../spec/cases/", import.meta.url);
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

type Input = any;

function runDraw(input: Input) {
  const seed = fromHex(input.seed);
  if (toHex(drawCommitment(seed)) !== input.commitment) return { error: "commitment_mismatch" };
  const randomness = drandRandomness(fromHex(input.drand.signature));
  const sigma = drawSigma(seed, randomness);
  const { order, blocks } = shuffle(sigma, input.items);
  return { randomness: toHex(randomness), sigma: toHex(sigma), order, prng_blocks: blocks };
}

async function run(kind: string, input: Input): Promise<unknown> {
  switch (kind) {
    case "quorum":
      return computeQuorum({ quorum: input.rules.quorum, min_attendance: input.rules.min_attendance ?? null }, input.counters);
    case "method": {
      const result = computeResult(input.method, input.params, input.tallies, input.counters, input.tiebreak_order);
      if (input.vacancy === undefined) return result;
      return { ...result, vacancy_next: vacancyNext(result as PostsResult, input.vacancy.post, input.vacancy.leaving) };
    }
    case "round":
      return { round: roundAt(input.t), round_time: roundTime(roundAt(input.t)) };
    case "draw":
    case "draw_error":
      return runDraw(input);
    case "cell_id":
      return { id: cellIdHex(input.s, input.voting_id, input.cell) };
    case "jcs":
      return { jcs_text: canonicalize(input.value), jcs_utf8_hex: toHex(jcsBytes(input.value)), hash: hashJsonHex(input.value) };
    case "chain":
      return { records: buildChain(input.documents) };
    case "chain_error":
      return verifyChain(input.records, input.documents);
    case "assent_deadline":
      return { min_closes_at: assentMinClose(input.sent_at, input.timezone, input.min_days) };
    case "assent_outcome":
      return { outcome: assentOutcome(input.objections_at_close) };
    case "board":
    case "board_error": {
      const report = await verifyBoard(input);
      if (report.valid) return { valid: true, result: report.result };
      return report.universalValid ? { error: report.error, universal_valid: true } : { error: report.error };
    }
    default:
      throw new Error("unknown kind " + kind);
  }
}

describe("spec/cases corpus", () => {
  it("has all the cases", () => {
    expect(cases.length).toBe(87);
  });
  it.each(cases.map((c) => [c.id, c]))("%s", async (_id, c) => {
    expect(await run(c.kind, c.input)).toEqual(c.expected);
  });
  it("rejects an unknown kind", async () => {
    await expect(run("nope", {})).rejects.toThrow("unknown kind");
  });
});
