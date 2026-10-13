import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBoard } from "@pv/core";
import { describe, expect, it, vi } from "vitest";
import { ballotReceived, issuance, signingKey, spentToken } from "../src/db/schema.ts";
import { DirectoryPublisher } from "../src/publisher.ts";
import { closeDue } from "../src/votings.ts";
import { FIRST, setup } from "./helpers.ts";
import { blind, cast, finalize, type Credential } from "./voter.ts";

const YES_NO = { method: "yes_no", params: { base: "cast", rule: "simple" }, timing: "live" };

/** A meeting with the official, p1 and p2 present, and p3 delegating to p1. */
async function session(trace?: (sql: string) => void) {
  const t = setup(trace);
  const c = await t.withCensus(9);
  const meetingId = (await t.call("POST", "/meetings", { title: "Ordinary meeting" }, c.official)).body.id as string;
  await t.call("POST", `/meetings/${meetingId}/open`, undefined, c.official);
  for (const e of [FIRST.email, "p1@example.org", "p2@example.org", "p4@example.org"]) {
    await t.call("POST", `/meetings/${meetingId}/attendance`, { member_id: c.byEmail(e).id, kind: "in", mode: "in_person" }, c.official);
  }
  await t.call("POST", `/meetings/${meetingId}/delegations`, { from_member_id: c.byEmail("p3@example.org").id, to_member_id: c.byEmail("p1@example.org").id, justified: true }, c.official);
  const tokens = { official: c.official, p1: await t.login("p1@example.org"), p2: await t.login("p2@example.org"), p4: await t.login("p4@example.org"), p5: await t.login("p5@example.org") };

  async function createAndOpen(body: Record<string, unknown> = YES_NO, openBody: Record<string, unknown> = {}) {
    const v = await t.call("POST", "/votings", { meeting_id: meetingId, title: "Approval of the minutes", ...body }, c.official);
    if (v.status !== 201) throw new Error(JSON.stringify(v.body));
    const opened = await t.call("POST", `/votings/${v.body.id}/open`, openBody, c.official);
    if (opened.status !== 200) throw new Error(JSON.stringify(opened.body));
    return opened.body as { id: string; opening: { key: { public_key: string } }; status: string };
  }

  async function credential(votingId: string, token: string, right = 0): Promise<Credential> {
    const v = (await t.call("GET", `/votings/${votingId}`, undefined, token)).body;
    const b = await blind(v.opening.key.public_key, votingId);
    const res = await t.call("POST", "/votings/issue", { voting_id: votingId, right, blinded_msg: b.blindedMsg }, token);
    if (res.status !== 200) throw new Error(JSON.stringify(res.body));
    return finalize(b, res.body.blind_sig);
  }

  return { ...t, ...c, meetingId, tokens, createAndOpen, credential };
}

