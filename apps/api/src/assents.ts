/**
 * Assent by e-mail (spec/methods.md §7, spec/formats.md §8): a proposal is approved if nobody
 * objects before the deadline. Proxies do not apply. Objections are named and go to the minutes,
 * not to the published record.
 */
import { assentMinClose, assentOutcome, formatTimestamp, hashJsonHex, isId, isTimestamp, parseTimestamp } from "@pv/core";
import { and, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { requireMember, requireOfficial, type AuthEnv, type Member } from "./auth.ts";
import { appendToChain, chainFile, datePath, recordOf } from "./chain.ts";
import { HttpError, type Deps } from "./context.ts";
import { assent, assentObjection, member, roleAssignment } from "./db/schema.ts";
import { jsonFile } from "./publisher.ts";
import { randomBytes } from "node:crypto";

export type Assent = typeof assent.$inferSelect;

function electorate(deps: Deps, filter: string | null): Member[] {
  return deps.db.select().from(member).where(eq(member.active, true)).all().filter((m) => filter === null || m.degrees.includes(filter));
}

function getAssent(deps: Deps, id: string): Assent {
  const a = deps.db.select().from(assent).where(eq(assent.id, id)).get();
  if (a === undefined) throw new HttpError(404, "assent_not_found");
  return a;
}

function standing(deps: Deps, id: string) {
  return deps.db.select().from(assentObjection).where(and(eq(assentObjection.assentId, id), isNull(assentObjection.withdrawnAt))).all();
}

const path = (a: Assent) => `${datePath(a.closesAt)}/${a.id}.assent.json`;

/** Closes every assent whose deadline has passed: builds, chains and publishes its record. */
export async function closeDueAssents(deps: Deps): Promise<void> {
  const due = deps.db.select().from(assent).where(eq(assent.status, "open")).all().filter((a) => a.closesAt <= deps.now());
  for (const a of due) {
    const objections = standing(deps, a.id).length;
    const p = deps.profile;
    const record = {
      closes_at: formatTimestamp(a.closesAt),
      electorate_filter: a.electorateFilter,
      members: a.members,
      objections,
      outcome: assentOutcome(objections),
      profile: { hash: hashJsonHex(p), id: p.id, version: p.profile_version },
      sent_at: formatTimestamp(a.sentAt),
      title: a.title,
      type: "assent",
      version: 1,
      voting_id: a.id,
    };
    deps.db.transaction((tx) => {
      appendToChain(tx, record, path(a));
      tx.update(assent).set({ status: "closed", record }).where(eq(assent.id, a.id)).run();
    });
    await deps.publisher.publish([jsonFile(path(a), record), chainFile(deps)], `Close assent ${a.id}`);
    deps.db.update(assent).set({ publishedAt: deps.now() }).where(eq(assent.id, a.id)).run();
    const hash = recordOf(deps, record);
    const es = record.outcome === "approved" ? "Aprobada" : `Va al siguiente pleno (${objections} oposiciones)`;
    const en = record.outcome === "approved" ? "Approved" : `Goes to the next plenary (${objections} objections)`;
    for (const m of electorate(deps, a.electorateFilter)) {
      await deps.mailer.send({ to: m.email, subject: `Asentimiento cerrado · Assent closed: ${a.title}`, text: `${es}. Hash del registro: ${hash}\n${en}. Record hash: ${hash}\n\n${deps.webOrigin}` });
    }
  }
}

export function assentRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps));

  app.get("/", (c) => {
    const me = c.get("member");
    const rows = deps.db.select().from(assent).all();
    return c.json({
      assents: rows.map((a) => ({
        id: a.id, title: a.title, text: a.text, status: a.status, closes_at: formatTimestamp(a.closesAt), record: a.record,
        in_electorate: a.electorateFilter === null || me.degrees.includes(a.electorateFilter),
        objected: standing(deps, a.id).some((o) => o.memberId === me.id),
        objections: c.get("official") ? standing(deps, a.id).length : undefined,
      })),
    });
  });

  /** Objects, or withdraws an objection, until the deadline. Each objection is told to the officials. */
  const object = (withdraw: boolean) => async (c: Context<AuthEnv>) => {
    const a = getAssent(deps, c.req.param("id")!);
    const me = c.get("member");
    if (a.status !== "open" || a.closesAt <= deps.now()) throw new HttpError(409, "assent_closed");
    if (a.electorateFilter !== null && !me.degrees.includes(a.electorateFilter)) throw new HttpError(403, "not_in_electorate");
    const key = and(eq(assentObjection.assentId, a.id), eq(assentObjection.memberId, me.id));
    if (withdraw) deps.db.update(assentObjection).set({ withdrawnAt: deps.now() }).where(key).run();
    else {
      const row = { assentId: a.id, memberId: me.id, at: deps.now(), withdrawnAt: null };
      deps.db.insert(assentObjection).values(row).onConflictDoUpdate({ target: [assentObjection.assentId, assentObjection.memberId], set: row }).run();
      const officials = deps.db.select({ email: member.email }).from(roleAssignment).innerJoin(member, eq(member.id, roleAssignment.memberId)).all();
      for (const o of officials) {
        await deps.mailer.send({ to: o.email, subject: `Oposición · Objection: ${a.title}`, text: `${me.name} se opone a «${a.title}».\n${me.name} objects to "${a.title}".` });
      }
    }
    return c.body(null, 204);
  };
  app.post("/:id/objection", object(false));
  app.delete("/:id/objection", object(true));

  app.use("*", requireOfficial);

  /**
   * Sends a proposal. The deadline must be at least 23:59 local time on the day `sent + N`, and the
   * officials confirm that the matter is not one of the profile's excluded ones.
   */
  app.post("/", async (c) => {
    const b = await c.req.json<{ title?: unknown; text?: unknown; closes_at?: unknown; electorate_filter?: unknown; not_excluded?: unknown }>();
    if (typeof b.title !== "string" || b.title.trim() === "" || typeof b.text !== "string" || b.text.trim() === "") throw new HttpError(400, "invalid_request");
    if (b.not_excluded !== true) throw new HttpError(400, "confirm_not_excluded");
    const filter = b.electorate_filter ?? null;
    if (filter !== null && !(isId(filter) && deps.profile.degrees.some((d) => d.id === filter))) throw new HttpError(400, "invalid_electorate_filter");
    const sentAt = Math.floor(deps.now() / 1000) * 1000;
    const minimum = assentMinClose(formatTimestamp(sentAt), deps.profile.timezone, deps.profile.assent_min_days);
    if (!isTimestamp(b.closes_at) || parseTimestamp(b.closes_at) < parseTimestamp(minimum)) throw new HttpError(400, "closes_too_early");
    const people = electorate(deps, filter as string | null);
    const row: Assent = {
      id: randomBytes(16).toString("hex"), title: b.title.trim(), text: b.text.trim(), electorateFilter: filter as string | null, members: people.length,
      sentAt, closesAt: parseTimestamp(b.closes_at) * 1000, status: "open", record: null, publishedAt: null,
    };
    deps.db.insert(assent).values(row).run();
    for (const m of people) {
      await deps.mailer.send({
        to: m.email,
        subject: `Propuesta por asentimiento · Proposal by assent: ${row.title}`,
        text: `${row.text}\n\nSe aprobará si nadie se opone antes de ${b.closes_at} (UTC). Para oponerte, entra en ${deps.webOrigin}\nIt will be approved unless someone objects before ${b.closes_at} (UTC). To object, go to ${deps.webOrigin}`,
      });
    }
    return c.json({ ...row, min_closes_at: minimum }, 201);
  });

  /** Names of the people whose objection stands, for the minutes. */
  app.get("/:id/objections", (c) => {
    const a = getAssent(deps, c.req.param("id"));
    const rows = deps.db.select({ name: member.name }).from(assentObjection).innerJoin(member, eq(member.id, assentObjection.memberId)).where(and(eq(assentObjection.assentId, a.id), isNull(assentObjection.withdrawnAt))).all();
    return c.json({ objections: rows.map((r) => r.name).sort() });
  });

  return app;
}
