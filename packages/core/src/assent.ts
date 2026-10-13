import { formatTimestamp, parseTimestamp } from "./time.ts";
import { check } from "./types.ts";

/** Wall-clock fields of the instant `ms` in `timeZone`. */
function wallClock(ms: number, timeZone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(ms);
  return ["year", "month", "day", "hour", "minute", "second"].map((t) => Number(parts.find((p) => p.type === t)!.value));
}

/** Offset of `timeZone` from UTC at the instant `ms`, in milliseconds. */
function offset(ms: number, timeZone: string): number {
  const [y, mo, d, h, mi, s] = wallClock(ms, timeZone) as [number, number, number, number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi, s) - ms;
}

/**
 * Minimum closing time of an assent: 23:59:00 local time on the date `d + minDays`, where `d`
 * is the local date of `sentAt` in `timeZone` (spec/methods.md §7). Returned in UTC.
 */
export function assentMinClose(sentAt: string, timeZone: string, minDays: number): string {
  check(Number.isSafeInteger(minDays) && minDays >= 0, "invalid number of days");
  const [y, mo, d] = wallClock(parseTimestamp(sentAt) * 1000, timeZone) as [number, number, number];
  const local = Date.UTC(y, mo - 1, d + minDays, 23, 59, 0);
  // Two passes find the offset in force at the target instant, even across a DST change.
  const guess = local - offset(local, timeZone);
  return formatTimestamp(local - offset(guess, timeZone));
}

/** `approved` if no objection stands at the closing time, otherwise `next_plenary`. */
export function assentOutcome(objections: number): "approved" | "next_plenary" {
  check(Number.isSafeInteger(objections) && objections >= 0, "invalid number of objections");
  return objections === 0 ? "approved" : "next_plenary";
}
