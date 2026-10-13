import { ceilFrac } from "./fraction.js";
import type { Counters, Fraction } from "./types.js";

export interface Threshold {
  required: number;
  met: boolean;
}

export interface QuorumResult extends Threshold {
  min_attendance: Threshold | null;
}

function threshold(c: Pick<Counters, "session_members" | "session_present">, f: Fraction): Threshold {
  const required = ceilFrac(c.session_members, f);
  return { required, met: c.session_present >= required };
}

/** Quorum and minimum attendance at opening (spec/methods.md §1.2). Proxies never count. */
export function computeQuorum(
  rules: { quorum: Fraction; min_attendance: Fraction | null },
  counters: Pick<Counters, "session_members" | "session_present">,
): QuorumResult {
  return {
    ...threshold(counters, rules.quorum),
    min_attendance: rules.min_attendance === null ? null : threshold(counters, rules.min_attendance),
  };
}
