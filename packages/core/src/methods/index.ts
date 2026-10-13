import { check, type Counters, type Method, type Tallies } from "../types.js";
import { limitedVote, limitedVoteParams, type LimitedVoteResult } from "./limitedVote.js";
import { posts, postsParams, type PostsResult } from "./posts.js";
import { singleWinner, singleWinnerParams, type SingleWinnerResult } from "./singleWinner.js";
import { yesNo, yesNoParams, type YesNoResult } from "./yesNo.js";

export type MethodResult = YesNoResult | SingleWinnerResult | PostsResult | LimitedVoteResult;

export const METHODS: readonly Method[] = ["yes_no", "single_winner", "posts", "limited_vote"];

/** Methods that need a tie-break order (spec/draws.md). */
export function needsTiebreakOrder(method: Method): boolean {
  return method === "posts" || method === "limited_vote";
}

/** Validates the parameters of a method and returns its candidate ids ([] for `yes_no`). */
export function validateParams(method: Method, params: Record<string, unknown>): string[] {
  switch (method) {
    case "yes_no":
      yesNoParams(params);
      return [];
    case "single_winner":
      return singleWinnerParams(params).candidates;
    case "posts":
      return postsParams(params).candidates.map((c) => c.id);
    case "limited_vote":
      return limitedVoteParams(params).candidates;
    default:
      check(false, "unknown method");
  }
}

/** Runs the counting method of a voting (spec/methods.md). */
export function computeResult(
  method: Method,
  params: Record<string, unknown>,
  tallies: Tallies,
  counters: Counters,
  tiebreakOrder?: readonly string[],
): MethodResult {
  switch (method) {
    case "yes_no":
      return yesNo(params, tallies, counters);
    case "single_winner":
      return singleWinner(params, tallies);
    case "posts":
      return posts(params, tallies, tiebreakOrder);
    case "limited_vote":
      return limitedVote(params, tallies, tiebreakOrder);
    default:
      check(false, "unknown method");
  }
}
