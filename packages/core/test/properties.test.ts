import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildChain,
  canonicalize,
  ceilFrac,
  limitedVote,
  meets,
  posts,
  shuffle,
  singleWinner,
  verifyChain,
  yesNo,
  type PostsResult,
  type Tallies,
} from "../src/index.ts";

const counters = { session_members: 45, session_present: 30, members: 45, present: 30, proxies: 0, rights: 30 };
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => prefix + (i + 1));

/** Shuffles a copy of `list` with the fast-check random source. */
const permutationOf = <T>(list: readonly T[]) =>
  fc.array(fc.nat(), { minLength: list.length, maxLength: list.length }).map((keys) => list.map((x, i) => [keys[i]!, i, x] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , x]) => x));

/** A `posts` voting: up to 5 candidates, up to 3 posts, random preferences and tallies. */
const postsVoting = fc
  .record({ nc: fc.integer({ min: 1, max: 5 }), np: fc.integer({ min: 1, max: 3 }) })
  .chain(({ nc, np }) => {
    const cands = ids("c", nc);
    const postIds = ids("p", np);
    return fc.record({
      postIds: fc.constant(postIds),
      candidates: fc.tuple(...cands.map((id) => fc.subarray(postIds, { minLength: 1 }).chain(permutationOf).map((preferences) => ({ id, preferences })))),
      order: permutationOf(cands),
      votes: fc.array(fc.record({ for: fc.nat(6), against: fc.nat(6), abstain: fc.nat(2) }), { minLength: nc * np, maxLength: nc * np }),
    });
  })
  .map(({ postIds, candidates, order, votes }) => {
    const tallies: Tallies = {};
    candidates.forEach((c, i) => c.preferences.forEach((v) => (tallies[c.id + "@" + v] = votes[i * postIds.length + postIds.indexOf(v)]!)));
    return { params: { posts: postIds, candidates }, tallies, order };
  });

describe("posts (spec/methods.md §4)", () => {
  it("is a stable assignment of eligible candidates, one post each", () => {
    fc.assert(
      fc.property(postsVoting, ({ params, tallies, order }) => {
        const r = posts(params, tallies, order);
        const t = (c: string, v: string) => tallies[c + "@" + v]!;
        const eligible = (c: string, v: string) => t(c, v).for! > t(c, v).against!;
        const pos = (c: string) => order.indexOf(c);
        const better = (a: string, b: string, v: string) =>
          t(a, v).for! - t(b, v).for! || t(b, v).against! - t(a, v).against! || pos(b) - pos(a);
        const holders = Object.values(r.assignment).filter((c) => c !== null);
        expect(new Set(holders).size).toBe(holders.length);
        for (const [v, c] of Object.entries(r.assignment)) if (c !== null) expect(eligible(c, v)).toBe(true);
        const postOf = new Map(Object.entries(r.assignment).filter(([, c]) => c !== null).map(([v, c]) => [c!, v]));
        for (const { id: c, preferences } of params.candidates) {
          const own = postOf.get(c);
          const preferred = own === undefined ? preferences : preferences.slice(0, preferences.indexOf(own));
          for (const v of preferred) {
            const h = r.assignment[v];
            const blocks = eligible(c, v) && (h === null || better(c, h!, v) > 0);
            expect(blocks, `${c} and ${v} block the assignment`).toBe(false);
          }
        }
        expect([...holders, ...r.unassigned].sort()).toEqual(params.candidates.map((c) => c.id).sort());
      }),
    );
  });

  it("does not depend on the order of the input arrays", () => {
    const shuffled = postsVoting.chain((v) =>
      fc.record({ v: fc.constant(v), cands: permutationOf(v.params.candidates), postIds: permutationOf(v.params.posts) }),
    );
    fc.assert(
      fc.property(shuffled, ({ v, cands, postIds }) => {
        const a = posts(v.params, v.tallies, v.order);
        const b: PostsResult = posts({ posts: postIds, candidates: cands }, v.tallies, v.order);
        expect(b.assignment).toEqual(a.assignment);
        expect(b.unassigned).toEqual(a.unassigned);
        for (const p of v.params.posts) expect(b.ranking[p]).toEqual(a.ranking[p]);
      }),
    );
  });
});

