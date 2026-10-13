/**
 * Secret votings (milestone H6, spec/protocol.md §3–§7): creation, opening with the attendance
 * snapshot and the opening notice, credential issuance, closing, the board, the chain and
 * publication. Vote reception is in reception.ts, on its own origin.
 */
import {
  canonicalize,
  cellIdHex,
  cellSpec,
  computeQuorum,
  computeResult,
  formatTimestamp,
  GENESIS_PREV,
  hashJsonHex,
  isFraction,
  isId,
  isTimestamp,
  keyFingerprint,
  parseTimestamp,
  recordHash,
  tallyCells,
  validateParams,
  type Fraction,
  type Method,
} from "@pv/core";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireMember, requireOfficial, type AuthEnv } from "./auth.ts";
import { HttpError, type Deps } from "./context.ts";
import { ballotReceived, chainRecord, electorateSnapshot, issuance, meeting, member, signingKey, voting } from "./db/schema.ts";
import { blindSign, BlindSignError, MODULUS_BYTES, newVotingKey } from "./keys.ts";
import { snapshot } from "./meetings.ts";
import { jsonFile, type File } from "./publisher.ts";

export type Voting = typeof voting.$inferSelect;
/** Methods available in H6. `posts` and `limited_vote` need draws and arrive in H8. */
const H6_METHODS: Method[] = ["yes_no", "single_winner"];

export function getVoting(deps: Deps, id: string): Voting {
  const v = deps.db.select().from(voting).where(eq(voting.id, id)).get();
  if (v === undefined) throw new HttpError(404, "voting_not_found");
  return v;
}

/** Folder of a voting in the data repository: the UTC date it opened (spec/formats.md §9.1). */
function basePath(v: Voting): string {
  return formatTimestamp(v.openedAt!).slice(0, 10).replaceAll("-", "/") + "/" + v.id;
}

function keyDocument(deps: Deps, votingId: string): { fingerprint: string; public_key: string } {
  const k = deps.db.select().from(signingKey).where(eq(signingKey.votingId, votingId)).get()!;
  return { fingerprint: keyFingerprint(k.publicKey), public_key: k.publicKey };
}

// --- creation (spec/protocol.md §3)

interface CreateBody {
  meeting_id?: unknown;
  title?: unknown;
  method?: unknown;
  params?: unknown;
  timing?: unknown;
  closes_at?: unknown;
  electorate_filter?: unknown;
  min_attendance?: unknown;
  candidates?: unknown;
}

function create(deps: Deps, b: CreateBody): Voting {
  const m = typeof b.meeting_id === "string" ? deps.db.select().from(meeting).where(eq(meeting.id, b.meeting_id)).get() : undefined;
  if (m === undefined) throw new HttpError(404, "meeting_not_found");
  if (m.status !== "open") throw new HttpError(409, "meeting_not_open");
  if (typeof b.title !== "string" || b.title.trim() === "") throw new HttpError(400, "invalid_title");
  if (!H6_METHODS.includes(b.method as Method)) throw new HttpError(400, "unsupported_method");
  const method = b.method as Method;
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
  let closesAt: number | null = null;
  if (b.timing === "final_link") {
    if (!isTimestamp(b.closes_at) || parseTimestamp(b.closes_at) * 1000 <= deps.now()) throw new HttpError(400, "invalid_closes_at");
    closesAt = parseTimestamp(b.closes_at) * 1000;
  }
  const filter = b.electorate_filter ?? null;
  if (filter !== null && !(isId(filter) && deps.profile.degrees.some((d) => d.id === filter))) throw new HttpError(400, "invalid_electorate_filter");
  const minAttendance = b.min_attendance ?? null;
  if (minAttendance !== null && !isFraction(minAttendance)) throw new HttpError(400, "invalid_min_attendance");

  const id = randomBytes(16).toString("hex");
  let candidates: Record<string, unknown> | null = null;
  if (ids.length > 0) {
    const names = new Map(Array.isArray(b.candidates) ? b.candidates.map((c: { id?: unknown; name?: unknown }) => [c.id, c.name]) : []);
    if (!ids.every((c) => typeof names.get(c) === "string" && (names.get(c) as string).trim() !== "")) throw new HttpError(400, "candidate_names_required");
    candidates = { candidates: ids.map((c) => ({ id: c, name: (names.get(c) as string).trim() })), posts: [], type: "candidates", version: 1, voting_id: id };
  }
  const draft = { electorate_filter: filter, method, min_attendance: minAttendance as Fraction | null, mode: "secret", params, timing: b.timing };
  const row: Voting = {
    id, meetingId: m.id, title: b.title.trim(), status: "created", rules: draft, rulesHash: "", candidates, closesAt,
    openedAt: null, closedAt: null, snapshotCounters: null, quorum: null, opening: null, board: null, annulReason: null, publishedAt: null,
  };
  deps.db.insert(voting).values(row).run();
  return row;
}