describe("secret voting, live", () => {
  it("runs from opening to a verified, published board", async () => {
    const t = await session();
    const v = await t.createAndOpen();
    expect(v.status).toBe("open");
    const opening = JSON.parse(t.publisher.files.get([...t.publisher.files.keys()].find((p) => p.endsWith(".opening.json"))!)!);
    expect(opening.quorum).toMatchObject({ required: 4, met: true, forced: null });

    // p1 holds a proxy: 2 rights, so 2 credentials and 2 ballots.
    expect((await t.call("GET", `/votings/${v.id}`, undefined, t.tokens.p1)).body.my_rights).toBe(2);
    const creds = [
      await t.credential(v.id, t.tokens.official),
      await t.credential(v.id, t.tokens.p1, 0),
      await t.credential(v.id, t.tokens.p1, 1),
      await t.credential(v.id, t.tokens.p2),
    ];
    const answers = ["for", "for", "against", "abstain"];
    const results = [];
    for (const [i, cred] of creds.entries()) results.push(await cast(t.reception, v.id, cred, { q: answers[i]! }));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(results[0]!.body.ack).toBe(results[0]!.receipt.ack);

    const closed = await t.call("POST", `/votings/${v.id}/close`, undefined, t.official);
    expect(closed.body.status).toBe("closed");
    const board = closed.body.board;
    expect(board.result).toMatchObject({ for: 2, against: 1, abstain: 1, outcome: "approved" });
    expect(board.counters).toMatchObject({ session_members: 10, session_present: 4, present: 4, proxies: 1, rights: 5, issued: 4, received: 4 });

    // The published files verify with the core, including a voter's receipt.
    const chain = JSON.parse(t.publisher.files.get("chain.json")!);
    const report = await verifyBoard({ opening, board, chain, receipt: results[1]!.receipt });
    expect(report).toEqual({ valid: true, result: board.result });

    // Key destroyed, ballots erased, tokens kept.
    expect(t.deps.db.select().from(signingKey).get()!.privateKey).toBeNull();
    expect(t.deps.db.select().from(ballotReceived).all()).toEqual([]);
    expect(t.deps.db.select().from(spentToken).all()).toHaveLength(4);

    // Everyone in the electorate is told how many credentials were issued in their name.
    const p1Mail = t.mailer.sent.find((m) => m.to === "p1@example.org" && m.subject.startsWith("Resultado"))!;
    expect(p1Mail.text).toContain("2 credenciales");
    expect(p1Mail.text).toContain(chain.records[0].record_hash);
    expect(t.mailer.sent.find((m) => m.to === "p9@example.org" && m.subject.startsWith("Resultado"))!.text).toContain("0 credentials");

    // Nothing more can be issued or cast.
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: "00".repeat(384) }, t.tokens.p4)).status).toBe(409);
    expect((await cast(t.reception, v.id, creds[0]!, { q: "for" })).status).toBe(409);
  });

  it("issues credentials idempotently and only within the snapshot", async () => {
    const t = await session();
    const v = await t.createAndOpen();
    const pk = v.opening.key.public_key;
    const b = await blind(pk, v.id);
    const first = await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: b.blindedMsg }, t.tokens.p2);
    const again = await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: b.blindedMsg }, t.tokens.p2);
    expect(again.body.blind_sig).toBe(first.body.blind_sig);
    const other = await blind(pk, v.id);
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: other.blindedMsg }, t.tokens.p2)).body).toEqual({ error: "already_issued" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 1, blinded_msg: other.blindedMsg }, t.tokens.p2)).body).toEqual({ error: "invalid_right" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: other.blindedMsg }, t.tokens.p5)).body).toEqual({ error: "not_in_electorate" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: "ff".repeat(384) }, t.tokens.p4)).body).toEqual({ error: "invalid_blinded_msg" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: "00" }, t.tokens.p4)).body).toEqual({ error: "invalid_blinded_msg" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: b.blindedMsg })).status).toBe(401);
    // The stored issuance has the hash of the blinded message, never the token.
    const row = t.deps.db.select().from(issuance).all()[0]!;
    expect(Object.keys(row).sort()).toEqual(["blindSig", "blindedHash", "memberId", "right", "votingId"]);
  });

  it("checks every ballot at reception", async () => {
    const t = await session();
    const v = await t.createAndOpen();
    const cred = await t.credential(v.id, t.tokens.p2);
    expect((await cast(t.reception, v.id, cred, { q: "maybe" })).body).toEqual({ error: "invalid_answers" });
    expect((await cast(t.reception, v.id, cred, {})).body).toEqual({ error: "invalid_answers" });
    expect((await cast(t.reception, v.id, { ...cred, sig: cred.sig.replace(/^../, "00") }, { q: "for" })).body).toEqual({ error: "invalid_signature" });
    expect((await cast(t.reception, v.id, { ...cred, token: cred.token.slice(0, 64) + "00".repeat(16) + cred.token.slice(96) }, { q: "for" })).body).toEqual({ error: "invalid_token" });
    expect((await cast(t.reception, "00".repeat(16), cred, { q: "for" })).body).toEqual({ error: "voting_not_found" });
    expect((await cast(t.reception, v.id, cred, { q: "for" }, { authorization: "Bearer " + t.tokens.p2 })).body).toEqual({ error: "session_not_accepted" });
    expect((await cast(t.reception, v.id, cred, { q: "for" }, { cookie: "a=b" })).body).toEqual({ error: "session_not_accepted" });

    const ok = await cast(t.reception, v.id, cred, { q: "for" });
    expect(ok.status).toBe(200);
    // Re-sending the identical vote is idempotent; a different one with the same token is refused.
    const resend = await t.reception.request("/cast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ok.vote) });
    expect(await resend.json()).toEqual({ ack: ok.body.ack });
    expect((await cast(t.reception, v.id, cred, { q: "for" })).body).toEqual({ error: "token_spent" });
    const bad = await t.reception.request("/cast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ok.vote, extra: 1 }) });
    expect(await bad.json()).toEqual({ error: "invalid_vote" });
  });

  it("requires a reason to open without quorum, and publishes it", async () => {
    const t = await session();
    const body = { ...YES_NO, min_attendance: [1, 2] };
    const v = await t.call("POST", "/votings", { meeting_id: t.meetingId, title: "Censure motion", ...body }, t.official);
    expect((await t.call("POST", `/votings/${v.body.id}/open`, {}, t.official)).body).toEqual({ error: "quorum_not_met" });
    const opened = await t.call("POST", `/votings/${v.body.id}/open`, { force_reason: "Agreed by the body" }, t.official);
    expect(opened.body.opening.quorum).toMatchObject({ forced: { reason: "Agreed by the body" }, min_attendance: { required: 5, met: false } });
  });

  it("annuls with a public reason", async () => {
    const t = await session();
    const v = await t.createAndOpen();
    await cast(t.reception, v.id, await t.credential(v.id, t.tokens.p2), { q: "for" });
    expect((await t.call("POST", `/votings/${v.id}/annul`, {}, t.official)).status).toBe(400);
    const res = await t.call("POST", `/votings/${v.id}/annul`, { reason: "Wrong question" }, t.official);
    expect(res.body.board).toMatchObject({ status: "annulled", annulment: { reason: "Wrong question" }, result: null });
    const opening = res.body.opening;
    const chain = JSON.parse(t.publisher.files.get("chain.json")!);
    expect(await verifyBoard({ opening, board: res.body.board, chain })).toEqual({ valid: true, result: null });

    const draft = await t.call("POST", "/votings", { meeting_id: t.meetingId, title: "Never opened", ...YES_NO }, t.official);
    expect((await t.call("POST", `/votings/${draft.body.id}/annul`, { reason: "Duplicate" }, t.official)).body.status).toBe("annulled");
  });

  it("elects with a published candidates table and chains consecutive boards", async () => {
    const t = await session();
    const sw = {
      method: "single_winner",
      params: { candidates: ["c1", "c2"], stage: "first", attempt: 0, repetitions: 1, against_all_blocks: false, subject: "person" },
      timing: "live",
      candidates: [{ id: "c1", name: "Persona Candidata 1" }, { id: "c2", name: "Persona Candidata 2" }],
    };
    expect((await t.call("POST", "/votings", { meeting_id: t.meetingId, title: "x", ...sw, candidates: [] }, t.official)).body).toEqual({ error: "candidate_names_required" });
    expect((await t.call("POST", "/votings", { meeting_id: t.meetingId, title: "x", ...sw, timing: "final_link" }, t.official)).body).toEqual({ error: "elections_are_live" });
    const first = await t.createAndOpen(sw);
    await cast(t.reception, first.id, await t.credential(first.id, t.tokens.p2), { choice: "c2" });
    await t.call("POST", `/votings/${first.id}/close`, undefined, t.official);
    const second = await t.createAndOpen();
    const closed = (await t.call("POST", `/votings/${second.id}/close`, undefined, t.official)).body;

    const chain = JSON.parse(t.publisher.files.get("chain.json")!);
    expect(chain.records).toHaveLength(2);
    expect(chain.records[1].prev).toBe(chain.records[0].record_hash);
    const firstBoard = JSON.parse(t.publisher.files.get(chain.records[0].path)!);
    const candidates = JSON.parse(t.publisher.files.get(chain.records[0].path.replace(".board.json", ".candidates.json"))!);
    expect(firstBoard.result).toMatchObject({ outcome: "elected", elected: "c2" });
    const firstOpening = JSON.parse(t.publisher.files.get(chain.records[0].path.replace(".board.json", ".opening.json"))!);
    expect(await verifyBoard({ opening: firstOpening, board: firstBoard, chain, candidates })).toMatchObject({ valid: true });
    expect(await verifyBoard({ opening: closed.opening, board: closed.board, chain })).toMatchObject({ valid: true });
  });

  it("validates creation and the order of operations", async () => {
    const t = await session();
    const post = (b: Record<string, unknown>) => t.call("POST", "/votings", { meeting_id: t.meetingId, title: "x", ...YES_NO, ...b }, t.official);
    expect((await post({ method: "posts" })).body).toEqual({ error: "unsupported_method" });
    expect((await post({ params: { base: "voters", rule: "simple" } })).body).toEqual({ error: "invalid_params" });
    expect((await post({ timing: "later" })).body).toEqual({ error: "invalid_timing" });
    expect((await post({ timing: "final_link", closes_at: "2020-01-01T00:00:00Z" })).body).toEqual({ error: "invalid_closes_at" });
    expect((await post({ electorate_filter: "chem" })).body).toEqual({ error: "invalid_electorate_filter" });
    expect((await post({ min_attendance: [3, 2] })).body).toEqual({ error: "invalid_min_attendance" });
    expect((await post({ title: " " })).body).toEqual({ error: "invalid_title" });
    expect((await post({ meeting_id: "nope" })).body).toEqual({ error: "meeting_not_found" });
    expect((await t.call("POST", "/votings", { meeting_id: t.meetingId, title: "x", ...YES_NO }, t.tokens.p2)).status).toBe(403);

    const a = await t.createAndOpen();
    const b = (await post({})).body;
    expect((await t.call("POST", `/votings/${b.id}/open`, {}, t.official)).body).toEqual({ error: "another_voting_open" });
    expect((await t.call("POST", `/votings/${a.id}/open`, {}, t.official)).body).toEqual({ error: "not_created" });
    expect((await t.call("POST", `/votings/${a.id}/activate`, {}, t.official)).body).toEqual({ error: "not_awaiting_pages" });
    await t.call("POST", `/votings/${a.id}/close`, undefined, t.official);
    expect((await t.call("POST", `/votings/${a.id}/close`, undefined, t.official)).body).toEqual({ error: "not_open" });
    expect((await t.call("POST", `/votings/${a.id}/publish`, undefined, t.official)).body).toEqual({ error: "nothing_to_publish" });
    expect((await t.call("GET", `/votings?meeting_id=${t.meetingId}`, undefined, t.tokens.p2)).body.votings).toHaveLength(2);
    expect((await t.call("GET", "/votings/nope", undefined, t.tokens.p2)).status).toBe(404);
  });

  it("retries a publication that failed", async () => {
    const t = await session();
    const v = await t.createAndOpen();
    const spy = vi.spyOn(t.publisher, "publish").mockRejectedValueOnce(new Error("network down"));
    expect((await t.call("POST", `/votings/${v.id}/close`, undefined, t.official)).status).toBe(500);
    expect((await t.call("GET", `/votings/${v.id}`, undefined, t.official)).body.status).toBe("closed");
    expect((await t.call("POST", `/votings/${v.id}/publish`, undefined, t.official)).status).toBe(200);
    expect(t.publisher.files.has("chain.json")).toBe(true);
    spy.mockRestore();
  });
});

