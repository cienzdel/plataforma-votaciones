/**
 * Milestone H8: the rest of the catalogue. Tie-break draws use the real quicknet round
 * 33026212, so the clock starts two hours before it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drawCommitment, formatTimestamp, fromHex, hashJsonHex, roundTime, toHex, verifyBoard } from "@pv/core";
import { describe, expect, it } from "vitest";
import { closeDueAssents } from "../src/assents.ts";
import { DirectoryPublisher } from "../src/publisher.ts";
import { closeDue } from "../src/votings.ts";
import { DRAND_ROUND, FIRST, PROFILE, setup } from "./helpers.ts";
import { blind, cast, finalize } from "./voter.ts";

const SEED = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const COMMITMENT = toHex(drawCommitment(fromHex(SEED)));
/** Unix ms of the real drand round the fake knows. */
const ROUND_MS = roundTime(DRAND_ROUND) * 1000;

async function session() {
  const t = setup();
  t.clock.t = ROUND_MS - 2 * 3600_000;
  const c = await t.withCensus(9);
  const meetingId = (await t.call("POST", "/meetings", { title: "Ordinary meeting" }, c.official)).body.id as string;
  await t.call("POST", `/meetings/${meetingId}/open`, undefined, c.official);
  for (const e of [FIRST.email, "p1@example.org", "p2@example.org", "p4@example.org"]) {
    await t.call("POST", `/meetings/${meetingId}/attendance`, { member_id: c.byEmail(e).id, kind: "in", mode: "in_person" }, c.official);
  }
  await t.call("POST", `/meetings/${meetingId}/delegations`, { from_member_id: c.byEmail("p3@example.org").id, to_member_id: c.byEmail("p1@example.org").id, justified: true }, c.official);
  const tokens = { p1: await t.login("p1@example.org"), p2: await t.login("p2@example.org"), p4: await t.login("p4@example.org") };

  async function create(body: Record<string, unknown>) {
    const res = await t.call("POST", "/votings", { meeting_id: meetingId, ...body }, c.official);
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    const opened = await t.call("POST", `/votings/${res.body.id}/open`, {}, c.official);
    if (opened.status !== 200) throw new Error(JSON.stringify(opened.body));
    return opened.body;
  }

  async function secretBallot(votingId: string, token: string, answers: Record<string, string>, right = 0) {
    const v = (await t.call("GET", `/votings/${votingId}`, undefined, token)).body;
    const b = await blind(v.opening.key.public_key, votingId);
    const res = await t.call("POST", "/votings/issue", { voting_id: votingId, right, blinded_msg: b.blindedMsg }, token);
    return cast(t.reception, votingId, await finalize(b, res.body.blind_sig), answers);
  }

  /** Checks a published board with the core verifier, from the published files. */
  async function verifyPublished(id: string) {
    const v = (await t.call("GET", `/votings/${id}`, undefined, c.official)).body;
    const chain = JSON.parse(t.publisher.files.get("chain.json")!);
    const path = chain.records.find((r: { path: string }) => r.path.includes(id)).path as string;
    const file = (suffix: string) => t.publisher.files.get(path.replace(".board.json", suffix));
    const candidates = file(".candidates.json");
    return verifyBoard({ opening: v.opening, board: JSON.parse(file(".board.json")!), chain, ...(candidates ? { candidates: JSON.parse(candidates) } : {}) });
  }

  return { ...t, ...c, meetingId, tokens, create, secretBallot, verifyPublished };
}

const LIMITED = {
  title: "Committee members",
  method: "limited_vote",
  params: { candidates: ["c1", "c2", "c3"], seats: 2, minimum: 0 },
  candidates: [
    { id: "c1", name: "Persona Candidata 1" },
    { id: "c2", name: "Persona Candidata 2" },
    { id: "c3", name: "Persona Candidata 3" },
  ],
  timing: "live",
  draw_commitment: COMMITMENT,
};
const lv = (status: string, ...marked: string[]) => ({ status, c1: marked.includes("c1") ? "marked" : "unmarked", c2: marked.includes("c2") ? "marked" : "unmarked", c3: marked.includes("c3") ? "marked" : "unmarked" });

