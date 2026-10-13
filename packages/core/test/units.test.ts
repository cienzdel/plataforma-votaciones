import { describe, expect, it } from "vitest";
import {
  assentMinClose,
  assentOutcome,
  buildChain,
  canonicalize,
  ceilFrac,
  cellSpec,
  compareUtf8,
  computeQuorum,
  computeResult,
  drandRandomness,
  drawCommitment,
  drawSigma,
  fromHex,
  isTimestamp,
  limitedVoteConsistent,
  meets,
  posts,
  roundAt,
  roundTime,
  shuffle,
  singleWinner,
  SpecError,
  tallyCells,
  uniformInt,
  vacancyNext,
  validAnswers,
  validateParams,
  verifyChain,
  verifySignature,
  ProfileError,
} from "../src/index.ts";
import { keyPair } from "./fixtures.ts";

const counters = { session_members: 45, session_present: 30, members: 45, present: 30, proxies: 0, rights: 30 };
const lv = { candidates: ["c1", "c2", "c3", "c4"], seats: 3, minimum: 0 };
const pp = {
  posts: ["p1", "p2"],
  candidates: [
    { id: "c1", preferences: ["p1", "p2"] },
    { id: "c2", preferences: ["p1"] },
  ],
};
const runoff = { candidates: ["c1", "c2"], stage: "runoff", attempt: 0, repetitions: 1 };

describe("ballots", () => {
  it("lists the cells of each method", () => {
    expect([...cellSpec("yes_no", {}).keys()]).toEqual(["q"]);
    expect(cellSpec("single_winner", { candidates: ["c1"] }).get("choice")).toEqual(["c1", "blank", "against_all", "abstain"]);
    expect([...cellSpec("posts", pp).keys()]).toEqual(["c1@p1", "c1@p2", "c2@p1"]);
    expect([...cellSpec("limited_vote", lv).keys()]).toEqual(["status", "c1", "c2", "c3", "c4"]);
    expect(() => cellSpec("borda" as never, {})).toThrow(SpecError);
  });

  it("validates complete ballots", () => {
    expect(validAnswers("yes_no", {}, { q: "for" })).toBe(true);
    expect(validAnswers("yes_no", {}, { q: "blank" }, ["blank"])).toBe(false);
    expect(validAnswers("yes_no", {}, { q: "maybe" })).toBe(false);
    expect(validAnswers("yes_no", {}, {})).toBe(false);
    expect(validAnswers("yes_no", {}, { x: "for" })).toBe(false);
    expect(validAnswers("posts", pp, { "c1@p1": "for", "c1@p2": "abstain", "c2@p1": "against" })).toBe(true);
    const marks = (status: string, ...marked: string[]) =>
      Object.fromEntries([["status", status], ...lv.candidates.map((c) => [c, marked.includes(c) ? "marked" : "unmarked"])]);
    expect(validAnswers("limited_vote", lv, marks("marked", "c1"))).toBe(true);
    expect(validAnswers("limited_vote", lv, marks("marked", "c1", "c2"))).toBe(true);
    expect(validAnswers("limited_vote", lv, marks("marked", "c1", "c2", "c3"))).toBe(false);
    expect(validAnswers("limited_vote", lv, marks("marked"))).toBe(false);
    expect(validAnswers("limited_vote", lv, marks("blank"))).toBe(true);
    expect(validAnswers("limited_vote", lv, marks("abstain", "c1"))).toBe(false);
  });

  it("tallies cells with zeros for unused values", () => {
    const spec = cellSpec("yes_no", {});
    expect(tallyCells(spec, {})).toEqual({ q: { for: 0, against: 0, blank: 0, abstain: 0 } });
    expect(tallyCells(spec, { q: [["00", "maybe"]] }).q).toMatchObject({ maybe: 1 });
  });
});