// --- opening (spec/protocol.md §4)

/**
 * Freezes the electorate, checks quorum, creates the key and publishes the opening notice. The
 * effective rules are fixed here, with the quorum of the call in force (spec/formats.md §4).
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

  const draft = v.rules as { electorate_filter: string | null; min_attendance: Fraction | null };
  const p = deps.profile;
  const rules = {
    ...draft,
    profile: { hash: hashJsonHex(p), id: p.id, version: p.profile_version },
    quorum: p.quorum[m.call - 1]!,
  };
  const snap = snapshot(deps, m.id, draft.electorate_filter);
  const q = computeQuorum(rules, snap.counters);
  const metAll = q.met && (q.min_attendance === null || q.min_attendance.met);
  if (!metAll && forceReason === null) throw new HttpError(409, "quorum_not_met");
  const quorum = { forced: metAll ? null : { reason: forceReason! }, ...q };

  const key = await newVotingKey(deps.masterKey, v.id);
  const openedAt = Math.floor(now / 1000) * 1000;
  const updated: Voting = {
    ...v, status: "open", rules, rulesHash: hashJsonHex(rules), openedAt, snapshotCounters: { ...snap.counters }, quorum,
  };
  const opening = {
    closes_at: v.closesAt === null ? null : formatTimestamp(v.closesAt),
    draw_commitment: null,
    draw_round: null,
    key: { fingerprint: keyFingerprint(key.publicKey), public_key: key.publicKey },
    opened_at: formatTimestamp(openedAt),
    quorum,
    rules,
    rules_hash: updated.rulesHash,
    title: v.title,
    type: "opening",
    version: 1,
    voting_id: v.id,
  };
  updated.opening = opening;
  // final_link always waits for Pages; live waits if the officials ask (ADR-0008).
  updated.status = v.closesAt !== null || waitForPages ? "awaiting_pages" : "open";

  deps.db.transaction((tx) => {
    tx.update(voting).set(updated).where(eq(voting.id, v.id)).run();
    tx.insert(signingKey).values({ votingId: v.id, publicKey: key.publicKey, privateKey: key.privateKey, destroyedAt: null }).run();
    for (const r of snap.rights) tx.insert(electorateSnapshot).values({ votingId: v.id, memberId: r.memberId, rights: r.own + r.proxies }).run();
  });
  await deps.publisher.publish([jsonFile(basePath(updated) + ".opening.json", opening)], `Open voting ${v.id}`);
  return updated;
}

// --- issuance (spec/protocol.md §5)

function issue(deps: Deps, memberId: string, body: { voting_id?: unknown; right?: unknown; blinded_msg?: unknown }): string {
  const v = typeof body.voting_id === "string" ? deps.db.select().from(voting).where(eq(voting.id, body.voting_id)).get() : undefined;
  const snap = v && deps.db.select().from(electorateSnapshot).where(and(eq(electorateSnapshot.votingId, v.id), eq(electorateSnapshot.memberId, memberId))).get();
  if (v === undefined || snap === undefined) throw new HttpError(403, "not_in_electorate");
  if (v.status !== "open") throw new HttpError(409, "voting_not_open");
  const right = body.right;
  if (!Number.isSafeInteger(right) || (right as number) < 0 || (right as number) >= snap.rights) throw new HttpError(400, "invalid_right");
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

// --- closing and publication (spec/protocol.md §7)

/** Builds the board from the stored ballots (spec/formats.md §5). */
function buildBoard(deps: Deps, v: Voting, status: "closed" | "annulled"): Record<string, unknown> {
  const rules = v.rules as { method: Method; params: Record<string, unknown> };
  const ballots = deps.db.select().from(ballotReceived).where(eq(ballotReceived.votingId, v.id)).all();
  const spec = cellSpec(rules.method, rules.params);
  const participation = ballots.map((b) => [b.token, b.sig] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cells: Record<string, [string, string][]> = {};
  for (const cell of spec.keys()) {
    cells[cell] = ballots.map((b) => [cellIdHex(b.s, v.id, cell), b.answers[cell]!] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  const tallies = tallyCells(spec, cells);
  const issued = deps.db.select({ n: count() }).from(issuance).where(eq(issuance.votingId, v.id)).get()!.n;
  const counters = { ...v.snapshotCounters!, issued, received: ballots.length } as Record<string, number>;
  const board: Record<string, unknown> = {
    candidates_hash: v.candidates === null ? null : hashJsonHex(v.candidates),
    cells,
    closed_at: formatTimestamp(v.closedAt!),
    counters,
    draw: null,
    key: keyDocument(deps, v.id),
    opened_at: formatTimestamp(v.openedAt!),
    participation,
    quorum: v.quorum,
    result: status === "closed" ? computeResult(rules.method, rules.params, tallies, counters as never) : null,
    roll_call_hash: null,
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
  return board;
}

/**
 * Closes a voting: destroys the key, builds the board and appends it to the chain. Publication
 * follows in `publish`, which can be retried if the data repository is unreachable.
 */
function close(deps: Deps, v: Voting, status: "closed" | "annulled", reason: string | null): Voting {
  if (v.status !== "open" && v.status !== "awaiting_pages") throw new HttpError(409, "not_open");
  const closedAt = v.closesAt ?? Math.floor(deps.now() / 1000) * 1000;
  const closing = { ...v, status, closedAt, annulReason: reason };
  const board = buildBoard(deps, closing, status);
  deps.db.transaction((tx) => {
    tx.update(signingKey).set({ privateKey: null, destroyedAt: deps.now() }).where(eq(signingKey.votingId, v.id)).run();
    const last = tx.select().from(chainRecord).orderBy(desc(chainRecord.seq)).get();
    const prev = last?.recordHash ?? GENESIS_PREV;
    const boardHash = hashJsonHex(board);
    tx.insert(chainRecord).values({ seq: (last?.seq ?? 0) + 1, board: boardHash, prev, recordHash: recordHash(boardHash, prev), path: basePath(closing) + ".board.json" }).run();
    tx.update(voting).set({ status, closedAt, annulReason: reason, board }).where(eq(voting.id, v.id)).run();
  });
  return getVoting(deps, v.id);
}

/** Publishes the board, its candidates table and the chain in one commit; then notifies and erases. */
export async function publish(deps: Deps, v: Voting): Promise<void> {
  if (v.board === null || v.publishedAt !== null) throw new HttpError(409, "nothing_to_publish");
  const records = deps.db.select().from(chainRecord).orderBy(chainRecord.seq).all();
  const files: File[] = [jsonFile(basePath(v) + ".board.json", v.board)];
  if (v.candidates !== null) files.push(jsonFile(basePath(v) + ".candidates.json", v.candidates));
  files.push(
    jsonFile("chain.json", {
      records: records.map((r) => ({ board: r.board, path: r.path, prev: r.prev, record_hash: r.recordHash })),
      type: "chain",
      version: 1,
    }),
  );
  await deps.publisher.publish(files, `${v.status === "closed" ? "Close" : "Annul"} voting ${v.id}`);
  deps.db.update(voting).set({ publishedAt: deps.now() }).where(eq(voting.id, v.id)).run();

  const record = records.find((r) => r.board === hashJsonHex(v.board))!;
  await notify(deps, v, record.recordHash);
  // Erase s and the grouped ballots; only the spent tokens remain (spec/protocol.md §7 step 8).
  deps.db.delete(ballotReceived).where(eq(ballotReceived.votingId, v.id)).run();
  deps.db.run(sql`VACUUM`);
}

/** "N credentials were issued in your name" to every member of the electorate (ADR-0007). */
async function notify(deps: Deps, v: Voting, recordHash: string): Promise<void> {
  const filter = (v.rules as { electorate_filter: string | null }).electorate_filter;
  const issued = new Map(
    deps.db.select({ memberId: issuance.memberId, n: count() }).from(issuance).where(eq(issuance.votingId, v.id)).groupBy(issuance.memberId).all().map((r) => [r.memberId, r.n]),
  );
  const electorate = deps.db.select().from(member).where(eq(member.active, true)).all().filter((m) => filter === null || m.degrees.includes(filter));
  for (const m of electorate) {
    const n = issued.get(m.id) ?? 0;
    await deps.mailer.send({
      to: m.email,
      subject: `Resultado publicado · Result published: ${v.title}`,
      text:
        `Se ha publicado el resultado de «${v.title}». Hash del registro: ${recordHash}\nSe emitieron ${n} credenciales a tu nombre. Si no coincide con lo que hiciste, avisa a la mesa.\n\n` +
        `The result of "${v.title}" has been published. Record hash: ${recordHash}\n${n} credentials were issued in your name. If this does not match what you did, tell the officials.\n\n${deps.webOrigin}`,
    });
  }
}

/** Closes and publishes every final-link voting whose closing time has passed. */
export async function closeDue(deps: Deps): Promise<void> {
  const due = deps.db.select().from(voting).where(inArray(voting.status, ["open", "awaiting_pages"])).all().filter((v) => v.closesAt !== null && v.closesAt <= deps.now());
  for (const v of due) await publish(deps, close(deps, v, "closed", null));
}

// --- routes

/** The public view of a voting, plus the caller's rights when they are in the electorate. */
function view(deps: Deps, v: Voting, memberId: string) {
  const rights = deps.db.select().from(electorateSnapshot).where(and(eq(electorateSnapshot.votingId, v.id), eq(electorateSnapshot.memberId, memberId))).get()?.rights ?? 0;
  return { id: v.id, title: v.title, status: v.status, opening: v.opening, board: v.board, candidates: v.candidates, my_rights: rights };
}

export function votingRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps));

  app.get("/", (c) => {
    const meetingId = c.req.query("meeting_id");
    const rows = deps.db.select().from(voting).where(meetingId ? eq(voting.meetingId, meetingId) : undefined).all();
    return c.json({ votings: rows.map((v) => view(deps, v, c.get("member").id)) });
  });
  app.get("/:id", (c) => c.json(view(deps, getVoting(deps, c.req.param("id")), c.get("member").id)));

  /** Credential issuance: one blind signature per right (spec/protocol.md §5). */
  app.post("/issue", async (c) => c.json({ blind_sig: issue(deps, c.get("member").id, await c.req.json()) }));

  app.use("*", requireOfficial);

  app.post("/", async (c) => c.json(view(deps, create(deps, await c.req.json()), c.get("member").id), 201));

  app.post("/:id/open", async (c) => {
    const body = await c.req.json<{ force_reason?: unknown; wait_for_pages?: unknown }>().catch(() => ({}) as Record<string, unknown>);
    const reason = typeof body.force_reason === "string" && body.force_reason.trim() !== "" ? body.force_reason.trim() : null;
    return c.json(view(deps, await open(deps, getVoting(deps, c.req.param("id")), reason, body.wait_for_pages === true), c.get("member").id));
  });

  /** Opens a voting that waits for GitHub Pages once the opening notice is served there (ADR-0008). */
  app.post("/:id/activate", async (c) => {
    const v = getVoting(deps, c.req.param("id"));
    if (v.status !== "awaiting_pages") throw new HttpError(409, "not_awaiting_pages");
    if (!(await deps.publisher.isServed(jsonFile(basePath(v) + ".opening.json", v.opening)))) throw new HttpError(503, "not_served_yet");
    deps.db.update(voting).set({ status: "open" }).where(eq(voting.id, v.id)).run();
    return c.json(view(deps, getVoting(deps, v.id), c.get("member").id));
  });

  /** Live votings are closed by the officials; final-link ones close on their own. */
  app.post("/:id/close", async (c) => {
    const v = getVoting(deps, c.req.param("id"));
    if (v.closesAt !== null) throw new HttpError(409, "closes_automatically");
    const closed = close(deps, v, "closed", null);
    await publish(deps, closed);
    return c.json(view(deps, getVoting(deps, v.id), c.get("member").id));
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
    return c.json(view(deps, getVoting(deps, v.id), c.get("member").id));
  });

  /** Retries a publication that failed (the board is already built and chained). */
  app.post("/:id/publish", async (c) => {
    await publish(deps, getVoting(deps, c.req.param("id")));
    return c.json(view(deps, getVoting(deps, c.req.param("id")), c.get("member").id));
  });

  return app;
}