describe("tie-break draws", () => {
  it("limited vote, secret and live: the round is fixed at closing and the seed revealed after it", async () => {
    const t = await session();
    const v = await t.create(LIMITED);
    expect(v.opening.draw_commitment).toBe(COMMITMENT);
    expect(v.opening.draw_round).toBeNull();
    await t.secretBallot(v.id, t.tokens.p1, lv("marked", "c1"));
    await t.secretBallot(v.id, t.tokens.p1, lv("marked", "c2"), 1);
    await t.secretBallot(v.id, t.tokens.p2, lv("marked", "c3"));
    await t.secretBallot(v.id, t.tokens.p4, lv("blank"));
    expect((await t.secretBallot(v.id, t.official, lv("marked", "c1", "c2"))).body).toEqual({ error: "invalid_answers" });

    t.clock.t = ROUND_MS - 30_000;
    const closed = (await t.call("POST", `/votings/${v.id}/close`, undefined, t.official)).body;
    expect(closed).toMatchObject({ status: "awaiting_draw", draw_round: DRAND_ROUND });
    expect((await t.call("POST", `/votings/${v.id}/reveal`, { seed: "ff".repeat(32) }, t.official)).body).toEqual({ error: "seed_mismatch" });
    const done = (await t.call("POST", `/votings/${v.id}/reveal`, { seed: SEED }, t.official)).body;
    expect(done.status).toBe("closed");
    expect(done.board.draw).toMatchObject({ purpose: "tiebreak_order", round_rule: { after: formatTimestamp(ROUND_MS - 30_000), delay_seconds: 30 } });
    // Three candidates with one vote each: the draw decides the whole order.
    expect(done.board.result.ranking.map((r: { cand: string }) => r.cand)).toEqual(done.board.draw.order);
    expect(await t.verifyPublished(v.id)).toMatchObject({ valid: true });
  });

  it("posts, roll call, final link: the round is in the opening notice", async () => {
    const t = await session();
    const closesAt = formatTimestamp(ROUND_MS);
    const v = await t.create({
      title: "Committee posts",
      method: "posts",
      mode: "roll_call",
      params: { posts: ["comms", "sports"], candidates: [{ id: "c1", preferences: ["comms", "sports"] }, { id: "c2", preferences: ["comms"] }] },
      candidates: [{ id: "c1", name: "Persona Candidata 1" }, { id: "c2", name: "Persona Candidata 2" }],
      posts: [{ id: "comms", name: "Communication" }, { id: "sports", name: "Sports" }],
      timing: "final_link",
      closes_at: closesAt,
      draw_commitment: COMMITMENT,
    });
    expect(v.status).toBe("open"); // no key to wait for
    expect(v.opening).toMatchObject({ key: null, draw_round: DRAND_ROUND, closes_at: closesAt });
    const ballot = { "c1@comms": "for", "c1@sports": "for", "c2@comms": "for" };
    expect((await t.call("POST", `/votings/${v.id}/nominal`, { right: 0, answers: ballot }, t.tokens.p1)).status).toBe(201);
    expect((await t.call("POST", `/votings/${v.id}/nominal`, { right: 0, answers: ballot }, t.tokens.p1)).body).toEqual({ error: "already_voted" });
    expect((await t.call("POST", `/votings/${v.id}/nominal`, { right: 1, answers: { ...ballot, "c2@comms": "against" } }, t.tokens.p1)).status).toBe(201);
    expect((await t.call("POST", `/votings/${v.id}/nominal`, { right: 0, answers: { x: "for" } }, t.tokens.p2)).body).toEqual({ error: "invalid_answers" });
    expect((await t.call("POST", `/votings/${v.id}/nominal`, { right: 1, answers: ballot }, t.tokens.p2)).body).toEqual({ error: "invalid_right" });
    expect((await t.call("POST", "/votings/issue", { voting_id: v.id, right: 0, blinded_msg: "00".repeat(384) }, t.tokens.p2)).body).toEqual({ error: "voting_not_open" });

    t.clock.t = ROUND_MS;
    await closeDue(t.deps);
    expect((await t.call("GET", `/votings/${v.id}`, undefined, t.official)).body.status).toBe("awaiting_draw");
    const done = (await t.call("POST", `/votings/${v.id}/reveal`, { seed: SEED }, t.official)).body;
    expect(done.board.draw.round_rule).toBeUndefined();
    const rollCall = JSON.parse([...t.publisher.files].find(([p]) => p.endsWith(".roll_call.json"))![1]);
    expect(rollCall.votes).toEqual([
      { answers: ballot, member: "Persona 1", right: 0 },
      { answers: { ...ballot, "c2@comms": "against" }, member: "Persona 1", right: 1 },
    ]);
    expect(done.board.roll_call_hash).toBe(hashJsonHex(rollCall));
    expect(await t.verifyPublished(v.id)).toMatchObject({ valid: true });
  });

  it("waits while the round does not exist, and can be annulled before the draw", async () => {
    const t = await session();
    const v = await t.create(LIMITED);
    await t.call("POST", `/votings/${v.id}/close`, undefined, t.official); // round far before the fake's
    expect((await t.call("POST", `/votings/${v.id}/reveal`, { seed: SEED }, t.official)).body).toEqual({ error: "round_not_available" });
    const annulled = (await t.call("POST", `/votings/${v.id}/annul`, { reason: "Wrong candidates" }, t.official)).body;
    expect(annulled.board).toMatchObject({ status: "annulled", draw: null });
    expect(await t.verifyPublished(v.id)).toEqual({ valid: true, result: null });
    expect((await t.call("POST", `/votings/${v.id}/reveal`, { seed: SEED }, t.official)).body).toEqual({ error: "not_awaiting_draw" });
  });
});

