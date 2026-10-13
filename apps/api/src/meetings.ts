/**
 * Meetings with first and second call, attendance recorded by the officials and proxy votes
 * (ADR-0011, ADR-0012). The attendance snapshot computed here is the electorate of each voting.
 */
import { ceilFrac, type Counters } from "@pv/core";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { requireMember, requireOfficial, type AuthEnv, type Member } from "./auth.ts";
import { HttpError, newId, type Deps } from "./context.ts";
import { attendanceEvent, delegation, meeting, member } from "./db/schema.ts";

export type Meeting = typeof meeting.$inferSelect;
type Delegation = typeof delegation.$inferSelect;

function getMeeting(deps: Deps, id: string): Meeting {
  const m = deps.db.select().from(meeting).where(eq(meeting.id, id)).get();
  if (m === undefined) throw new HttpError(404, "meeting_not_found");
  return m;
}

function getMember(deps: Deps, id: unknown): Member {
  const m = typeof id === "string" ? deps.db.select().from(member).where(eq(member.id, id)).get() : undefined;
  if (m === undefined || !m.active) throw new HttpError(404, "member_not_found");
  return m;
}

/** Members present now: those whose last attendance event is an entry. */
export function presentIds(deps: Deps, meetingId: string): Set<string> {
  const last = new Map<string, string>();
  const events = deps.db.select().from(attendanceEvent).where(eq(attendanceEvent.meetingId, meetingId)).orderBy(asc(attendanceEvent.id)).all();
  for (const e of events) last.set(e.memberId, e.kind);
  return new Set([...last].filter(([, kind]) => kind === "in").map(([id]) => id));
}

/** Delegations in force (not suspended). */
export function activeDelegations(deps: Deps, meetingId: string): Delegation[] {
  return deps.db.select().from(delegation).where(and(eq(delegation.meetingId, meetingId), isNull(delegation.suspendedAt))).all();
}

export interface Snapshot {
  /**
   * Voting rights per person: `own` is 1 for a present member of the electorate, and `proxies`
   * counts delegations in force from members of the electorate. In a degree-restricted voting a
   * present delegate from another degree holds only the proxies (ADR-0012).
   */
  rights: { memberId: string; own: 0 | 1; proxies: number }[];
  counters: Counters;
}

/**
 * The attendance snapshot of spec/protocol.md §4 step 1. Proxies follow the presence of the person
 * who holds them, and count when the person who delegated is in the electorate.
 */
export function snapshot(deps: Deps, meetingId: string, degree: string | null = null): Snapshot {
  const m = getMeeting(deps, meetingId);
  const active = deps.db.select().from(member).where(eq(member.active, true)).all();
  const inElectorate = (x: Member) => degree === null || x.degrees.includes(degree);
  const byId = new Map(active.map((x) => [x.id, x]));
  const present = presentIds(deps, meetingId);
  const electorate = active.filter(inElectorate);
  const entries = new Map<string, { memberId: string; own: 0 | 1; proxies: number }>();
  for (const x of electorate) if (present.has(x.id)) entries.set(x.id, { memberId: x.id, own: 1, proxies: 0 });
  let proxies = 0;
  for (const d of activeDelegations(deps, meetingId)) {
    const from = byId.get(d.fromMemberId);
    const to = byId.get(d.toMemberId);
    if (from === undefined || to === undefined || !inElectorate(from) || present.has(from.id) || !present.has(to.id)) continue;
    const entry = entries.get(to.id) ?? { memberId: to.id, own: 0 as const, proxies: 0 };
    entry.proxies++;
    entries.set(to.id, entry);
    proxies++;
  }
  const total = m.membersTotal ?? active.length;
  const ownCount = [...entries.values()].filter((e) => e.own === 1).length;
  return {
    rights: [...entries.values()],
    counters: {
      session_members: total,
      session_present: active.filter((x) => present.has(x.id)).length,
      members: degree === null ? total : electorate.length,
      present: ownCount,
      proxies,
      rights: ownCount + proxies,
    },
  };
}

