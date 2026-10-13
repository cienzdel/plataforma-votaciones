/** Test harness: in-memory SQLite, in-memory mailer, movable clock and fictitious people. */
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.ts";
import { ensureFirstOfficial } from "../src/census.ts";
import type { Deps } from "../src/context.ts";
import { openDb } from "../src/db/index.ts";
import { MemoryMailer } from "../src/mail/index.ts";
import { parseProfile } from "../src/profile.ts";

export const PROFILE = parseProfile(JSON.parse(readFileSync(new URL("../../../profiles/example.json", import.meta.url), "utf8")));
export const FIRST = { email: "mesa@example.org", name: "Persona Mesa" };

export function census(n: number, degree = (i: number) => (i % 2 === 0 ? "bio" : "phys")): string {
  const rows = Array.from({ length: n }, (_, i) => `Persona ${i + 1},p${i + 1}@example.org,${degree(i + 1)}`);
  return ["name,email,degrees", `${FIRST.name},${FIRST.email},bio`, ...rows].join("\n");
}

export function setup() {
  const clock = { t: Date.UTC(2027, 2, 10, 17, 0) };
  const mailer = new MemoryMailer();
  const deps: Deps = { db: openDb(":memory:"), mailer, profile: PROFILE, now: () => clock.t, webOrigin: "https://vote.example.org" };
  ensureFirstOfficial(deps, FIRST);
  const app = createApp(deps);

  async function call(method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    const res = await app.request(path, { method, headers, body: body === undefined ? null : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** The last login code e-mailed to `email`. */
  function lastCode(email: string): string {
    const m = [...mailer.sent].reverse().find((x) => x.to === email && /\d{8}/.test(x.text));
    return m!.text.match(/\d{8}/)![0];
  }

  async function login(email: string): Promise<string> {
    clock.t += 61_000; // past the per-address interval
    await call("POST", "/auth/code", { email });
    const res = await call("POST", "/auth/session", { email, code: lastCode(email) });
    if (res.status !== 200) throw new Error("login failed: " + JSON.stringify(res.body));
    return res.body.token;
  }

  /** Logs in the first official and loads a census of `n` more members. Returns the official's token and the members. */
  async function withCensus(n = 9) {
    const official = await login(FIRST.email);
    await call("POST", "/census/import", { csv: census(n) }, official);
    const members: { id: string; email: string; name: string; degrees: string[] }[] = (await call("GET", "/census", undefined, official)).body.members;
    const byEmail = (e: string) => members.find((m) => m.email === e)!;
    return { official, members, byEmail };
  }

  return { deps, app, clock, mailer, call, lastCode, login, withCensus };
}