describe("secret voting, final link", () => {
  it("waits for Pages, closes at the fixed time and refuses an early close", async () => {
    const t = await session();
    const closesAt = new Date(t.clock.t + 3600_000).toISOString().replace(".000Z", "Z");
    const v = await t.createAndOpen({ ...YES_NO, timing: "final_link", closes_at: closesAt });
    expect(v.status).toBe("awaiting_pages");
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: "00".repeat(384) }, t.tokens.p2)).body).toEqual({ error: "voting_not_open" });

    const served = vi.spyOn(t.publisher, "isServed").mockResolvedValueOnce(false);
    expect((await t.call("POST", `/votings/${v.id}/activate`, {}, t.official)).body).toEqual({ error: "not_served_yet" });
    served.mockRestore();
    expect((await t.call("POST", `/votings/${v.id}/activate`, {}, t.official)).body.status).toBe("open");

    await cast(t.reception, v.id, await t.credential(v.id, t.tokens.p2), { q: "against" });
    expect((await t.call("POST", `/votings/${v.id}/close`, undefined, t.official)).body).toEqual({ error: "closes_automatically" });
    await closeDue(t.deps);
    expect((await t.call("GET", `/votings/${v.id}`, undefined, t.official)).body.status).toBe("open");
    t.clock.t += 3600_000;
    await closeDue(t.deps);
    const after = (await t.call("GET", `/votings/${v.id}`, undefined, t.official)).body;
    expect(after.board.closed_at).toBe(closesAt);
    expect(after.opening.closes_at).toBe(closesAt);
    const chain = JSON.parse(t.publisher.files.get("chain.json")!);
    expect(await verifyBoard({ opening: after.opening, board: after.board, chain })).toMatchObject({ valid: true });
  });
});