/** Quorum of the call in force (spec/methods.md §1.2). */
export function meetingQuorum(deps: Deps, m: Meeting): { call: number; fraction: readonly [number, number]; required: number; present: number; met: boolean } {
  const fraction = deps.profile.quorum[m.call - 1]!;
  const { counters } = snapshot(deps, m.id);
  const required = ceilFrac(counters.session_members, fraction);
  return { call: m.call, fraction, required, present: counters.session_present, met: counters.session_present >= required };
}

async function notifyDelegation(deps: Deps, d: { from: Member; to: Member }, event: "registered" | "suspended", title: string): Promise<void> {
  const es = event === "registered" ? "registrado" : "suspendido";
  const en = event === "registered" ? "registered" : "suspended";
  for (const person of [d.from, d.to]) {
    await deps.mailer.send({
      to: person.email,
      subject: `Delegación de voto ${es} · Proxy vote ${en}`,
      text: `${title}\nLa mesa ha ${es} la delegación de ${d.from.name} en ${d.to.name}.\nThe officials have ${en} the proxy vote from ${d.from.name} to ${d.to.name}.\n\n${deps.webOrigin}`,
    });
  }
}

export function meetingRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps));

  app.get("/", (c) => c.json({ meetings: deps.db.select().from(meeting).all() }));

  app.get("/:id", (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    const base = { ...m, quorum: m.status === "open" ? meetingQuorum(deps, m) : null };
    if (!c.get("official")) return c.json(base);
    return c.json({
      ...base,
      present: [...presentIds(deps, m.id)],
      delegations: deps.db.select().from(delegation).where(eq(delegation.meetingId, m.id)).all(),
      second_call_available_at: m.openedAt === null ? null : m.openedAt + deps.profile.second_call_after_minutes * 60_000,
    });
  });

  app.use("*", requireOfficial);

  app.post("/", async (c) => {
    const { title } = await c.req.json<{ title?: unknown }>();
    if (typeof title !== "string" || title.trim() === "") throw new HttpError(400, "invalid_title");
    const row = { id: newId(), title: title.trim(), status: "scheduled" as const, call: 1, openedAt: null, closedAt: null, membersTotal: null };
    deps.db.insert(meeting).values(row).run();
    return c.json(row, 201);
  });

  /** Opens the meeting and freezes the number of members (ADR-0011). One meeting at a time. */
  app.post("/:id/open", (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    if (m.status !== "scheduled") throw new HttpError(409, "not_scheduled");
    if (deps.db.select().from(meeting).where(eq(meeting.status, "open")).get()) throw new HttpError(409, "another_meeting_open");
    const total = deps.db.select().from(member).where(eq(member.active, true)).all().length;
    deps.db.update(meeting).set({ status: "open", openedAt: deps.now(), membersTotal: total }).where(eq(meeting.id, m.id)).run();
    return c.json(getMeeting(deps, m.id));
  });

  /** Activates the second call, available N minutes after opening (profile). */
  app.post("/:id/second-call", (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    if (m.status !== "open" || m.call !== 1 || deps.profile.quorum.length < 2) throw new HttpError(409, "second_call_unavailable");
    if (deps.now() < m.openedAt! + deps.profile.second_call_after_minutes * 60_000) throw new HttpError(409, "second_call_too_early");
    deps.db.update(meeting).set({ call: 2 }).where(eq(meeting.id, m.id)).run();
    return c.json(getMeeting(deps, m.id));
  });

  app.post("/:id/close", (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    if (m.status !== "open") throw new HttpError(409, "not_open");
    deps.db.update(meeting).set({ status: "closed", closedAt: deps.now() }).where(eq(meeting.id, m.id)).run();
    return c.json(getMeeting(deps, m.id));
  });

  /** Records an entry or exit. An entry suspends the person's own delegation (ADR-0012). */
  app.post("/:id/attendance", async (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    if (m.status !== "open") throw new HttpError(409, "not_open");
    const body = await c.req.json<{ member_id?: unknown; kind?: unknown; mode?: unknown }>();
    const person = getMember(deps, body.member_id);
    if ((body.kind !== "in" && body.kind !== "out") || (body.mode !== "in_person" && body.mode !== "remote")) throw new HttpError(400, "invalid_request");
    const isPresent = presentIds(deps, m.id).has(person.id);
    if (isPresent === (body.kind === "in")) throw new HttpError(409, body.kind === "in" ? "already_present" : "not_present");
    const own = deps.db.select().from(delegation).where(and(eq(delegation.meetingId, m.id), eq(delegation.fromMemberId, person.id), isNull(delegation.suspendedAt))).get();
    deps.db.transaction((tx) => {
      tx.insert(attendanceEvent).values({ meetingId: m.id, memberId: person.id, kind: body.kind as "in" | "out", mode: body.mode as "in_person" | "remote", at: deps.now(), byMemberId: c.get("member").id }).run();
      if (body.kind === "in" && own !== undefined) {
        tx.update(delegation).set({ suspendedAt: deps.now() }).where(and(eq(delegation.meetingId, m.id), eq(delegation.fromMemberId, person.id))).run();
      }
    });
    if (body.kind === "in" && own !== undefined) await notifyDelegation(deps, { from: person, to: getMember(deps, own.toMemberId) }, "suspended", m.title);
    return c.json({ present: [...presentIds(deps, m.id)], quorum: meetingQuorum(deps, getMeeting(deps, m.id)) }, 201);
  });

  /** Registers a proxy vote. Only "justified: yes" is stored; the reason is never sent. */
  app.post("/:id/delegations", async (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    if (m.status === "closed") throw new HttpError(409, "meeting_closed");
    const body = await c.req.json<{ from_member_id?: unknown; to_member_id?: unknown; justified?: unknown }>();
    if (body.justified !== true) throw new HttpError(400, "justification_required");
    const from = getMember(deps, body.from_member_id);
    const to = getMember(deps, body.to_member_id);
    if (from.id === to.id) throw new HttpError(400, "same_person");
    const active = activeDelegations(deps, m.id);
    if (presentIds(deps, m.id).has(from.id)) throw new HttpError(409, "delegator_present");
    if (active.some((d) => d.fromMemberId === from.id)) throw new HttpError(409, "already_delegated");
    if (active.some((d) => d.fromMemberId === to.id)) throw new HttpError(409, "delegate_has_delegated");
    if (active.some((d) => d.toMemberId === from.id)) throw new HttpError(409, "delegator_holds_proxies");
    if (active.filter((d) => d.toMemberId === to.id).length >= deps.profile.max_proxies) throw new HttpError(409, "proxy_limit");
    const row = { meetingId: m.id, fromMemberId: from.id, toMemberId: to.id, justified: true, createdAt: deps.now(), suspendedAt: null };
    deps.db.insert(delegation).values(row).onConflictDoUpdate({ target: [delegation.meetingId, delegation.fromMemberId], set: row }).run();
    await notifyDelegation(deps, { from, to }, "registered", m.title);
    return c.json(row, 201);
  });

  app.delete("/:id/delegations/:fromId", async (c) => {
    const m = getMeeting(deps, c.req.param("id"));
    const d = activeDelegations(deps, m.id).find((x) => x.fromMemberId === c.req.param("fromId"));
    if (d === undefined) throw new HttpError(404, "delegation_not_found");
    deps.db.update(delegation).set({ suspendedAt: deps.now() }).where(and(eq(delegation.meetingId, m.id), eq(delegation.fromMemberId, d.fromMemberId))).run();
    await notifyDelegation(deps, { from: getMember(deps, d.fromMemberId), to: getMember(deps, d.toMemberId) }, "suspended", m.title);
    return c.body(null, 204);
  });

  return app;
}