describe("manual and paper counts", () => {
  it("publishes the totals entered by the officials", async () => {
    const t = await session();
    const v = await t.create({ title: "Show of hands", method: "yes_no", mode: "manual", params: { base: "cast", rule: "simple" }, timing: "live" });
    const enter = (tallies: unknown, received: unknown) => t.call("POST", `/votings/${v.id}/tallies`, { tallies, received }, t.official);
    expect((await enter({ q: { for: 3, against: 1, blank: 0, abstain: 0 } }, 5)).body).toEqual({ error: "invalid_tallies" });
    expect((await enter({ q: { for: 9, against: 0, blank: 0, abstain: 0 } }, 9)).body).toEqual({ error: "invalid_tallies" }); // above the rights
    expect((await enter({ q: { for: 3, against: 1 } }, 4)).body).toEqual({ error: "invalid_tallies" });
    expect((await enter({ q: { for: 3, against: 1, blank: 0, abstain: 1 } }, 5)).status).toBe(200);
    const done = (await t.call("POST", `/votings/${v.id}/close`, undefined, t.official)).body;
    expect(done.board).toMatchObject({ key: null, cells: null, participation: null, counters: { issued: null, received: 5 }, result: { outcome: "approved" } });
    expect(await t.verifyPublished(v.id)).toMatchObject({ valid: true });
    expect((await enter({ q: { for: 1, against: 0, blank: 0, abstain: 0 } }, 1)).body).toEqual({ error: "voting_not_open" });
  });
});

