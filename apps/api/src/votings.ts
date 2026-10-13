/**
 * Votings (spec/protocol.md §3–§8): creation, opening with the attendance snapshot and the opening
 * notice, credential issuance (`secret`), named votes (`roll_call`), totals entered by the officials
 * (`manual`, `paper`), closing, the tie-break draw, the board, the chain and publication. Vote
 * reception for `secret` votings is in reception.ts, on its own origin.
 */
import {
  canonicalize,
  cellIdHex,
  cellSpec,
  computeQuorum,
  computeResult,
  drandRandomness,
  drawCommitment,
  drawSigma,
  formatTimestamp,
  fromHex,
  hashJsonHex,
  isFraction,
  isHex,
  isId,
  isTimestamp,
  keyFingerprint,
  limitedVoteConsistent,
  METHODS,
  needsTiebreakOrder,
  parseTimestamp,
  QUICKNET,
  roundAt,
  shuffle,
  tallyCells,
  toHex,
  validAnswers,
  validateParams,
  type Fraction,
  type Method,
  type Mode,
  type Tallies,
} from "@pv/core";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireMember, requireOfficial, type AuthEnv } from "./auth.ts";
import { appendToChain, chainFile, datePath, recordOf } from "./chain.ts";
import { HttpError, type Deps } from "./context.ts";
import { ballotReceived, electorateSnapshot, issuance, meeting, member, nominalVote, signingKey, tieDraw, voting } from "./db/schema.ts";
import { blindSign, BlindSignError, MODULUS_BYTES, newVotingKey } from "./keys.ts";
import { snapshot } from "./meetings.ts";
import { jsonFile, type File } from "./publisher.ts";

export type Voting = typeof voting.$inferSelect;
const MODES: Mode[] = ["secret", "roll_call", "manual", "paper"];
export const LIVE_DRAW_DELAY_S = 30;

interface Rules {
  electorate_filter: string | null;
  method: Method;
  min_attendance: Fraction | null;
  mode: Mode;
  params: Record<string, unknown>;
  timing: "live" | "final_link";
}
const rulesOf = (v: Voting) => v.rules as unknown as Rules;
const seconds = (ms: number) => Math.floor(ms / 1000);

export function getVoting(deps: Deps, id: string): Voting {
  const v = deps.db.select().from(voting).where(eq(voting.id, id)).get();
  if (v === undefined) throw new HttpError(404, "voting_not_found");
  return v;
}

/** Folder and name of a voting in the data repository (spec/formats.md §9.1). */
function basePath(v: Voting): string {
  return datePath(v.openedAt!) + "/" + v.id;
}

function keyDocument(deps: Deps, votingId: string): { fingerprint: string; public_key: string } {
  const k = deps.db.select().from(signingKey).where(eq(signingKey.votingId, votingId)).get()!;
  return { fingerprint: keyFingerprint(k.publicKey), public_key: k.publicKey };
}

function rightsOf(deps: Deps, votingId: string, memberId: string): number {
  return deps.db.select().from(electorateSnapshot).where(and(eq(electorateSnapshot.votingId, votingId), eq(electorateSnapshot.memberId, memberId))).get()?.rights ?? 0;
}

// --- creation (spec/protocol.md §3)

type Named = { id?: unknown; name?: unknown };

function names(list: unknown, ids: string[]): { id: string; name: string }[] {
  const byId = new Map(Array.isArray(list) ? list.map((c: Named) => [c.id, c.name]) : []);
  if (!ids.every((c) => typeof byId.get(c) === "string" && (byId.get(c) as string).trim() !== "")) throw new HttpError(400, "names_required");
  return ids.map((id) => ({ id, name: (byId.get(id) as string).trim() }));
}