describe("bytes and JSON", () => {
  it("rejects uppercase and odd hex", () => {
    expect(() => fromHex("AB")).toThrow(TypeError);
    expect(() => fromHex("abc")).toThrow(TypeError);
  });

  it("sorts by UTF-8 bytes", () => {
    expect(compareUtf8("a", "ab")).toBeLessThan(0);
    expect(compareUtf8("é", "z")).toBeGreaterThan(0);
    expect(compareUtf8("b", "a")).toBeGreaterThan(0);
  });

  it("rejects values outside the profile", () => {
    for (const v of [1.5, -0, 2 ** 53, "\ud800", { A: 1 }, { "1a": 1 }, undefined, new Date(0), [Symbol("x")]]) {
      expect(() => canonicalize(v)).toThrow(ProfileError);
    }
    expect(() => canonicalize(Object.create(null))).toThrow(ProfileError);
  });

  it("checks timestamps", () => {
    expect(isTimestamp("2027-03-10T18:42:00Z")).toBe(true);
    expect(isTimestamp("2027-02-30T00:00:00Z")).toBe(false);
    expect(isTimestamp("2027-13-40T00:00:00Z")).toBe(false);
    expect(isTimestamp(0)).toBe(false);
  });
});

describe("chain", () => {
  const docs = [{ type: "board" }, { type: "assent" }];
  const records = buildChain(docs);

  it("accepts an intact chain", () => {
    expect(verifyChain(records, docs)).toBeNull();
    expect(verifyChain(records)).toBeNull();
  });

  it("reports the first broken record", () => {
    expect(verifyChain(records, docs.slice(1))).toEqual({ error: "chain_mismatch", index: 1 });
    expect(verifyChain(records, [docs[0], { type: "draw" }])).toEqual({ error: "chain_mismatch", index: 1 });
    const edited = structuredClone(records);
    edited[1]!.record_hash = "00".repeat(32);
    expect(verifyChain(edited)).toEqual({ error: "chain_mismatch", index: 1 });
  });
});

describe("draws", () => {
  it("rejects values that would cause bias", () => {
    const values = [2n ** 64n - 1n, 5n];
    expect(uniformInt(() => values.shift()!, 3)).toBe(2);
    expect(values).toEqual([]);
  });

  it("validates its inputs", () => {
    const bad = [
      () => roundTime(0),
      () => roundAt(1692803367),
      () => drawCommitment(new Uint8Array(31)),
      () => drandRandomness(new Uint8Array(32)),
      () => drawSigma(new Uint8Array(32), new Uint8Array(31)),
      () => shuffle(new Uint8Array(31), []),
      () => shuffle(new Uint8Array(32), ["a", "a"]),
      () => uniformInt(() => 0n, 0),
      () => uniformInt(() => 0n, 2 ** 32),
    ];
    for (const f of bad) expect(f).toThrow(SpecError);
  });
});

describe("thresholds and assent", () => {
  it("rejects invalid fractions and counts", () => {
    expect(() => ceilFrac(-1, [1, 3])).toThrow(SpecError);
    expect(() => meets(1, 3, [1, 0])).toThrow(SpecError);
    expect(() => computeQuorum({ quorum: [3, 2], min_attendance: null }, counters)).toThrow(SpecError);
  });

  it("does not lose precision on large counts", () => {
    expect(ceilFrac(2 ** 53 - 1, [2, 3])).toBe(6004799503160661);
  });

  it("validates assent inputs", () => {
    expect(() => assentMinClose("2027-03-10T09:00:00Z", "Europe/Madrid", -1)).toThrow(SpecError);
    expect(() => assentMinClose("yesterday", "Europe/Madrid", 2)).toThrow(SpecError);
    expect(() => assentOutcome(-1)).toThrow(SpecError);
    expect(assentOutcome(2)).toBe("next_plenary");
    expect(assentMinClose("2027-03-10T09:00:00Z", "UTC", 0)).toBe("2027-03-10T23:59:00Z");
  });
});

