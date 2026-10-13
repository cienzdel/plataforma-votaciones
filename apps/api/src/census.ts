/**
 * Census from CSV and the `mesa` role (ADR-0011, ADR-0025). The census is a closed list: an import
 * replaces it, and members missing from the file are deactivated, never deleted.
 */
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { normaliseEmail, officialsCount, requireMember, requireOfficial, type AuthEnv } from "./auth.ts";
import { HttpError, newId, type Deps } from "./context.ts";
import { censusChange, meeting, member, roleAssignment, roleLog } from "./db/schema.ts";

export const MAX_OFFICIALS = 3;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Parses RFC 4180 CSV (quoted fields, `""` escapes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new HttpError(400, "csv_unterminated_quote");
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export interface CensusRow {
  name: string;
  email: string;
  degrees: string[];
}

/** Reads a census CSV with the header `name,email,degrees`; degrees are separated by `;`. */
export function readCensus(text: string, degreeIds: readonly string[]): CensusRow[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (header === undefined || header.map((h) => h.trim().toLowerCase()).join(",") !== "name,email,degrees") {
    throw new HttpError(400, "csv_header");
  }
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const line = i + 2;
    const [name = "", email = "", degrees = ""] = r.map((f) => f.trim());
    const address = normaliseEmail(email);
    const ids = degrees === "" ? [] : degrees.split(";").map((d) => d.trim());
    if (r.length !== 3 || name === "" || !EMAIL.test(address) || seen.has(address) || ids.some((d) => !degreeIds.includes(d))) {
      throw new HttpError(400, "csv_row_" + line);
    }
    seen.add(address);
    return { name, email: address, degrees: ids };
  });
}

/**
 * Makes sure the first official from the deployment configuration exists while nobody holds the
 * role (ADR-0025).
 */
export function ensureFirstOfficial(deps: Deps, first: { email: string; name: string }): void {
  if (officialsCount(deps) > 0) return;
  const email = normaliseEmail(first.email);
  let m = deps.db.select().from(member).where(eq(member.email, email)).get();
  if (m === undefined) {
    m = { id: newId(), name: first.name, email, degrees: [], active: true };
    deps.db.insert(member).values(m).run();
    deps.db.insert(censusChange).values({ memberId: m.id, change: "added", byMemberId: null, reason: "first official", at: deps.now() }).run();
  }
  deps.db.update(member).set({ active: true }).where(eq(member.id, m.id)).run();
  deps.db.insert(roleAssignment).values({ memberId: m.id, alias: "Mesa", byMemberId: null, at: deps.now() }).run();
  deps.db.insert(roleLog).values({ alias: "Mesa", change: "assigned", at: deps.now() }).run();
}