function create(deps: Deps, b: Record<string, unknown>): Voting {
  const m = typeof b.meeting_id === "string" ? deps.db.select().from(meeting).where(eq(meeting.id, b.meeting_id)).get() : undefined;
  if (m === undefined) throw new HttpError(404, "meeting_not_found");
  if (m.status !== "open") throw new HttpError(409, "meeting_not_open");
  if (typeof b.title !== "string" || b.title.trim() === "") throw new HttpError(400, "invalid_title");
  if (!METHODS.includes(b.method as Method)) throw new HttpError(400, "unsupported_method");
  const method = b.method as Method;
  const mode = (b.mode ?? "secret") as Mode;
  if (!MODES.includes(mode)) throw new HttpError(400, "invalid_mode");
  if (typeof b.params !== "object" || b.params === null) throw new HttpError(400, "invalid_params");
  const params = b.params as Record<string, unknown>;
  let ids: string[];
  try {
    ids = validateParams(method, params);
    canonicalize(params);
  } catch {
    throw new HttpError(400, "invalid_params");
  }
  if (b.timing !== "live" && b.timing !== "final_link") throw new HttpError(400, "invalid_timing");
  if (method === "single_winner" && b.timing !== "live") throw new HttpError(400, "elections_are_live");
  if ((mode === "manual" || mode === "paper") && b.timing !== "live") throw new HttpError(400, "manual_counts_are_live");
  let closesAt: number | null = null;
  if (b.timing === "final_link") {
    if (!isTimestamp(b.closes_at) || parseTimestamp(b.closes_at) * 1000 <= deps.now()) throw new HttpError(400, "invalid_closes_at");
    closesAt = parseTimestamp(b.closes_at) * 1000;
  }
  const filter = b.electorate_filter ?? null;
  if (filter !== null && !(isId(filter) && deps.profile.degrees.some((d) => d.id === filter))) throw new HttpError(400, "invalid_electorate_filter");
  const minAttendance = b.min_attendance ?? null;
  if (minAttendance !== null && !isFraction(minAttendance)) throw new HttpError(400, "invalid_min_attendance");
  // The officials' browser keeps the seed and sends only its commitment (spec/draws.md §2).
  const commitment = b.draw_commitment ?? null;
  if (needsTiebreakOrder(method) !== isHex(commitment, 32)) throw new HttpError(400, "invalid_draw_commitment");

  const id = randomBytes(16).toString("hex");
  const candidates =
    ids.length === 0
      ? null
      : {
          candidates: names(b.candidates, ids),
          posts: method === "posts" ? names(b.posts, params.posts as string[]) : [],
          type: "candidates",
          version: 1,
          voting_id: id,
        };
  const draft = { electorate_filter: filter, method, min_attendance: minAttendance as Fraction | null, mode, params, timing: b.timing };
  const row: Voting = {
    id, meetingId: m.id, title: b.title.trim(), status: "created", rules: draft, rulesHash: "", candidates, closesAt,
    openedAt: null, closedAt: null, snapshotCounters: null, quorum: null, opening: null, board: null, annulReason: null, publishedAt: null,
    drawCommitment: commitment as string | null, drawRound: null, manualTallies: null, manualReceived: null, rollCall: null,
  };
  deps.db.insert(voting).values(row).run();
  return row;
}

// --- opening (spec/protocol.md §4)

/**
 * Freezes the electorate, checks quorum, creates the key (`secret`) and publishes the opening
 * notice. The effective rules are fixed here, with the quorum of the call in force.
 */
