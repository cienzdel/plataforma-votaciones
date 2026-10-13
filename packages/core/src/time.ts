import { check } from "./types.ts";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** True for an RFC 3339 UTC timestamp with second precision (spec/formats.md §1.5). */
export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && formatTimestamp(Date.parse(value)) === value;
}

/** Parses a timestamp into Unix seconds. */
export function parseTimestamp(value: string): number {
  check(isTimestamp(value), "invalid timestamp");
  return Date.parse(value) / 1000;
}

/** Formats Unix milliseconds as a timestamp, or "" for NaN. */
export function formatTimestamp(ms: number): string {
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString().replace(".000Z", "Z");
}
