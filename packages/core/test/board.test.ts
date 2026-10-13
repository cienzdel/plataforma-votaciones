import { beforeAll, describe, expect, it } from "vitest";
import {
  buildChain,
  checkReceipt,
  hashJsonHex,
  keyFingerprint,
  QUICKNET,
  toHex,
  verifyBoard,
  type BoardErrorCode,
  type BoardInput,
} from "../src/index.js";
import { credential, DRAND_ROUND, fixture, keyPair, publicKeyHex, rechain, type Fixture, type FixtureOptions } from "./fixtures.js";

const limitedVote: FixtureOptions = {
  method: "limited_vote",
  mode: "manual",
  timing: "final_link",
  params: { candidates: ["c1", "c2", "c3"], seats: 2, minimum: 0 },
  received: 6,
  tallies: {
    c1: { marked: 3, unmarked: 3 },
    c2: { marked: 2, unmarked: 4 },
    c3: { marked: 0, unmarked: 6 },
    status: { abstain: 0, blank: 1, marked: 5 },
  },
};

const posts: FixtureOptions = {
  method: "posts",
  mode: "paper",
  params: {
    posts: ["p1", "p2"],
    candidates: [
      { id: "c1", preferences: ["p1", "p2"] },
      { id: "c2", preferences: ["p1"] },
    ],
  },
  received: 6,
  tallies: {
    "c1@p1": { abstain: 1, against: 1, for: 4 },
    "c1@p2": { abstain: 1, against: 2, for: 3 },
    "c2@p1": { abstain: 1, against: 0, for: 5 },
  },
};

const rollCall: FixtureOptions = {
  mode: "roll_call",
  received: 6,
  tallies: { q: { abstain: 1, against: 2, blank: 0, for: 3 } },
};

const singleWinner: FixtureOptions = {
  method: "single_winner",
  params: { candidates: ["c1", "c2"], stage: "runoff", attempt: 0, repetitions: 1, against_all_blocks: false, subject: "person" },
  ballots: [{ choice: "c1" }, { choice: "c2" }, { choice: "c1" }],
  electorateFilter: "bio",
  minAttendance: [1, 2],
  counters: { members: 5, present: 3, proxies: 1, rights: 4, session_members: 12, session_present: 6 },
};

type Mutation = (f: Fixture) => void | Promise<void>;

let base: Record<string, Fixture>;
beforeAll(async () => {
  base = {
    secret: await fixture(),
    limitedVote: await fixture(limitedVote),
    posts: await fixture(posts),
    rollCall: await fixture(rollCall),
    singleWinner: await fixture(singleWinner),
  };
}, 60_000);

/** A deep copy of a fixture, changed by `mutate` and re-chained unless `chain` is false. */
async function variant(name: string, mutate: Mutation, chain = true): Promise<BoardInput> {
  const f = structuredClone(base[name]!);
  await mutate(f);
  try {
    return chain ? rechain(f) : f;
  } catch {
    return f; // a board outside the JSON profile cannot be hashed
  }
}

async function errorOf(name: string, mutate: Mutation, chain = true) {
  const report = await verifyBoard(await variant(name, mutate, chain));
  return report.valid ? "valid" : report.error;
}

describe("verifyBoard: valid boards", () => {
  it.each(["secret", "limitedVote", "posts", "rollCall", "singleWinner"])("%s", async (name) => {
    const f = base[name]!;
    expect(await verifyBoard(f)).toEqual({ valid: true, result: f.board.result });
  });

  it("accepts an annulled board without a draw", async () => {
    const report = await verifyBoard(
      await variant("limitedVote", (f) => {
        f.board.status = "annulled";
        f.board.annulment = { reason: "Wrong candidates" };
        f.board.result = null;
        f.board.draw = null;
        f.opening.draw_commitment = null;
        f.opening.draw_round = null;
      }),
    );
    expect(report).toEqual({ valid: true, result: null });
  });

  it("accepts a forced opening without quorum", async () => {
    const f = await fixture({ counters: { session_present: 3, present: 3, rights: 4 } });
    expect(f.board.quorum.forced).not.toBeNull();
    expect((await verifyBoard(f)).valid).toBe(true);
  });

  it("accepts a voting without candidates table or receipt", async () => {
    const { candidates: _c, receipt: _r, ...rest } = base.posts!;
    expect((await verifyBoard(rest)).valid).toBe(true);
  });
});