async function open(deps: Deps, v: Voting, forceReason: string | null, waitForPages: boolean): Promise<Voting> {
  if (v.status !== "created") throw new HttpError(409, "not_created");
  const m = deps.db.select().from(meeting).where(eq(meeting.id, v.meetingId)).get()!;
  if (m.status !== "open") throw new HttpError(409, "meeting_not_open");
  if (deps.db.select().from(voting).where(and(eq(voting.meetingId, m.id), inArray(voting.status, ["awaiting_pages", "open"]))).get()) {
    throw new HttpError(409, "another_voting_open");
  }
  const now = deps.now();
  if (v.closesAt !== null && v.closesAt <= now) throw new HttpError(409, "closes_at_passed");

  const draft = rulesOf(v);
  const p = deps.profile;
  const rules = { ...draft, profile: { hash: hashJsonHex(p), id: p.id, version: p.profile_version }, quorum: p.quorum[m.call - 1]! };
  const snap = snapshot(deps, m.id, draft.electorate_filter);
  const q = computeQuorum(rules, snap.counters);
  const metAll = q.met && (q.min_attendance === null || q.min_attendance.met);
  if (!metAll && forceReason === null) throw new HttpError(409, "quorum_not_met");
  const quorum = { forced: metAll ? null : { reason: forceReason! }, ...q };

  const secret = draft.mode === "secret";
  const key = secret ? await newVotingKey(deps.masterKey, v.id) : null;
  const openedAt = seconds(now) * 1000;
  // final_link fixes the drand round now, from the fixed closing time (spec/draws.md §5).
  const drawRound = v.drawCommitment !== null && v.closesAt !== null ? roundAt(seconds(v.closesAt)) : null;
  const opening = {
    closes_at: v.closesAt === null ? null : formatTimestamp(v.closesAt),
    draw_commitment: v.drawCommitment,
    draw_round: drawRound,
    key: key === null ? null : { fingerprint: keyFingerprint(key.publicKey), public_key: key.publicKey },
    opened_at: formatTimestamp(openedAt),
    quorum,
    rules,
    rules_hash: hashJsonHex(rules),
    title: v.title,
    type: "opening",
    version: 1,
    voting_id: v.id,
  };
  // A secret voting waits for Pages to serve its key: always in final_link, on request when live (ADR-0008).
  const status = secret && (v.closesAt !== null || waitForPages) ? "awaiting_pages" : "open";
  const updated: Voting = { ...v, status, rules, rulesHash: opening.rules_hash, openedAt, snapshotCounters: { ...snap.counters }, quorum, opening, drawRound };

  deps.db.transaction((tx) => {
    tx.update(voting).set(updated).where(eq(voting.id, v.id)).run();
    if (key !== null) tx.insert(signingKey).values({ votingId: v.id, publicKey: key.publicKey, privateKey: key.privateKey, destroyedAt: null }).run();
    for (const r of snap.rights) tx.insert(electorateSnapshot).values({ votingId: v.id, memberId: r.memberId, rights: r.own + r.proxies }).run();
  });
  await deps.publisher.publish([jsonFile(basePath(updated) + ".opening.json", opening)], `Open voting ${v.id}`);
  return updated;
}

// --- votes

/** Credential issuance (spec/protocol.md §5). */
function issue(deps: Deps, memberId: string, body: { voting_id?: unknown; right?: unknown; blinded_msg?: unknown }): string {
  const v = typeof body.voting_id === "string" ? deps.db.select().from(voting).where(eq(voting.id, body.voting_id)).get() : undefined;
  const rights = v === undefined ? 0 : rightsOf(deps, v.id, memberId);
  if (v === undefined || rights === 0) throw new HttpError(403, "not_in_electorate");
  if (v.status !== "open" || rulesOf(v).mode !== "secret") throw new HttpError(409, "voting_not_open");
  const right = body.right;
  if (!Number.isSafeInteger(right) || (right as number) < 0 || (right as number) >= rights) throw new HttpError(400, "invalid_right");
  if (typeof body.blinded_msg !== "string" || !/^[0-9a-f]+$/.test(body.blinded_msg) || body.blinded_msg.length !== 2 * MODULUS_BYTES) {
    throw new HttpError(400, "invalid_blinded_msg");
  }
  const blindedHash = createHash("sha256").update(body.blinded_msg).digest("hex");
  const existing = deps.db.select().from(issuance).where(and(eq(issuance.votingId, v.id), eq(issuance.memberId, memberId), eq(issuance.right, right as number))).get();
  if (existing !== undefined) {
    if (existing.blindedHash !== blindedHash) throw new HttpError(409, "already_issued");
    return existing.blindSig;
  }
  const key = deps.db.select().from(signingKey).where(eq(signingKey.votingId, v.id)).get()!;
  let sig: Buffer;
  try {
    sig = blindSign(deps.masterKey, v.id, { publicKey: key.publicKey, privateKey: key.privateKey! }, Buffer.from(body.blinded_msg, "hex"));
  } catch (e) {
    if (e instanceof BlindSignError) throw new HttpError(400, "invalid_blinded_msg");
    throw e;
  }
  const blindSig = sig.toString("hex");
  deps.db.insert(issuance).values({ votingId: v.id, memberId, right: right as number, blindedHash, blindSig }).run();
  return blindSig;
}

