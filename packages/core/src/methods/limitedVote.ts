import { check, type Tallies } from "../types.ts";
import { idList, nonNegativeInt, orderIndex, tallyOf } from "./common.ts";

export const STATUS_VALUES = ["marked", "blank", "abstain"] as const;
export const MARK_VALUES = ["marked", "unmarked"] as const;

export interface LimitedVoteResult {
  k: number;
  ranking: { cand: string; votes: number }[];
  elected: string[];
  substitutes: string[];
  vacant_seats: number;
  marked_ballots: number;
  blank: number;
  abstain: number;
}

export interface LimitedVoteParams {
  candidates: string[];
  seats: number;
  minimum: number;
  k: number;
}

/** Validates the parameters of spec/methods.md §5 and derives `k = max(1, m − 1)`. */
export function limitedVoteParams(params: Record<string, unknown>): LimitedVoteParams {
  const candidates = idList(params.candidates, "candidates");
  const seats = nonNegativeInt(params.seats, "seats");
  check(seats >= 1, "invalid seats");
  return { candidates, seats, minimum: nonNegativeInt(params.minimum, "minimum"), k: Math.max(1, seats - 1) };
}

/**
 * Aggregate consistency of spec/methods.md §5: each candidate has at most
 * `marked_ballots` votes, and `marked_ballots ≤ Σ votes ≤ k·marked_ballots`.
 */
export function limitedVoteConsistent(params: Record<string, unknown>, tallies: Tallies): boolean {
  const { candidates, k } = limitedVoteParams(params);
  const marked = tallyOf(tallies, "status", STATUS_VALUES).marked!;
  const votes = candidates.map((c) => tallyOf(tallies, c, MARK_VALUES).marked!);
  const sum = votes.reduce((a, b) => a + b, 0);
  return votes.every((v) => v <= marked) && marked <= sum && sum <= k * marked;
}

/** spec/methods.md §5. */
export function limitedVote(params: Record<string, unknown>, tallies: Tallies, tiebreakOrder?: readonly string[]): LimitedVoteResult {
  const { candidates, seats, minimum, k } = limitedVoteParams(params);
  const pos = orderIndex(tiebreakOrder, candidates);
  const votes = new Map(candidates.map((c) => [c, tallyOf(tallies, c, MARK_VALUES).marked!]));
  const status = tallyOf(tallies, "status", STATUS_VALUES);
  const sorted = [...candidates].sort((a, b) => votes.get(b)! - votes.get(a)! || pos.get(a)! - pos.get(b)!);
  const reaching = sorted.filter((c) => votes.get(c)! >= minimum);
  const elected = reaching.slice(0, seats);
  return {
    k,
    ranking: sorted.map((c) => ({ cand: c, votes: votes.get(c)! })),
    elected,
    substitutes: reaching.slice(seats),
    vacant_seats: seats - elected.length,
    marked_ballots: status.marked!,
    blank: status.blank!,
    abstain: status.abstain!,
  };
}