const cases: [string, string, Mutation, BoardErrorCode][] = [
  // 1. Format
  ["not an object", "secret", (f) => void (f.board = null), "format_invalid"],
  ["a float", "secret", (f) => void (f.board.counters.members = 1.5), "format_invalid"],
  ["wrong type", "secret", (f) => void (f.board.type = "draw"), "format_invalid"],
  ["unknown status", "secret", (f) => void (f.board.status = "open"), "format_invalid"],
  ["extra member", "secret", (f) => void (f.board.extra = 1), "format_invalid"],
  ["annulled with a result", "secret", (f) => Object.assign(f.board, { status: "annulled", annulment: { reason: "x" } }), "format_invalid"],
  ["closed without result", "secret", (f) => void (f.board.result = null), "format_invalid"],
  ["bad timestamp", "secret", (f) => void (f.board.closed_at = "2027-03-10 18:42"), "format_invalid"],
  ["rules not an object", "secret", (f) => void (f.board.rules = []), "format_invalid"],
  ["unknown method", "secret", (f) => void (f.board.rules.method = "borda"), "format_invalid"],
  ["unknown mode", "secret", (f) => void (f.board.rules.mode = "postal"), "format_invalid"],
  ["bad quorum", "secret", (f) => void (f.board.rules.quorum = [2, 1]), "format_invalid"],
  ["bad min_attendance", "secret", (f) => void (f.board.rules.min_attendance = [1]), "format_invalid"],
  ["bad electorate filter", "secret", (f) => void (f.board.rules.electorate_filter = "Bio"), "format_invalid"],
  ["bad profile", "secret", (f) => void (f.board.rules.profile.hash = "00"), "format_invalid"],
  ["bad params", "secret", (f) => void (f.board.rules.params.base = "voters"), "format_invalid"],
  ["counters missing", "secret", (f) => void delete f.board.counters.issued, "format_invalid"],
  ["issued null in secret", "secret", (f) => void (f.board.counters.issued = null), "format_invalid"],
  ["quorum malformed", "secret", (f) => void (f.board.quorum.met = "yes"), "format_invalid"],
  ["min attendance malformed", "secret", (f) => void (f.board.quorum.min_attendance = { met: true }), "format_invalid"],
  ["forced malformed", "secret", (f) => void (f.board.quorum.forced = "yes"), "format_invalid"],
  ["key malformed", "secret", (f) => void (f.board.key = null), "format_invalid"],
  ["short token", "secret", (f) => void (f.board.participation[0][0] = "00"), "format_invalid"],
  ["cells malformed", "secret", (f) => void (f.board.cells.q[0] = ["00", "for"]), "format_invalid"],
  ["key outside secret mode", "rollCall", (f) => void (f.board.key = base.secret!.board.key), "format_invalid"],
  ["tallies missing a cell", "secret", (f) => void (f.board.tallies = {}), "format_invalid"],
  ["tally missing a value", "secret", (f) => void delete f.board.tallies.q.blank, "format_invalid"],
  ["negative tally", "secret", (f) => void (f.board.tallies.q.blank = -1), "format_invalid"],
  ["draw where none is needed", "secret", (f) => void (f.board.draw = base.limitedVote!.board.draw), "format_invalid"],
  ["missing draw", "limitedVote", (f) => void (f.board.draw = null), "format_invalid"],
  ["draw with wrong purpose", "limitedVote", (f) => void (f.board.draw.purpose = "tie"), "format_invalid"],
  ["draw with an extra member", "limitedVote", (f) => void (f.board.draw.spots = 1), "format_invalid"],
  ["draw with a bad seed", "limitedVote", (f) => void (f.board.draw.seed = "00"), "format_invalid"],
  ["draw without items", "limitedVote", (f) => void (f.board.draw.items = null), "format_invalid"],
  ["drand malformed", "limitedVote", (f) => void (f.board.draw.drand = {}), "format_invalid"],
  ["drand values", "limitedVote", (f) => void (f.board.draw.drand.signature = "00"), "format_invalid"],
  ["round rule malformed", "posts", (f) => void (f.board.draw.round_rule.after = "now"), "format_invalid"],
  ["candidates hash on yes/no", "secret", (f) => void (f.board.candidates_hash = "00".repeat(32)), "format_invalid"],
  ["roll call without its hash", "rollCall", (f) => void (f.board.roll_call_hash = null), "format_invalid"],
  // 1. Rules hash
  [
    "rules hash",
    "secret",
    (f) => {
      f.board.rules_hash = f.opening.rules_hash = "00".repeat(32);
    },
    "rules_hash_mismatch",
  ],
  // 2. Opening notice
  ["opening missing", "secret", (f) => void (f.opening = null), "opening_mismatch"],
  ["opening of another type", "secret", (f) => void (f.opening.type = "board"), "opening_mismatch"],
  ["opening of another voting", "secret", (f) => void (f.opening.voting_id = "00".repeat(16)), "opening_mismatch"],
  ["draw commitment", "limitedVote", (f) => void (f.opening.draw_commitment = "00".repeat(32)), "opening_mismatch"],
  ["closing time", "limitedVote", (f) => void (f.opening.closes_at = "2027-03-10T18:42:00Z"), "opening_mismatch"],
  ["draw round", "limitedVote", (f) => void (f.opening.draw_round = DRAND_ROUND + 1), "opening_mismatch"],
  ["live with closes_at", "secret", (f) => void (f.opening.closes_at = f.board.closed_at), "opening_mismatch"],
  ["live with draw round", "posts", (f) => void (f.opening.draw_round = DRAND_ROUND), "opening_mismatch"],
  // 3. Key
  [
    "fingerprint",
    "secret",
    (f) => {
      f.board.key.fingerprint = f.opening.key.fingerprint = "00".repeat(32);
    },
    "key_invalid",
  ],
  [
    "not a key",
    "secret",
    (f) => {
      f.board.key = f.opening.key = { fingerprint: keyFingerprint("0011"), public_key: "0011" };
    },
    "key_invalid",
  ],
  [
    "2048-bit key",
    "secret",
    async (f) => {
      const pk = await publicKeyHex(await keyPair(2048));
      f.board.key = f.opening.key = { fingerprint: keyFingerprint(pk), public_key: pk };
    },
    "key_invalid",
  ],
  [
    "exponent 3",
    "secret",
    async (f) => {
      const pk = await publicKeyHex(await keyPair(3072, [3]));
      f.board.key = f.opening.key = { fingerprint: keyFingerprint(pk), public_key: pk };
    },
    "key_invalid",
  ],
  // 4. Participation
  ["signature of another token", "secret", (f) => void (f.board.participation[0][1] = f.board.participation[1][1]), "invalid_signature"],
  [
    "token of another voting",
    "secret",
    async (f) => {
      f.board.participation[0] = await credential(await keyPair(), "00".repeat(16));
    },
    "token_voting_id_mismatch",
  ],
  ["unsorted", "secret", (f) => void f.board.participation.reverse(), "participation_unsorted"],
  // 5. Cells
  ["cell key missing", "secret", (f) => void (f.board.cells = {}), "cells_invalid"],
  ["cell list too short", "secret", (f) => void f.board.cells.q.pop(), "cells_invalid"],
  ["cell list unsorted", "secret", (f) => void f.board.cells.q.reverse(), "cells_invalid"],
  ["cell value not allowed", "secret", (f) => void (f.board.cells.q[0][1] = "yes"), "cells_invalid"],
  // 6. Tallies
  ["manual tallies do not add up", "rollCall", (f) => void (f.board.tallies.q.for = 4), "tallies_mismatch"],
  [
    "limited vote with more marks than allowed",
    "limitedVote",
    (f) => {
      f.board.tallies.c3 = { marked: 1, unmarked: 5 };
    },
    "tallies_mismatch",
  ],
  // 7. Counters
  ["rights", "secret", (f) => void (f.board.counters.rights = 6), "counters_inconsistent"],
  ["received", "secret", (f) => void (f.board.counters.received = 2), "counters_inconsistent"],
  ["issued above rights", "secret", (f) => void (f.board.counters.issued = 8), "counters_inconsistent"],
  [
    "received above rights",
    "rollCall",
    (f) => {
      Object.assign(f.board.counters, { present: 3, proxies: 1, rights: 4, session_present: 3 });
    },
    "counters_inconsistent",
  ],
  ["unrestricted with fewer members", "secret", (f) => void (f.board.counters.members = 11), "counters_inconsistent"],
  ["unrestricted with fewer present", "rollCall", (f) => void Object.assign(f.board.counters, { present: 5, rights: 6 }), "counters_inconsistent"],
  // 8. Quorum
  [
    "required",
    "secret",
    (f) => {
      f.board.quorum.required = f.opening.quorum.required = 5;
    },
    "quorum_mismatch",
  ],
  [
    "minimum attendance not met and not forced",
    "singleWinner",
    (f) => {
      f.board.counters.session_present = 5;
      f.board.quorum.min_attendance.met = f.opening.quorum.min_attendance.met = false;
    },
    "quorum_mismatch",
  ],
  // 9. Draw
  ["draw of another voting", "limitedVote", (f) => void (f.board.draw.voting_id = "00".repeat(16)), "order_mismatch"],
  ["draw items", "limitedVote", (f) => void (f.board.draw.items = ["c1", "c2"]), "order_mismatch"],
  [
    "commitment",
    "limitedVote",
    (f) => {
      f.board.draw.seed = "ff".repeat(32);
    },
    "commitment_mismatch",
  ],
  ["drand network", "limitedVote", (f) => void (f.board.draw.drand.chain_hash = "00".repeat(32)), "drand_invalid"],
  ["drand randomness", "limitedVote", (f) => void (f.board.draw.drand.randomness = "00".repeat(32)), "drand_invalid"],
  [
    "final link round",
    "limitedVote",
    (f) => {
      f.board.draw.drand.round = f.opening.draw_round = DRAND_ROUND + 1;
    },
    "round_mismatch",
  ],
  [
    "final link with a live round rule",
    "limitedVote",
    (f) => {
      f.board.draw.round_rule = { after: f.board.closed_at, delay_seconds: 0 };
    },
    "round_mismatch",
  ],
  ["live without round rule", "posts", (f) => void delete f.board.draw.round_rule, "round_mismatch"],
  ["live rule after another time", "posts", (f) => void (f.board.draw.round_rule.after = "2027-03-10T18:42:00Z"), "round_mismatch"],
  ["live rule with another delay", "posts", (f) => void (f.board.draw.round_rule.delay_seconds = 60), "round_mismatch"],
  [
    "live round",
    "posts",
    (f) => {
      f.board.draw.drand.round = DRAND_ROUND + 1;
    },
    "round_mismatch",
  ],
  ["sigma", "limitedVote", (f) => void (f.board.draw.sigma = "00".repeat(32)), "order_mismatch"],
  ["order", "limitedVote", (f) => void f.board.draw.order.reverse(), "order_mismatch"],
  // 10. Result
  ["result", "posts", (f) => void (f.board.result.assignment.p2 = null), "result_mismatch"],
  // 11. Candidates
  ["candidates table edited", "posts", (f) => void (f.candidates.title = "x"), "candidates_mismatch"],
  [
    "candidate missing from the table",
    "limitedVote",
    (f) => {
      f.candidates.candidates.pop();
      f.board.candidates_hash = hashJsonHex(f.candidates);
    },
    "candidates_mismatch",
  ],
  [
    "post missing from the table",
    "posts",
    (f) => {
      f.candidates.posts = [];
      f.board.candidates_hash = hashJsonHex(f.candidates);
    },
    "candidates_mismatch",
  ],
  [
    "table without lists",
    "posts",
    (f) => {
      f.candidates = {};
      f.board.candidates_hash = hashJsonHex(f.candidates);
    },
    "candidates_mismatch",
  ],
];