/** A named vote, one per right, that cannot be changed (spec/protocol.md §8). */
function nominal(deps: Deps, v: Voting, memberId: string, body: { right?: unknown; answers?: unknown }): void {
  const r = rulesOf(v);
  if (v.status !== "open" || r.mode !== "roll_call") throw new HttpError(409, "voting_not_open");
  const rights = rightsOf(deps, v.id, memberId);
  if (rights === 0) throw new HttpError(403, "not_in_electorate");
  if (!Number.isSafeInteger(body.right) || (body.right as number) < 0 || (body.right as number) >= rights) throw new HttpError(400, "invalid_right");
  if (typeof body.answers !== "object" || body.answers === null || !validAnswers(r.method, r.params, body.answers as Record<string, unknown>)) {
    throw new HttpError(400, "invalid_answers");
  }
  const key = and(eq(nominalVote.votingId, v.id), eq(nominalVote.memberId, memberId), eq(nominalVote.right, body.right as number));
  if (deps.db.select().from(nominalVote).where(key).get()) throw new HttpError(409, "already_voted");
  deps.db.insert(nominalVote).values({ votingId: v.id, memberId, right: body.right as number, answers: body.answers as Record<string, string> }).run();
}

/** Totals entered by the officials (`manual`, `paper`). They can be corrected until closing. */
function enterTallies(deps: Deps, v: Voting, body: { tallies?: unknown; received?: unknown }): void {
  const r = rulesOf(v);
  if (v.status !== "open" || (r.mode !== "manual" && r.mode !== "paper")) throw new HttpError(409, "voting_not_open");
  const spec = cellSpec(r.method, r.params);
  const t = body.tallies as Tallies;
  const received = body.received;
  const counts = (o: unknown) => typeof o === "object" && o !== null && Object.values(o).every((n) => Number.isSafeInteger(n) && (n as number) >= 0);
  const ok =
    Number.isSafeInteger(received) &&
    (received as number) >= 0 &&
    (received as number) <= v.snapshotCounters!.rights! &&
    typeof t === "object" &&
    t !== null &&
    Object.keys(t).length === spec.size &&
    [...spec].every(([cell, values]) => {
      const tc = t[cell];
      return counts(tc) && Object.keys(tc!).length === values.length && values.every((x) => tc![x] !== undefined) && Object.values(tc!).reduce((a, b) => a + b, 0) === received;
    }) &&
    (r.method !== "limited_vote" || limitedVoteConsistent(r.params, t));
  if (!ok) throw new HttpError(400, "invalid_tallies");
  deps.db.update(voting).set({ manualTallies: t, manualReceived: received as number }).where(eq(voting.id, v.id)).run();
}

// --- closing, draw and board (spec/protocol.md §7)

function countAnswers(spec: Map<string, readonly string[]>, answers: Record<string, string>[]): Tallies {
  return Object.fromEntries([...spec].map(([cell, values]) => [cell, Object.fromEntries(values.map((x) => [x, answers.filter((a) => a[cell] === x).length]))]));
}

/** The roll-call list (spec/formats.md §7), sorted by member and right. */
function rollCallList(deps: Deps, v: Voting): Record<string, unknown> {
  const rows = deps.db.select({ name: member.name, right: nominalVote.right, answers: nominalVote.answers }).from(nominalVote).innerJoin(member, eq(member.id, nominalVote.memberId)).where(eq(nominalVote.votingId, v.id)).all();
  const votes = rows.map((r) => ({ answers: r.answers, member: r.name, right: r.right })).sort((a, b) => (a.member === b.member ? a.right - b.right : a.member < b.member ? -1 : 1));
  return { type: "roll_call", version: 1, voting_id: v.id, votes };
}

