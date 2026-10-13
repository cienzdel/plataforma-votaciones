export type Fraction = readonly [number, number];

/** `tallies[cell][value]` (spec/formats.md §3). */
export type Tallies = Record<string, Record<string, number>>;

export type Method = "yes_no" | "single_winner" | "posts" | "limited_vote";
export type Mode = "secret" | "roll_call" | "manual" | "paper";
export type Timing = "live" | "final_link";

export interface Counters {
  session_members: number;
  session_present: number;
  members: number;
  present: number;
  proxies: number;
  rights: number;
}

export interface BoardCounters extends Counters {
  issued: number | null;
  received: number;
}

export interface Rules {
  electorate_filter: string | null;
  method: Method;
  min_attendance: Fraction | null;
  mode: Mode;
  params: Record<string, unknown>;
  profile: { hash: string; id: string; version: string };
  quorum: Fraction;
  timing: Timing;
}

/** A violation of the specification in an input document. */
export class SpecError extends Error {}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SpecError(message);
}