describe("no logs at reception (ADR-0018)", () => {
  it("writes only the ballot and the spent token, with no time, order, log or cookie", async () => {
    const statements: string[] = [];
    let recording = false;
    const t = await session((s) => recording && statements.push(s));
    const v = await t.createAndOpen();
    const cred = await t.credential(v.id, t.tokens.p2);
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k));

    recording = true;
    const res = await cast(t.reception, v.id, cred, { q: "for" });
    recording = false;

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const s of spies) s.mockRestore();
    const writes = statements.filter((s) => !/^\s*(select|begin|commit)/i.test(s));
    expect(writes.map((s) => s.match(/insert into "(\w+)"/i)?.[1])).toEqual(["ballot_received", "spent_token"]);

    // Both tables are WITHOUT ROWID and have no time or counter columns.
    const sqlite = (t.deps.db as unknown as { $client: import("better-sqlite3").Database }).$client;
    for (const table of ["ballot_received", "spent_token"]) {
      const ddl = sqlite.prepare("select sql from sqlite_master where name = ?").get(table) as { sql: string };
      expect(ddl.sql).toMatch(/WITHOUT ROWID/);
      const columns = (sqlite.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      expect(columns.some((c) => /time|_at$|date|seq|order|id$/.test(c) && c !== "voting_id")).toBe(false);
    }
  });
});

describe("independent verification", () => {
  const python = join(import.meta.dirname, "../../../tools/verify/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

  it.skipIf(!existsSync(python))("tools/verify accepts the published data repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pv-data-"));
    try {
      const t = await session();
      t.deps.publisher = new DirectoryPublisher(dir);
      const v = await t.createAndOpen();
      const r = await cast(t.reception, v.id, await t.credential(v.id, t.tokens.p1, 1), { q: "for" });
      await cast(t.reception, v.id, await t.credential(v.id, t.tokens.p2), { q: "against" });
      await t.call("POST", `/votings/${v.id}/close`, undefined, t.official);
      const receipt = join(dir, "receipt.json");
      (await import("node:fs")).writeFileSync(receipt, JSON.stringify(r.receipt));
      const out = execFileSync(python, ["-m", "pv_verify", dir, "--receipt", receipt], { cwd: join(import.meta.dirname, "../../../tools/verify"), encoding: "utf8" });
      expect(out).toContain("receipt_checked");
      expect(out).toContain("RESULT: all checks passed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
