import { concat, fromHex, hash, tag, toHex, utf8 } from "./bytes.js";
import { hashJsonHex } from "./jcs.js";
import { idList } from "./methods/common.js";
import { limitedVoteParams, MARK_VALUES, STATUS_VALUES } from "./methods/limitedVote.js";
import { postCell, postsParams, POSTS_VALUES } from "./methods/posts.js";
import { singleWinnerValues } from "./methods/singleWinner.js";
import { YES_NO_VALUES } from "./methods/yesNo.js";
import { check, type Method, type Tallies } from "./types.js";

/** Cell keys of a voting and the values allowed in each (spec/formats.md §3). */
export type CellSpec = Map<string, readonly string[]>;

export function cellSpec(method: Method, params: Record<string, unknown>): CellSpec {
  switch (method) {
    case "yes_no":
      return new Map([["q", YES_NO_VALUES]]);
    case "single_winner":
      return new Map([["choice", singleWinnerValues(idList(params.candidates, "candidates"))]]);
    case "posts":
      return new Map(postsParams(params).candidates.flatMap((c) => c.preferences.map((v) => [postCell(c.id, v), POSTS_VALUES] as const)));
    case "limited_vote": {
      const { candidates } = limitedVoteParams(params);
      return new Map<string, readonly string[]>([["status", STATUS_VALUES], ...candidates.map((c) => [c, MARK_VALUES] as const)]);
    }
    default:
      check(false, "unknown method");
  }
}

/**
 * Checks a complete ballot as the reception service does (spec/protocol.md §6, check 5):
 * every cell present with an allowed value not hidden by the profile, plus the method's ballot rules.
 */
export function validAnswers(
  method: Method,
  params: Record<string, unknown>,
  answers: Record<string, unknown>,
  hidden: readonly string[] = [],
): boolean {
  const spec = cellSpec(method, params);
  const keys = Object.keys(answers);
  const cellsOk =
    keys.length === spec.size &&
    keys.every((c) => {
      const value = answers[c];
      return spec.get(c)?.includes(value as string) === true && !hidden.includes(value as string);
    });
  if (!cellsOk || method !== "limited_vote") return cellsOk;
  const { candidates, k } = limitedVoteParams(params);
  const marks = candidates.filter((c) => answers[c] === "marked").length;
  return answers.status === "marked" ? marks >= 1 && marks <= k : marks === 0;
}

/** `id_c = H(tag("pv/cell/v1") ‖ s ‖ voting_id ‖ utf8(c))` (spec/formats.md §2.4). */
export function cellId(s: Uint8Array, votingId: Uint8Array, cell: string): Uint8Array {
  check(s.length === 32 && votingId.length === 16, "invalid ballot secret or voting id");
  return hash(concat(tag("pv/cell/v1"), s, votingId, utf8(cell)));
}

export function cellIdHex(s: string, votingId: string, cell: string): string {
  return toHex(cellId(fromHex(s), fromHex(votingId), cell));
}

/** Counts the values of every cell; every allowed value is listed, including zeros. */
export function tallyCells(spec: CellSpec, cells: Record<string, readonly (readonly [string, string])[]>): Tallies {
  const tallies: Tallies = {};
  for (const [cell, values] of spec) {
    const t = Object.fromEntries(values.map((v) => [v, 0]));
    for (const [, value] of cells[cell] ?? []) t[value] = (t[value] ?? 0) + 1;
    tallies[cell] = t;
  }
  return tallies;
}

/** The vote object sent to the reception service (spec/protocol.md §6). */
export interface Vote {
  answers: Record<string, string>;
  s: string;
  sig: string;
  token: string;
  voting_id: string;
}

/** `ack = HJ(vote object)`. */
export function voteAck(vote: Vote): string {
  return hashJsonHex({ answers: vote.answers, s: vote.s, sig: vote.sig, token: vote.token, voting_id: vote.voting_id });
}