describe("methods", () => {
  it("rejects unknown methods and invalid parameters", () => {
    expect(() => validateParams("borda" as never, {})).toThrow(SpecError);
    expect(() => computeResult("borda" as never, {}, {}, counters)).toThrow(SpecError);
    const invalid: [string, Record<string, unknown>][] = [
      ["yes_no", { base: "voters", rule: "simple" }],
      ["yes_no", { base: "cast", rule: [3, 2] }],
      ["single_winner", { ...runoff, stage: "final" }],
      ["single_winner", { ...runoff, candidates: ["c1", "c2", "c3"] }],
      ["single_winner", { ...runoff, stage: "qualify", spots: 2 }],
      ["single_winner", { ...runoff, stage: "qualify" }],
      ["single_winner", { ...runoff, against_all_blocks: "yes" }],
      ["single_winner", { ...runoff, attempt: -1 }],
      ["single_winner", { ...runoff, candidates: ["c1", "for"] }],
      ["single_winner", { ...runoff, candidates: ["c1", "c1"] }],
      ["posts", { ...pp, candidates: [] }],
      ["posts", { ...pp, candidates: [{ id: "C1", preferences: ["p1"] }] }],
      ["posts", { ...pp, candidates: [{ id: "c1", preferences: ["p3"] }] }],
      ["posts", { ...pp, candidates: [{ id: "c1", preferences: ["p1"] }, { id: "c1", preferences: ["p2"] }] }],
      ["limited_vote", { ...lv, seats: 0 }],
      ["limited_vote", { ...lv, minimum: -1 }],
    ];
    for (const [method, params] of invalid) expect(() => validateParams(method as never, params), JSON.stringify(params)).toThrow(SpecError);
  });

  it("rejects incomplete tallies and tie-break orders", () => {
    expect(() => computeResult("yes_no", { base: "cast", rule: "simple" }, {}, counters)).toThrow(SpecError);
    expect(() => computeResult("yes_no", { base: "cast", rule: "simple" }, { q: { for: 1 } }, counters)).toThrow(SpecError);
    const t = { c1: { marked: 1, unmarked: 0 }, c2: { marked: 0, unmarked: 1 }, c3: { marked: 0, unmarked: 1 }, c4: { marked: 0, unmarked: 1 }, status: { marked: 1, blank: 0, abstain: 0 } };
    expect(() => computeResult("limited_vote", lv, t, counters)).toThrow(SpecError);
    expect(() => computeResult("limited_vote", lv, t, counters, ["c1", "c2", "c3"])).toThrow(SpecError);
  });

  it("elects the second candidate of a run-off", () => {
    const r = singleWinner(runoff, { choice: { c1: 3, c2: 5, blank: 0, against_all: 0, abstain: 0 } });
    expect(r).toMatchObject({ outcome: "elected", elected: "c2" });
  });

  it("checks limited vote consistency", () => {
    const ballots = 4;
    const t = (marked: number[], status: number) => ({
      ...Object.fromEntries(lv.candidates.map((c, i) => [c, { marked: marked[i]!, unmarked: ballots - marked[i]! }])),
      status: { marked: status, blank: ballots - status, abstain: 0 },
    });
    expect(limitedVoteConsistent(lv, t([2, 1, 1, 0], 3))).toBe(true);
    expect(limitedVoteConsistent(lv, t([4, 0, 0, 0], 3))).toBe(false);
    expect(limitedVoteConsistent(lv, t([1, 1, 0, 0], 3))).toBe(false);
    expect(limitedVoteConsistent(lv, t([3, 3, 1, 0], 3))).toBe(false);
  });

  it("leaves a displaced candidate without a post when no other post is eligible", () => {
    const params = { posts: ["p1"], candidates: [{ id: "c1", preferences: ["p1"] }, { id: "c2", preferences: ["p1"] }] };
    const tallies = { "c1@p1": { for: 3, against: 1, abstain: 0 }, "c2@p1": { for: 5, against: 1, abstain: 0 } };
    expect(posts(params, tallies, ["c1", "c2"])).toMatchObject({ assignment: { p1: "c2" }, unassigned: ["c1"] });
  });

  it("skips preferences where the candidate is not eligible", () => {
    const tallies = { "c1@p1": { for: 1, against: 5, abstain: 0 }, "c1@p2": { for: 5, against: 1, abstain: 0 }, "c2@p1": { for: 5, against: 1, abstain: 0 } };
    expect(posts(pp, tallies, ["c1", "c2"]).assignment).toEqual({ p1: "c2", p2: "c1" });
  });

  it("leaves a later vacancy empty when nobody is available", () => {
    const tallies = { "c1@p1": { for: 5, against: 1, abstain: 0 }, "c1@p2": { for: 5, against: 1, abstain: 0 }, "c2@p1": { for: 1, against: 5, abstain: 0 } };
    const r = posts(pp, tallies, ["c1", "c2"]);
    expect(r.assignment).toEqual({ p1: "c1", p2: null });
    expect(vacancyNext(r, "p1", "c1")).toBeNull();
    expect(() => vacancyNext(r, "p9", "c1")).toThrow(SpecError);
  });
});

describe("signatures", () => {
  it("rejects a signature of the wrong length", async () => {
    const { publicKey } = await keyPair();
    expect(await verifySignature(publicKey, new Uint8Array(80), new Uint8Array(383))).toBe(false);
  });
});