describe("in-room ties and the election assistant", () => {
  it("draws among the tied in front of the room and proposes the run-off", async () => {
    const t = await session();
    const v = await t.create({
      title: "Presidency",
      method: "single_winner",
      params: { candidates: ["c1", "c2", "c3"], stage: "first", attempt: 0, repetitions: 0, against_all_blocks: false, subject: "person" },
      candidates: [{ id: "c1", name: "Persona Candidata 1" }, { id: "c2", name: "Persona Candidata 2" }, { id: "c3", name: "Persona Candidata 3" }],
      timing: "live",
    });
    await t.secretBallot(v.id, t.tokens.p1, { choice: "c1" });
    await t.secretBallot(v.id, t.tokens.p1, { choice: "c1" }, 1);
    await t.secretBallot(v.id, t.tokens.p2, { choice: "c2" });
    await t.secretBallot(v.id, t.tokens.p4, { choice: "c3" });
    const closed = (await t.call("POST", `/votings/${v.id}/close`, undefined, t.official)).body;
    expect(closed.board.result).toMatchObject({ outcome: "draw_required", qualified: ["c1"], tied: ["c2", "c3"], spots: 1 });
    expect((await t.call("GET", `/votings/${v.id}/next`, undefined, t.official)).body.next).toEqual({ draw: { voting_id: v.id, items: ["c2", "c3"], spots: 1 } });

    t.clock.t = ROUND_MS - 30_000;
    expect((await t.call("POST", "/draws", { voting_id: v.id, commitment: "zz" }, t.official)).body).toEqual({ error: "invalid_commitment" });
    const d = (await t.call("POST", "/draws", { voting_id: v.id, commitment: COMMITMENT }, t.official)).body;
    expect(d.round).toBe(DRAND_ROUND);
    expect((await t.call("POST", "/draws", { voting_id: v.id, commitment: COMMITMENT }, t.official)).body).toEqual({ error: "draw_exists" });
    const revealed = (await t.call("POST", `/draws/${d.id}/reveal`, { seed: SEED }, t.official)).body;
    expect(revealed.document).toMatchObject({ purpose: "tie", spots: 1, round_rule: { after: formatTimestamp(ROUND_MS - 30_000), delay_seconds: 30 } });
    const winner = revealed.document.winners[0];
    expect((await t.call("POST", `/draws/${d.id}/reveal`, { seed: SEED }, t.official)).body).toEqual({ error: "already_revealed" });
    expect((await t.call("GET", `/draws?voting_id=${v.id}`, undefined, t.tokens.p2)).body.draws).toHaveLength(1);

    const next = (await t.call("GET", `/votings/${v.id}/next`, undefined, t.official)).body.next;
    expect(next.params).toMatchObject({ stage: "runoff", candidates: ["c1", winner] });
    const runoff = await t.create({ meeting_id: t.meetingId, ...next });
    expect(runoff.status).toBe("open");
  });

  it("proposes a repetition among the tied while repetitions remain", async () => {
    const t = await session();
    const v = await t.create({
      title: "Secretary",
      method: "single_winner",
      params: { candidates: ["c1", "c2"], stage: "runoff", attempt: 0, repetitions: 1, against_all_blocks: false, subject: "person" },
      candidates: [{ id: "c1", name: "Persona Candidata 1" }, { id: "c2", name: "Persona Candidata 2" }],
      timing: "live",
    });
    await t.secretBallot(v.id, t.tokens.p2, { choice: "c1" });
    await t.secretBallot(v.id, t.tokens.p4, { choice: "c2" });
    await t.call("POST", `/votings/${v.id}/close`, undefined, t.official);
    const next = (await t.call("GET", `/votings/${v.id}/next`, undefined, t.official)).body.next;
    expect(next.params).toMatchObject({ stage: "runoff", attempt: 1, candidates: ["c1", "c2"] });
    expect((await t.call("POST", "/draws", { voting_id: v.id, commitment: COMMITMENT }, t.official)).body).toEqual({ error: "no_tie_to_draw" });
  });
});

describe("assent", () => {
  it("approves unless an objection stands at the deadline", async () => {
    const t = await session();
    const sent = t.clock.t;
    const tooEarly = formatTimestamp(sent + 24 * 3600_000);
    const post = (b: Record<string, unknown>) => t.call("POST", "/assents", { title: "Calendar of meetings", text: "Approve the calendar.", not_excluded: true, ...b }, t.official);
    expect((await post({ closes_at: tooEarly })).body).toEqual({ error: "closes_too_early" });
    expect((await post({ closes_at: formatTimestamp(sent + 5 * 86400_000), not_excluded: false })).body).toEqual({ error: "confirm_not_excluded" });
    const a = (await post({ closes_at: formatTimestamp(sent + 5 * 86400_000) })).body;
    expect(a.members).toBe(10);
    expect(t.mailer.sent.filter((m) => m.subject.startsWith("Propuesta"))).toHaveLength(10);

    expect((await t.call("POST", `/assents/${a.id}/objection`, undefined, t.tokens.p2)).status).toBe(204);
    expect(t.mailer.sent.at(-1)!.subject).toBe("Oposición · Objection: Calendar of meetings");
    expect((await t.call("POST", `/assents/${a.id}/objection`, undefined, t.tokens.p4)).status).toBe(204);
    expect((await t.call("DELETE", `/assents/${a.id}/objection`, undefined, t.tokens.p4)).status).toBe(204);
    expect((await t.call("GET", `/assents/${a.id}/objections`, undefined, t.official)).body).toEqual({ objections: ["Persona 2"] });
    expect((await t.call("GET", "/assents", undefined, t.tokens.p2)).body.assents[0]).toMatchObject({ objected: true, in_electorate: true });

    t.clock.t = sent + 5 * 86400_000;
    const p4 = await t.login("p4@example.org"); // sessions last 12 hours
    expect((await t.call("POST", `/assents/${a.id}/objection`, undefined, p4)).body).toEqual({ error: "assent_closed" });
    await closeDueAssents(t.deps);
    const record = (await t.call("GET", "/assents", undefined, p4)).body.assents[0].record;
    expect(record).toMatchObject({ objections: 1, outcome: "next_plenary", members: 10, type: "assent" });
    expect(JSON.stringify(record)).not.toContain("Persona");
    expect(JSON.parse(t.publisher.files.get("chain.json")!).records).toHaveLength(1);
  });
});