/** Builds the board (spec/formats.md §5) for any mode. */
function buildBoard(deps: Deps, v: Voting, status: "closed" | "annulled", draw: Record<string, unknown> | null): { board: Record<string, unknown>; rollCall: Record<string, unknown> | null } {
  const r = rulesOf(v);
  const spec = cellSpec(r.method, r.params);
  let tallies: Tallies;
  let received: number;
  let cells: Record<string, [string, string][]> | null = null;
  let participation: [string, string][] | null = null;
  let issued: number | null = null;
  let rollCall: Record<string, unknown> | null = null;
  if (r.mode === "secret") {
    const ballots = deps.db.select().from(ballotReceived).where(eq(ballotReceived.votingId, v.id)).all();
    participation = ballots.map((b) => [b.token, b.sig] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    cells = {};
    for (const cell of spec.keys()) {
      cells[cell] = ballots.map((b) => [cellIdHex(b.s, v.id, cell), b.answers[cell]!] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }
    tallies = tallyCells(spec, cells);
    received = ballots.length;
    issued = deps.db.select({ n: count() }).from(issuance).where(eq(issuance.votingId, v.id)).get()!.n;
  } else if (r.mode === "roll_call") {
    const votes = deps.db.select().from(nominalVote).where(eq(nominalVote.votingId, v.id)).all();
    tallies = countAnswers(spec, votes.map((x) => x.answers));
    received = votes.length;
    rollCall = rollCallList(deps, v);
  } else {
    tallies = v.manualTallies ?? countAnswers(spec, []);
    received = v.manualReceived ?? 0;
  }
  const counters = { ...v.snapshotCounters!, issued, received };
  const order = (draw?.order as string[] | undefined) ?? undefined;
  const board: Record<string, unknown> = {
    candidates_hash: v.candidates === null ? null : hashJsonHex(v.candidates),
    cells,
    closed_at: formatTimestamp(v.closedAt!),
    counters,
    draw,
    key: r.mode === "secret" ? keyDocument(deps, v.id) : null,
    opened_at: formatTimestamp(v.openedAt!),
    participation,
    quorum: v.quorum,
    result: status === "closed" ? computeResult(r.method, r.params, tallies, counters as never, order) : null,
    roll_call_hash: rollCall === null ? null : hashJsonHex(rollCall),
    rules: v.rules,
    rules_hash: v.rulesHash,
    status,
    tallies,
    title: v.title,
    type: "board",
    version: 1,
    voting_id: v.id,
  };
  if (status === "annulled") board.annulment = { reason: v.annulReason };
  return { board, rollCall };
}

/** Builds and chains the board; publication follows in `publish`. */
function finish(deps: Deps, v: Voting, status: "closed" | "annulled", draw: Record<string, unknown> | null): Voting {
  const { board, rollCall } = buildBoard(deps, v, status, draw);
  deps.db.transaction((tx) => {
    appendToChain(tx, board, basePath(v) + ".board.json");
    tx.update(voting).set({ status, closedAt: v.closedAt, annulReason: v.annulReason, board, rollCall }).where(eq(voting.id, v.id)).run();
  });
  return getVoting(deps, v.id);
}

/**
 * Stops the voting and destroys the key. A voting that needs a tie-break order then waits for its
 * drand round and the officials' seed (`awaiting_draw`); the others are finished at once.
 */
function close(deps: Deps, v: Voting, status: "closed" | "annulled", reason: string | null): Voting {
  if (!["open", "awaiting_pages", "awaiting_draw"].includes(v.status)) throw new HttpError(409, "not_open");
  const closedAt = v.closedAt ?? v.closesAt ?? seconds(deps.now()) * 1000;
  const closing: Voting = { ...v, closedAt, annulReason: reason };
  deps.db.update(signingKey).set({ privateKey: null, destroyedAt: deps.now() }).where(eq(signingKey.votingId, v.id)).run();
  if (status === "closed" && v.drawCommitment !== null) {
    // live: the round is fixed now and shown on the projection screen before it exists.
    const drawRound = v.drawRound ?? roundAt(seconds(closedAt) + LIVE_DRAW_DELAY_S);
    deps.db.update(voting).set({ status: "awaiting_draw", closedAt, drawRound }).where(eq(voting.id, v.id)).run();
    return getVoting(deps, v.id);
  }
  return finish(deps, closing, status, null);
}

/** The draw document of a tie-break order (spec/draws.md §5). */
export async function drawDocument(deps: Deps, base: { votingId: string; commitment: string; round: number; seed: string; items: string[] }): Promise<Record<string, unknown>> {
  if (!isHex(base.seed, 32) || toHex(drawCommitment(fromHex(base.seed))) !== base.commitment) throw new HttpError(400, "seed_mismatch");
  const signature = await deps.drand(base.round);
  if (signature === null) throw new HttpError(409, "round_not_available");
  const randomness = drandRandomness(fromHex(signature));
  const sigma = drawSigma(fromHex(base.seed), randomness);
  return {
    commitment: base.commitment,
    drand: { chain_hash: QUICKNET.chainHash, randomness: toHex(randomness), round: base.round, signature },
    items: base.items,
    order: shuffle(sigma, base.items).order,
    seed: base.seed,
    sigma: toHex(sigma),
    type: "draw",
    version: 1,
    voting_id: base.votingId,
  };
}

/** Reveals the seed once the round exists, computes the order and finishes the board. */
async function reveal(deps: Deps, v: Voting, seed: unknown): Promise<Voting> {
  if (v.status !== "awaiting_draw") throw new HttpError(409, "not_awaiting_draw");
  const r = rulesOf(v);
  const doc = await drawDocument(deps, { votingId: v.id, commitment: v.drawCommitment!, round: v.drawRound!, seed: seed as string, items: validateParams(r.method, r.params) });
  const draw = { ...doc, purpose: "tiebreak_order", ...(r.timing === "live" ? { round_rule: { after: formatTimestamp(v.closedAt!), delay_seconds: LIVE_DRAW_DELAY_S } } : {}) };
  return finish(deps, v, "closed", draw);
}

/** Publishes the board with its companion files and the chain in one commit; then notifies and erases. */
export async function publish(deps: Deps, v: Voting): Promise<void> {
  if (v.board === null || v.publishedAt !== null) throw new HttpError(409, "nothing_to_publish");
  const files: File[] = [jsonFile(basePath(v) + ".board.json", v.board)];
  if (v.candidates !== null) files.push(jsonFile(basePath(v) + ".candidates.json", v.candidates));
  if (v.rollCall !== null) files.push(jsonFile(basePath(v) + ".roll_call.json", v.rollCall));
  files.push(chainFile(deps));
  await deps.publisher.publish(files, `${v.status === "closed" ? "Close" : "Annul"} voting ${v.id}`);
  deps.db.update(voting).set({ publishedAt: deps.now() }).where(eq(voting.id, v.id)).run();
  await notify(deps, v, recordOf(deps, v.board));
  if (rulesOf(v).mode === "secret") {
    // Erase s and the grouped ballots; only the spent tokens remain (spec/protocol.md §7 step 8).
    deps.db.delete(ballotReceived).where(eq(ballotReceived.votingId, v.id)).run();
    deps.db.run(sql`VACUUM`);
  }
}

/** Tells the electorate that the result is published; in `secret` mode, with the credentials issued (ADR-0007). */
async function notify(deps: Deps, v: Voting, recordHash: string): Promise<void> {
  const r = rulesOf(v);
  const issued = new Map(
    deps.db.select({ memberId: issuance.memberId, n: count() }).from(issuance).where(eq(issuance.votingId, v.id)).groupBy(issuance.memberId).all().map((x) => [x.memberId, x.n]),
  );
  const electorate = deps.db.select().from(member).where(eq(member.active, true)).all().filter((m) => r.electorate_filter === null || m.degrees.includes(r.electorate_filter));
  for (const m of electorate) {
    const n = issued.get(m.id) ?? 0;
    const es = r.mode === "secret" ? `\nSe emitieron ${n} credenciales a tu nombre. Si no coincide con lo que hiciste, avisa a la mesa.` : "";
    const en = r.mode === "secret" ? `\n${n} credentials were issued in your name. If this does not match what you did, tell the officials.` : "";
    await deps.mailer.send({
      to: m.email,
      subject: `Resultado publicado · Result published: ${v.title}`,
      text: `Se ha publicado el resultado de «${v.title}». Hash del registro: ${recordHash}${es}\n\nThe result of "${v.title}" has been published. Record hash: ${recordHash}${en}\n\n${deps.webOrigin}`,
    });
  }
}

/** Closes every final-link voting whose time has come, and publishes it unless it waits for a draw. */
export async function closeDue(deps: Deps): Promise<void> {
  const due = deps.db.select().from(voting).where(inArray(voting.status, ["open", "awaiting_pages"])).all().filter((v) => v.closesAt !== null && v.closesAt <= deps.now());
  for (const v of due) {
    const closed = close(deps, v, "closed", null);
    if (closed.status === "closed") await publish(deps, closed);
  }
}

/** Winners of the published tie draw of a voting, or null (spec/draws.md §6). */
export function tieWinners(deps: Deps, votingId: string): string[] | null {
  const d = deps.db.select().from(tieDraw).where(eq(tieDraw.votingId, votingId)).all().find((x) => x.document !== null);
  return d ? (d.document!.winners as string[]) : null;
}

// --- election assistant (spec/protocol.md §9, informative)

/**
 * The next voting the assistant proposes after a `single_winner` result, or a draw. The officials
 * confirm it by creating it. `qualified_before` carries those already through a run-off.
 */
export function nextStep(deps: Deps, v: Voting, drawWinners: string[] | null): Record<string, unknown> | null {
  const r = rulesOf(v);
  const result = v.board?.result as { outcome: string; qualified?: string[]; tied?: string[]; spots?: number } | null | undefined;
  if (r.method !== "single_winner" || !result) return null;
  const p = r.params as { stage: string; attempt: number; repetitions: number; spots?: number; qualified_before?: string[] };
  const names = (ids: string[]) => (v.candidates as { candidates: { id: string; name: string }[] }).candidates.filter((c) => ids.includes(c.id));
  const before = p.qualified_before ?? [];
  const base = { method: "single_winner", mode: r.mode, timing: "live", electorate_filter: r.electorate_filter, title: v.title };
  const runoff = (ids: string[]) => ({ ...base, params: { candidates: ids, stage: "runoff", attempt: 0, repetitions: p.repetitions, against_all_blocks: false, subject: "person" }, candidates: names(ids) });
  switch (result.outcome) {
    case "runoff":
      return runoff(result.qualified!);
    case "qualified":
      return runoff([...before, ...result.qualified!]);
    case "repeat": {
      const qualified = [...before, ...result.qualified!];
      if (p.stage === "runoff") return { ...base, params: { ...p, attempt: p.attempt + 1 }, candidates: names(result.tied!) };
      return { ...base, params: { candidates: result.tied, stage: "qualify", spots: result.spots, attempt: p.attempt + 1, repetitions: p.repetitions, against_all_blocks: false, subject: "person", qualified_before: qualified }, candidates: names(result.tied!) };
    }
    case "draw_required":
      if (drawWinners === null) return { draw: { voting_id: v.id, items: result.tied, spots: result.spots } };
      if (p.stage === "runoff") return null; // the draw elected the winner
      return runoff([...before, ...result.qualified!, ...drawWinners]);
    default:
      return null;
  }
}

// --- routes

/** The public view of a voting, plus the caller's rights when they are in the electorate. */
function view(deps: Deps, v: Voting, memberId: string) {
  const r = rulesOf(v);
  const voted = deps.db.select({ right: nominalVote.right }).from(nominalVote).where(and(eq(nominalVote.votingId, v.id), eq(nominalVote.memberId, memberId))).all().map((x) => x.right);
  return {
    id: v.id,
    meeting_id: v.meetingId,
    title: v.title,
    status: v.status,
    method: r.method,
    mode: r.mode,
    timing: r.timing,
    params: r.params,
    opening: v.opening,
    board: v.board,
    candidates: v.candidates,
    draw_commitment: v.drawCommitment,
    draw_round: v.drawRound,
    my_rights: rightsOf(deps, v.id, memberId),
    my_nominal_votes: voted,
  };
}

export function votingRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps));
  const me = (c: { get: (k: "member") => { id: string } }) => c.get("member").id;

  app.get("/", (c) => {
    const meetingId = c.req.query("meeting_id");
    const rows = deps.db.select().from(voting).where(meetingId ? eq(voting.meetingId, meetingId) : undefined).all();
    return c.json({ votings: rows.map((v) => view(deps, v, me(c))) });
  });
  app.get("/:id", (c) => c.json(view(deps, getVoting(deps, c.req.param("id")), me(c))));
  /** What the election assistant proposes next (spec/protocol.md §9). */
  app.get("/:id/next", (c) => {
    const v = getVoting(deps, c.req.param("id"));
    return c.json({ next: nextStep(deps, v, tieWinners(deps, v.id)) });
  });

  app.post("/issue", async (c) => c.json({ blind_sig: issue(deps, me(c), await c.req.json()) }));
  app.post("/:id/nominal", async (c) => {
    nominal(deps, getVoting(deps, c.req.param("id")), me(c), await c.req.json());
    return c.json(view(deps, getVoting(deps, c.req.param("id")), me(c)), 201);
  });

  app.use("*", requireOfficial);

  app.post("/", async (c) => c.json(view(deps, create(deps, await c.req.json()), me(c)), 201));

  app.post("/:id/open", async (c) => {
    const body = await c.req.json<{ force_reason?: unknown; wait_for_pages?: unknown }>().catch(() => ({}) as Record<string, unknown>);
    const reason = typeof body.force_reason === "string" && body.force_reason.trim() !== "" ? body.force_reason.trim() : null;
    return c.json(view(deps, await open(deps, getVoting(deps, c.req.param("id")), reason, body.wait_for_pages === true), me(c)));
  });

  /** Opens a voting that waits for GitHub Pages once the opening notice is served there (ADR-0008). */
  app.post("/:id/activate", async (c) => {
    const v = getVoting(deps, c.req.param("id"));
    if (v.status !== "awaiting_pages") throw new HttpError(409, "not_awaiting_pages");
    if (!(await deps.publisher.isServed(jsonFile(basePath(v) + ".opening.json", v.opening)))) throw new HttpError(503, "not_served_yet");
    deps.db.update(voting).set({ status: "open" }).where(eq(voting.id, v.id)).run();
    return c.json(view(deps, getVoting(deps, v.id), me(c)));
  });

  app.post("/:id/tallies", async (c) => {
    enterTallies(deps, getVoting(deps, c.req.param("id")), await c.req.json());
    return c.json(view(deps, getVoting(deps, c.req.param("id")), me(c)));
  });

  /** Live votings are closed by the officials; final-link ones close on their own. */
  app.post("/:id/close", async (c) => {
    const v = getVoting(deps, c.req.param("id"));
    if (v.closesAt !== null) throw new HttpError(409, "closes_automatically");
    const closed = close(deps, v, "closed", null);
    if (closed.status === "closed") await publish(deps, closed);
    return c.json(view(deps, getVoting(deps, v.id), me(c)));
  });

  /** Reveals the officials' seed once the drand round exists (spec/draws.md §3). */
  app.post("/:id/reveal", async (c) => {
    const { seed } = await c.req.json<{ seed?: unknown }>();
    await publish(deps, await reveal(deps, getVoting(deps, c.req.param("id")), seed));
    return c.json(view(deps, getVoting(deps, c.req.param("id")), me(c)));
  });

  app.post("/:id/annul", async (c) => {
    const { reason } = await c.req.json<{ reason?: unknown }>();
    if (typeof reason !== "string" || reason.trim() === "") throw new HttpError(400, "reason_required");
    const v = getVoting(deps, c.req.param("id"));
    if (v.status === "created") {
      deps.db.update(voting).set({ status: "annulled", annulReason: reason.trim() }).where(eq(voting.id, v.id)).run();
    } else {
      await publish(deps, close(deps, v, "annulled", reason.trim()));
    }
    return c.json(view(deps, getVoting(deps, v.id), me(c)));
  });

  /** Retries a publication that failed (the board is already built and chained). */
  app.post("/:id/publish", async (c) => {
    await publish(deps, getVoting(deps, c.req.param("id")));
    return c.json(view(deps, getVoting(deps, c.req.param("id")), me(c)));
  });

  return app;
}
