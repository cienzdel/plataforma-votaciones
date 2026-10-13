import { check, type Tallies } from "../types.ts";
import { idList, nonNegativeInt, tallyOf } from "./common.ts";

export type SingleWinnerResult = {
  cast: number;
  tallies: Record<string, number>;
} & (
  | { outcome: "elected"; elected: string }
  | { outcome: "vacant" }
  | { outcome: "runoff" | "qualified"; qualified: string[] }
  | { outcome: "repeat" | "draw_required"; qualified: string[]; tied: string[]; spots: number }
);

type Selection =
  | { outcome: "qualified"; qualified: string[] }
  | { outcome: "repeat" | "draw_required"; qualified: string[]; tied: string[]; spots: number };

/** Ballot values of the `choice` cell. */
export function singleWinnerValues(candidates: readonly string[]): string[] {
  return [...candidates, "blank", "against_all", "abstain"];
}

/** select(k) of spec/methods.md §3.4. Id lists follow the order of `candidates`. */
function select(candidates: string[], votes: Map<string, number>, k: number, attempt: number, repetitions: number): Selection {
  const sorted = [...candidates].sort((x, y) => votes.get(y)! - votes.get(x)!);
  const inOrder = (ids: Set<string>) => candidates.filter((c) => ids.has(c));
  if (sorted.length <= k || votes.get(sorted[k]!)! < votes.get(sorted[k - 1]!)!) {
    return { outcome: "qualified", qualified: inOrder(new Set(sorted.slice(0, k))) };
  }
  const t = votes.get(sorted[k - 1]!)!;
  const qualified = candidates.filter((c) => votes.get(c)! > t);
  return {
    outcome: attempt < repetitions ? "repeat" : "draw_required",
    qualified,
    tied: candidates.filter((c) => votes.get(c) === t),
    spots: k - qualified.length,
  };
}

export interface SingleWinnerParams {
  candidates: string[];
  stage: "first" | "qualify" | "runoff";
  spots: number;
  attempt: number;
  repetitions: number;
  against_all_blocks: boolean;
}

/** Validates the parameters of spec/methods.md §3. `spots` is 0 outside `qualify`. */
export function singleWinnerParams(params: Record<string, unknown>): SingleWinnerParams {
  const candidates = idList(params.candidates, "candidates");
  const { stage, against_all_blocks } = params;
  check(stage === "first" || stage === "qualify" || stage === "runoff", "invalid stage");
  check(stage !== "runoff" || candidates.length === 2, "a run-off has exactly two candidates");
  const spots = stage === "qualify" ? nonNegativeInt(params.spots, "spots") : 0;
  check(stage !== "qualify" || (spots >= 1 && spots < candidates.length), "invalid spots");
  check(against_all_blocks === undefined || typeof against_all_blocks === "boolean", "invalid against_all_blocks");
  return {
    candidates,
    stage,
    spots,
    attempt: nonNegativeInt(params.attempt, "attempt"),
    repetitions: nonNegativeInt(params.repetitions, "repetitions"),
    against_all_blocks: against_all_blocks === true,
  };
}

/** spec/methods.md §3. */
export function singleWinner(params: Record<string, unknown>, tallies: Tallies): SingleWinnerResult {
  const { candidates, stage, spots, attempt, repetitions, against_all_blocks } = singleWinnerParams(params);
  const t = tallyOf(tallies, "choice", singleWinnerValues(candidates));
  const votes = new Map(candidates.map((c) => [c, t[c]!]));
  const againstAll = t.against_all!;
  const cast = candidates.reduce((n, c) => n + votes.get(c)!, 0) + t.blank! + againstAll;
  const { abstain: _abstain, ...withoutAbstain } = t;
  const base = { cast, tallies: withoutAbstain };

  switch (stage) {
    case "first": {
      if (candidates.length === 1) {
        const c = candidates[0]!;
        return votes.get(c)! > againstAll ? { ...base, outcome: "elected", elected: c } : { ...base, outcome: "vacant" };
      }
      const winner = candidates.find((c) => 2 * votes.get(c)! > cast);
      if (winner !== undefined) return { ...base, outcome: "elected", elected: winner };
      const s = select(candidates, votes, 2, attempt, repetitions);
      return s.outcome === "qualified" ? { ...base, outcome: "runoff", qualified: s.qualified } : { ...base, ...s };
    }
    case "qualify":
      return { ...base, ...select(candidates, votes, spots, attempt, repetitions) };
    case "runoff": {
      const [a, b] = candidates as [string, string];
      const va = votes.get(a)!;
      const vb = votes.get(b)!;
      if (against_all_blocks && againstAll > va && againstAll > vb) return { ...base, outcome: "vacant" };
      if (va !== vb) return { ...base, outcome: "elected", elected: va > vb ? a : b };
      return { ...base, outcome: attempt < repetitions ? "repeat" : "draw_required", qualified: [], tied: [a, b], spots: 1 };
    }
  }
}