describe("minutes", () => {
  it("exports named attendance, results and draws for the officials only", async () => {
    const t = await session();
    const v = await t.create({ title: "Approval of the minutes", method: "yes_no", mode: "paper", params: { base: "cast", rule: "simple" }, timing: "live" });
    await t.call("POST", `/votings/${v.id}/tallies`, { tallies: { q: { for: 2, against: 0, blank: 0, abstain: 0 } }, received: 2 }, t.official);
    await t.call("POST", `/votings/${v.id}/close`, undefined, t.official);
    const res = await t.app.request(`/meetings/${t.meetingId}/minutes`, { headers: { authorization: "Bearer " + t.official } });
    const md = await res.text();
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(md).toContain("# Ordinary meeting");
    expect(md).toContain("| Persona 1 | in | in_person |");
    expect(md).toContain("Persona 3 → Persona 1");
    expect(md).toContain('"outcome":"approved"');
    const json = await (await t.app.request(`/meetings/${t.meetingId}/minutes?format=json`, { headers: { authorization: "Bearer " + t.official } })).json();
    expect(json.boards).toHaveLength(1);
    expect((await t.call("GET", `/meetings/${t.meetingId}/minutes`, undefined, t.tokens.p2)).status).toBe(403);
  });
});

describe("independent verification of the whole catalogue", () => {
  const python = join(import.meta.dirname, "../../../tools/verify/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

  it.skipIf(!existsSync(python))("tools/verify accepts boards with draws, roll call, paper, a tie draw and an assent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pv-data-"));
    try {
      const t = await session();
      t.deps.publisher = new DirectoryPublisher(dir);
      // Limited vote with a live draw.
      const v = await t.create(LIMITED);
      await t.secretBallot(v.id, t.tokens.p1, lv("marked", "c2"));
      await t.secretBallot(v.id, t.tokens.p2, lv("marked", "c3"));
      t.clock.t = ROUND_MS - 30_000;
      await t.call("POST", `/votings/${v.id}/close`, undefined, t.official);
      await t.call("POST", `/votings/${v.id}/reveal`, { seed: SEED }, t.official);
      // Paper count.
      const p = await t.create({ title: "Paper ballot", method: "yes_no", mode: "paper", params: { base: "cast", rule: "simple" }, timing: "live" });
      await t.call("POST", `/votings/${p.id}/tallies`, { tallies: { q: { for: 1, against: 2, blank: 0, abstain: 0 } }, received: 3 }, t.official);
      await t.call("POST", `/votings/${p.id}/close`, undefined, t.official);
      // Single winner with a tie decided by an in-room draw.
      const s = await t.create({
        title: "Presidency", method: "single_winner", mode: "roll_call", timing: "live",
        params: { candidates: ["c1", "c2"], stage: "runoff", attempt: 0, repetitions: 0, against_all_blocks: false, subject: "person" },
        candidates: [{ id: "c1", name: "Persona Candidata 1" }, { id: "c2", name: "Persona Candidata 2" }],
      });
      await t.call("POST", `/votings/${s.id}/nominal`, { right: 0, answers: { choice: "c1" } }, t.tokens.p2);
      await t.call("POST", `/votings/${s.id}/nominal`, { right: 0, answers: { choice: "c2" } }, t.tokens.p4);
      await t.call("POST", `/votings/${s.id}/close`, undefined, t.official);
      const d = (await t.call("POST", "/draws", { voting_id: s.id, commitment: COMMITMENT }, t.official)).body;
      await t.call("POST", `/draws/${d.id}/reveal`, { seed: SEED }, t.official);
      // Assent.
      const a = (await t.call("POST", "/assents", { title: "Calendar", text: "Approve the calendar.", not_excluded: true, closes_at: formatTimestamp(t.clock.t + 5 * 86400_000) }, t.official)).body;
      t.clock.t += 5 * 86400_000;
      await closeDueAssents(t.deps);
      expect(a.id).toBeTruthy();

      const profile = join(dir, "profile.json");
      writeFileSync(profile, JSON.stringify(PROFILE));
      const out = execFileSync(python, ["-m", "pv_verify", dir, "--profile", profile], { cwd: join(import.meta.dirname, "../../../tools/verify"), encoding: "utf8" });
      expect(out).toContain("RESULT: all checks passed");
      expect(out.match(/^ok /gm)).toHaveLength(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