describe("draws (spec/draws.md §4)", () => {
  const sigma = fc.uint8Array({ minLength: 32, maxLength: 32 });

  it("is a deterministic permutation", () => {
    fc.assert(
      fc.property(sigma, fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 12 }), (s, items) => {
        const { order } = shuffle(s, items);
        expect([...order].sort()).toEqual([...items].sort());
        expect(shuffle(s, [...items].reverse()).order).toEqual(order);
      }),
    );
  });

  it("gives every order of three items about the same frequency", () => {
    const counts = new Map<string, number>();
    const samples = 6000;
    for (let i = 0; i < samples; i++) {
      const s = new Uint8Array(32);
      new DataView(s.buffer).setUint32(0, i);
      const key = shuffle(s, ["a", "b", "c"]).order.join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    // Chi-squared with 5 degrees of freedom; 20.5 is the 0.999 quantile.
    const expected = samples / 6;
    const chi2 = [...counts.values()].reduce((x, n) => x + (n - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(20.5);
  });
});

describe("thresholds (spec/methods.md §1.1)", () => {
  const fraction = fc.integer({ min: 1, max: 12 }).chain((q) => fc.tuple(fc.integer({ min: 0, max: q }), fc.constant(q)));

  it("ceil_frac is the least count that meets the fraction", () => {
    fc.assert(
      fc.property(fc.nat(10_000), fraction, (n, f) => {
        const r = ceilFrac(n, f);
        expect(meets(r, n, f)).toBe(true);
        if (r > 0) expect(meets(r - 1, n, f)).toBe(false);
      }),
    );
  });
});

describe("yes_no (spec/methods.md §2)", () => {
  it("one more vote for never turns approval into rejection", () => {
    const rule = fc.oneof(fc.constant("simple"), fc.constant("absolute"), fc.constant([2, 3] as const));
    const base = fc.constantFrom("cast", "present", "present_plus_proxies", "members");
    const t = fc.record({ for: fc.nat(30), against: fc.nat(30), blank: fc.nat(30), abstain: fc.nat(30) });
    fc.assert(
      fc.property(rule, base, t, (rule, base, q) => {
        const before = yesNo({ base, rule }, { q }, counters);
        const after = yesNo({ base, rule }, { q: { ...q, for: q.for + 1 } }, counters);
        if (before.outcome === "approved" && base !== "cast") expect(after.outcome).toBe("approved");
        if (before.outcome === "approved" && rule === "simple") expect(after.outcome).toBe("approved");
      }),
    );
  });
});

describe("single_winner (spec/methods.md §3)", () => {
  it("first round: an elected candidate has an absolute majority, otherwise two go on", () => {
    const voting = fc.integer({ min: 2, max: 5 }).chain((n) =>
      fc.record({ cands: fc.constant(ids("c", n)), votes: fc.array(fc.nat(10), { minLength: n, maxLength: n }), blank: fc.nat(5), against_all: fc.nat(5) }),
    );
    fc.assert(
      fc.property(voting, ({ cands, votes, blank, against_all }) => {
        const choice: Record<string, number> = { ...Object.fromEntries(cands.map((c, i) => [c, votes[i]!])), blank, against_all, abstain: 0 };
        const r = singleWinner({ candidates: cands, stage: "first", attempt: 0, repetitions: 1 }, { choice });
        if (r.outcome === "elected") expect(2 * choice[r.elected]! > r.cast).toBe(true);
        else if (r.outcome === "runoff") expect(r.qualified).toHaveLength(2);
        else {
          expect(r.outcome).toBe("repeat");
          if (r.outcome === "repeat") expect(r.qualified.length + r.spots).toBe(2);
        }
      }),
    );
  });
});

describe("limited_vote (spec/methods.md §5)", () => {
  it("elects at most the seats, from a ranking sorted by votes", () => {
    const voting = fc.integer({ min: 1, max: 6 }).chain((n) =>
      fc.record({
        cands: fc.constant(ids("c", n)),
        seats: fc.integer({ min: 1, max: n }),
        minimum: fc.nat(4),
        votes: fc.array(fc.nat(10), { minLength: n, maxLength: n }),
        order: permutationOf(ids("c", n)),
      }),
    );
    fc.assert(
      fc.property(voting, ({ cands, seats, minimum, votes, order }) => {
        const tallies: Tallies = { status: { marked: 10, blank: 0, abstain: 0 } };
        cands.forEach((c, i) => (tallies[c] = { marked: votes[i]!, unmarked: 10 - votes[i]! }));
        const r = limitedVote({ candidates: cands, seats, minimum }, tallies, order);
        expect(r.elected.length + r.vacant_seats).toBe(seats);
        expect(r.ranking.map((x) => x.votes)).toEqual([...votes].sort((a, b) => b - a));
        expect([...r.elected, ...r.substitutes]).toEqual(r.ranking.filter((x) => x.votes >= minimum).map((x) => x.cand));
      }),
    );
  });
});

describe("canonical JSON and chain (spec/formats.md §1.3, §9)", () => {
  const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/);
  const value = fc.letrec((tie) => ({
    v: fc.oneof(
      { depthSize: "small" },
      fc.constant(null),
      fc.boolean(),
      fc.maxSafeInteger(),
      fc.string(),
      fc.array(tie("v"), { maxLength: 3 }),
      fc.dictionary(key, tie("v"), { maxKeys: 3, noNullPrototype: true }),
    ),
  })).v;

  it("parsing the canonical form gives the same canonical form", () => {
    fc.assert(
      fc.property(value, (v) => {
        const text = canonicalize(v);
        expect(canonicalize(JSON.parse(text))).toBe(text);
      }),
    );
  });

  it("a built chain verifies", () => {
    fc.assert(
      fc.property(fc.array(value, { maxLength: 5 }), (docs) => {
        expect(verifyChain(buildChain(docs), docs)).toBeNull();
      }),
    );
  });
});
