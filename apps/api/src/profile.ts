import { isFraction, isId, type Fraction } from "@pv/core";

/** The members of a profile (spec/formats.md §11) that the API uses. */
export interface Profile {
  type: "profile";
  version: 1;
  id: string;
  profile_version: string;
  body: string;
  quorum: Fraction[];
  second_call_after_minutes: number;
  max_proxies: number;
  degrees: { id: string; name: string }[];
  assent_min_days: number;
  timezone: string;
  [key: string]: unknown;
}

const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;

/** Validates a parsed profile document. Throws with the name of the first invalid member. */
export function parseProfile(value: unknown): Profile {
  if (typeof value !== "object" || value === null) throw new Error("invalid profile member: type");
  const p = value as Profile;
  const checks: [string, boolean][] = [
    ["type", p.type === "profile" && p.version === 1],
    ["id", typeof p.id === "string" && typeof p.profile_version === "string" && typeof p.body === "string"],
    ["quorum", Array.isArray(p.quorum) && p.quorum.length >= 1 && p.quorum.every(isFraction)],
    ["second_call_after_minutes", count(p.second_call_after_minutes)],
    ["max_proxies", count(p.max_proxies)],
    ["degrees", Array.isArray(p.degrees) && p.degrees.every((d) => isId(d.id) && typeof d.name === "string")],
    ["assent_min_days", count(p.assent_min_days)],
    ["timezone", typeof p.timezone === "string"],
  ];
  const bad = checks.find(([, ok]) => !ok);
  if (bad) throw new Error("invalid profile member: " + bad[0]);
  return p;
}