describe("verifyBoard: first failing check", () => {
  it.each(cases)("%s", async (_title, name, mutate, error) => {
    expect(await errorOf(name, mutate)).toBe(error);
  });
});

describe("verifyBoard: chain", () => {
  it("rejects a board missing from the chain", async () => {
    expect(await errorOf("secret", (f) => void (f.board.title = "Other"), false)).toBe("chain_mismatch");
  });

  it("rejects a broken link before the board", async () => {
    const f = structuredClone(base.secret!);
    const records = buildChain([{ type: "assent" }, f.board]);
    records[0]!.prev = "ff".repeat(32);
    const report = await verifyBoard({ ...f, chain: { records } });
    expect(report).toMatchObject({ valid: false, error: "prev_mismatch" });
  });

  it("propagates errors that are not verification failures", async () => {
    const f = structuredClone(base.secret!);
    await expect(verifyBoard({ ...f, chain: undefined as never })).rejects.toThrow(TypeError);
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new RangeError("hostile");
        },
      },
    );
    await expect(verifyBoard({ ...f, board: hostile })).rejects.toThrow(RangeError);
  });
});

describe("receipts", () => {
  it("detects a receipt whose vote is not on the board", async () => {
    const f = await variant("secret", (x) => void (x.receipt.answers.q = "abstain"));
    expect(await verifyBoard(f)).toEqual({ valid: false, error: "receipt_mismatch", universalValid: true });
  });

  it("rejects a receipt for a voting without secret ballot", async () => {
    const f = { ...base.rollCall!, receipt: base.secret!.receipt };
    expect(await verifyBoard(f)).toMatchObject({ error: "receipt_mismatch", universalValid: true });
  });

  it("checks every field of a receipt", () => {
    const { board, receipt } = base.secret!;
    expect(checkReceipt(board, receipt)).toBe(true);
    expect(checkReceipt(board, { ...receipt, type: "vote" })).toBe(false);
    expect(checkReceipt(board, { ...receipt, voting_id: "00".repeat(16) })).toBe(false);
    expect(checkReceipt(board, { ...receipt, ack: "00".repeat(32) })).toBe(false);
    const other = structuredClone(base.secret!.receipt);
    other.sig = board.participation.find(([t]: [string, string]) => t !== receipt.token)[1];
    expect(checkReceipt(board, other)).toBe(false);
    const unknownCell = { ...receipt, answers: { x: "for" } };
    unknownCell.ack = hashJsonHex({ answers: unknownCell.answers, s: receipt.s, sig: receipt.sig, token: receipt.token, voting_id: receipt.voting_id });
    expect(checkReceipt(board, unknownCell)).toBe(false);
    expect(checkReceipt(board, null)).toBe(false);
  });
});

describe("fixtures", () => {
  it("use the quicknet chain and fictitious ids", () => {
    expect(base.limitedVote!.board.draw.drand.chain_hash).toBe(QUICKNET.chainHash);
    expect(toHex(new Uint8Array(0))).toBe("");
  });
});
