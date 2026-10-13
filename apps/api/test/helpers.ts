/** Test harness: in-memory SQLite, in-memory mailer, movable clock and fictitious people. */
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.ts";
import { ensureFirstOfficial } from "../src/census.ts";
import type { Deps } from "../src/context.ts";
import { openDb } from "../src/db/index.ts";
import { MemoryMailer } from "../src/mail/index.ts";
import { parseProfile } from "../src/profile.ts";
import { MemoryPublisher } from "../src/publisher.ts";
import { receptionApp } from "../src/reception.ts";

export const PROFILE = parseProfile(JSON.parse(readFileSync(new URL("../../../profiles/example.json", import.meta.url), "utf8")));
export const FIRST = { email: "mesa@example.org", name: "Persona Mesa" };

export function census(n: number, degree = (i: number) => (i % 2 === 0 ? "bio" : "phys")): string {
  const rows = Array.from({ length: n }, (_, i) => `Persona ${i + 1},p${i + 1}@example.org,${degree(i + 1)}`);
  return ["name,email,degrees", `${FIRST.name},${FIRST.email},bio`, ...rows].join("\n");
}

/** Real quicknet rounds the fake drand knows (also used by spec/cases/draw-001). */
export const DRAND_ROUND = 33026212;
export const drandRounds = new Map([[DRAND_ROUND, "9791658769c0476a1f88d6b08366504f486ce0a883e4fb17e19b666f39e34f138bb4c480d84f57378d5e9d6694996f92"]]);

export function setup(trace?: (sql: string) => void) {
  const clock = { t: Date.UTC(2027, 2, 10, 17, 0) };
  const mailer = new MemoryMailer();
  const publisher = new MemoryPublisher();
  const deps: Deps = {
    db: openDb(":memory:", trace), mailer, profile: PROFILE, now: () => clock.t, webOrigin: "https://vote.example.org",
    publisher, masterKey: Buffer.alloc(32, 7), drand: async (round) => drandRounds.get(round) ?? null,
  };
  ensureFirstOfficial(deps, FIRST);
  const app = createApp(deps);
  const reception = receptionApp(deps);

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

  return { deps, app, reception, clock, mailer, publisher, call, lastCode, login, withCensus };
}