export function censusRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps), requireOfficial);

  app.get("/", (c) => c.json({ members: deps.db.select().from(member).orderBy(member.name).all() }));

  /**
   * Replaces the census. With `dry_run` it only reports the changes. While a meeting is open a
   * `reason` is required, and the frozen number of members of that meeting is updated.
   */
  app.post("/import", async (c) => {
    const body = await c.req.json<{ csv?: unknown; reason?: unknown; dry_run?: unknown }>();
    if (typeof body.csv !== "string") throw new HttpError(400, "invalid_request");
    const rows = readCensus(body.csv, deps.profile.degrees.map((d) => d.id));
    const current = deps.db.select().from(member).all();
    const byEmail = new Map(current.map((m) => [m.email, m]));
    const listed = new Set(rows.map((r) => r.email));
    const officials = new Set(deps.db.select().from(roleAssignment).all().map((r) => r.memberId));

    const added = rows.filter((r) => !byEmail.has(r.email));
    const updated = rows.filter((r) => {
      const m = byEmail.get(r.email);
      return m !== undefined && (m.name !== r.name || m.degrees.join(";") !== r.degrees.join(";") || !m.active);
    });
    const deactivated = current.filter((m) => m.active && !listed.has(m.email));
    if (deactivated.some((m) => officials.has(m.id))) throw new HttpError(409, "would_deactivate_official");
    const summary = { added: added.length, updated: updated.length, deactivated: deactivated.length };
    if (body.dry_run === true) return c.json({ dry_run: true, ...summary });

    const open = deps.db.select().from(meeting).where(eq(meeting.status, "open")).get();
    const reason = typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : null;
    const changes = summary.added + summary.updated + summary.deactivated;
    if (open !== undefined && changes > 0 && reason === null) throw new HttpError(409, "meeting_open_reason_required");

    const by = c.get("member").id;
    const at = deps.now();
    deps.db.transaction((tx) => {
      for (const r of added) {
        const id = newId();
        tx.insert(member).values({ id, ...r, active: true }).run();
        tx.insert(censusChange).values({ memberId: id, change: "added", byMemberId: by, reason, at }).run();
      }
      for (const r of updated) {
        const m = byEmail.get(r.email)!;
        tx.update(member).set({ name: r.name, degrees: r.degrees, active: true }).where(eq(member.id, m.id)).run();
        tx.insert(censusChange).values({ memberId: m.id, change: m.active ? "updated" : "reactivated", byMemberId: by, reason, at }).run();
      }
      for (const m of deactivated) {
        tx.update(member).set({ active: false }).where(eq(member.id, m.id)).run();
        tx.insert(censusChange).values({ memberId: m.id, change: "deactivated", byMemberId: by, reason, at }).run();
      }
      if (open !== undefined && changes > 0) {
        const total = tx.select().from(member).where(eq(member.active, true)).all().length;
        tx.update(meeting).set({ membersTotal: total }).where(eq(meeting.id, open.id)).run();
      }
    });
    return c.json({ dry_run: false, ...summary });
  });

  return app;
}

export function roleRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  /** Public log of role changes, by alias of the position only. */
  app.get("/log", (c) => c.json({ log: deps.db.select({ alias: roleLog.alias, change: roleLog.change, at: roleLog.at }).from(roleLog).all() }));

  app.use(requireMember(deps), requireOfficial);

  app.get("/", (c) =>
    c.json({
      officials: deps.db
        .select({ member_id: roleAssignment.memberId, alias: roleAssignment.alias, name: member.name })
        .from(roleAssignment)
        .innerJoin(member, eq(member.id, roleAssignment.memberId))
        .all(),
    }),
  );

  app.post("/", async (c) => {
    const { member_id, alias } = await c.req.json<{ member_id?: unknown; alias?: unknown }>();
    if (typeof member_id !== "string" || typeof alias !== "string" || alias.trim() === "") throw new HttpError(400, "invalid_request");
    const m = deps.db.select().from(member).where(eq(member.id, member_id)).get();
    if (m === undefined || !m.active) throw new HttpError(404, "member_not_found");
    if (deps.db.select().from(roleAssignment).where(eq(roleAssignment.memberId, m.id)).get()) throw new HttpError(409, "already_official");
    if (officialsCount(deps) >= MAX_OFFICIALS) throw new HttpError(409, "too_many_officials");
    deps.db.transaction((tx) => {
      tx.insert(roleAssignment).values({ memberId: m.id, alias: alias.trim(), byMemberId: c.get("member").id, at: deps.now() }).run();
      tx.insert(roleLog).values({ alias: alias.trim(), change: "assigned", at: deps.now() }).run();
    });
    return c.json({ member_id: m.id, alias: alias.trim() }, 201);
  });

  app.delete("/:memberId", (c) => {
    const row = deps.db.select().from(roleAssignment).where(eq(roleAssignment.memberId, c.req.param("memberId"))).get();
    if (row === undefined) throw new HttpError(404, "not_official");
    if (officialsCount(deps) <= 1) throw new HttpError(409, "last_official");
    deps.db.transaction((tx) => {
      tx.delete(roleAssignment).where(eq(roleAssignment.memberId, row.memberId)).run();
      tx.insert(roleLog).values({ alias: row.alias, change: "removed", at: deps.now() }).run();
    });
    return c.body(null, 204);
  });

  return app;
}
