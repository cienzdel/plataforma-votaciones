import { check, type Tallies } from "../types.js";
import { idList, isId, orderIndex, tallyOf } from "./common.js";

export const POSTS_VALUES = ["for", "against", "abstain"] as const;

export interface PostCandidate {
  id: string;
  preferences: string[];
}

export interface RankingEntry {
  cand: string;
  for: number;
  against: number;
  abstain: number;
  eligible: boolean;
}

export interface PostsResult {
  assignment: Record<string, string | null>;
  ranking: Record<string, RankingEntry[]>;
  unassigned: string[];
}

export interface PostsParams {
  posts: string[];
  candidates: PostCandidate[];
}

/** Validates the parameters of spec/methods.md §4. */
export function postsParams(params: Record<string, unknown>): PostsParams {
  const posts = idList(params.posts, "posts");
  const raw = params.candidates;
  check(Array.isArray(raw) && raw.length > 0, "invalid candidates");
  const candidates = raw.map((c: unknown) => {
    const { id, preferences } = c as PostCandidate;
    check(isId(id), "invalid candidate id");
    const prefs = idList(preferences, "preferences");
    check(prefs.every((v) => posts.includes(v)), "preference for an unknown post");
    return { id, preferences: prefs };
  });
  idList(
    candidates.map((c) => c.id),
    "candidates",
  );
  return { posts, candidates };
}

/** Cell key of candidate `c` for post `v`. */
export function postCell(c: string, v: string): string {
  return c + "@" + v;
}

/** spec/methods.md §4: candidate-proposing deferred acceptance. */
export function posts(params: Record<string, unknown>, tallies: Tallies, tiebreakOrder?: readonly string[]): PostsResult {
  const { posts: postIds, candidates } = postsParams(params);
  const ids = candidates.map((c) => c.id);
  const pos = orderIndex(tiebreakOrder, ids);
  const byOrder = [...candidates].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);

  const tally = (c: string, v: string) => tallyOf(tallies, postCell(c, v), POSTS_VALUES);
  const eligible = (c: string, v: string) => tally(c, v).for! > tally(c, v).against!;
  // Negative when `a` ranks before `b` in post `v`: more for, then fewer against, then tie-break order.
  const compare = (v: string) => (a: string, b: string) =>
    tally(b, v).for! - tally(a, v).for! || tally(a, v).against! - tally(b, v).against! || pos.get(a)! - pos.get(b)!;

  const prefs = new Map(candidates.map((c) => [c.id, c.preferences]));
  const next = new Map(ids.map((c) => [c, 0]));
  const held = new Map<string, string>();
  const free = byOrder.filter((c) => c.preferences.some((v) => eligible(c.id, v))).map((c) => c.id);

  while (free.length > 0) {
    const c = free.shift()!;
    const list = prefs.get(c)!;
    let i = next.get(c)!;
    while (i < list.length && !eligible(c, list[i]!)) i++;
    if (i === list.length) continue;
    const v = list[i]!;
    next.set(c, i + 1);
    const holder = held.get(v);
    if (holder === undefined) held.set(v, c);
    else if (compare(v)(c, holder) < 0) {
      free.push(holder);
      held.set(v, c);
    } else free.push(c);
  }

  const ranking: Record<string, RankingEntry[]> = {};
  for (const v of postIds) {
    const applied = ids.filter((c) => prefs.get(c)!.includes(v));
    const yes = applied.filter((c) => eligible(c, v)).sort(compare(v));
    const no = applied.filter((c) => !eligible(c, v)).sort(compare(v));
    ranking[v] = [...yes, ...no].map((c) => ({ cand: c, ...tally(c, v), eligible: yes.includes(c) }) as RankingEntry);
  }
  const holders = new Set(held.values());
  return {
    assignment: Object.fromEntries(postIds.map((v) => [v, held.get(v) ?? null])),
    ranking,
    unassigned: byOrder.map((c) => c.id).filter((c) => !holders.has(c)),
  };
}

/** Later vacancy helper (spec/methods.md §4, informative). */
export function vacancyNext(result: PostsResult, post: string, leaving: string): string | null {
  const ranking = result.ranking[post];
  check(ranking !== undefined, "unknown post");
  const holders = new Set(Object.entries(result.assignment).filter(([v]) => v !== post).map(([, c]) => c));
  const entry = ranking.find((r) => r.eligible && r.cand !== leaving && !holders.has(r.cand));
  return entry === undefined ? null : entry.cand;
}
