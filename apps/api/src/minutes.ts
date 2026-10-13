/**
 * Export for the minutes (PLAN/PLAN.md §2): Markdown with rules, named attendance, results, draws
 * and forced openings, plus the boards as JSON. The named attendance is only in this export, never
 * on the public web.
 */
import { formatTimestamp } from "@pv/core";
import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { AuthEnv } from "./auth.ts";
import { HttpError, type Deps } from "./context.ts";
import { attendanceEvent, delegation, meeting, member, tieDraw, voting } from "./db/schema.ts";

const time = (ms: number | null) => (ms === null ? "—" : formatTimestamp(ms));

export function minutes(deps: Deps, c: Context<AuthEnv>) {
  const m = deps.db.select().from(meeting).where(eq(meeting.id, c.req.param("id")!)).get();
  if (m === undefined) throw new HttpError(404, "meeting_not_found");
  const names = new Map(deps.db.select().from(member).all().map((x) => [x.id, x.name]));
  const events = deps.db.select().from(attendanceEvent).where(eq(attendanceEvent.meetingId, m.id)).orderBy(asc(attendanceEvent.id)).all();
  const proxies = deps.db.select().from(delegation).where(eq(delegation.meetingId, m.id)).all();
  const votings = deps.db.select().from(voting).where(eq(voting.meetingId, m.id)).all();

  if (c.req.query("format") === "json") {
    return c.json({ meeting: m, boards: votings.filter((v) => v.board !== null).map((v) => v.board) });
  }
  const lines = [
    `# ${m.title}`,
    "",
    `- Apertura · Opened: ${time(m.openedAt)}`,
    `- Cierre · Closed: ${time(m.closedAt)}`,
    `- Convocatoria · Call: ${m.call}`,
    `- Miembros · Members: ${m.membersTotal ?? "—"}`,
    "",
    "## Asistencia · Attendance",
    "",
    "| Hora · Time | Persona · Person | Movimiento · Event | Modo · Mode |",
    "|---|---|---|---|",
    ...events.map((e) => `| ${time(e.at)} | ${names.get(e.memberId)} | ${e.kind} | ${e.mode} |`),
    "",
    "## Delegaciones · Proxy votes",
    "",
    ...proxies.map((d) => `- ${names.get(d.fromMemberId)} → ${names.get(d.toMemberId)}${d.suspendedAt === null ? "" : ` (suspendida · suspended ${time(d.suspendedAt)})`}`),
    "",
    "## Votaciones · Votings",
  ];
  for (const v of votings) {
    const rules = v.rules as { method: string; mode: string; params: unknown; timing: string };
    const quorum = v.quorum as { required: number; met: boolean; forced: { reason: string } | null } | null;
    lines.push("", `### ${v.title}`, "", `- Estado · Status: ${v.status}`, `- Método · Method: ${rules.method} (${rules.mode}, ${rules.timing})`, `- Parámetros · Parameters: \`${JSON.stringify(rules.params)}\``);
    if (quorum) lines.push(`- Quorum: ${quorum.required} (${quorum.met ? "sí · yes" : "no"})${quorum.forced ? ` — forzado · forced: ${quorum.forced.reason}` : ""}`);
    if (v.annulReason) lines.push(`- Anulada · Annulled: ${v.annulReason}`);
    if (v.board) lines.push(`- Resultado · Result: \`${JSON.stringify((v.board as { result: unknown }).result)}\``);
    if (v.drawRound !== null) lines.push(`- Sorteo · Draw: compromiso · commitment ${v.drawCommitment}, ronda drand · drand round ${v.drawRound}`);
    for (const d of deps.db.select().from(tieDraw).where(eq(tieDraw.votingId, v.id)).all()) {
      lines.push(`- Sorteo de empate · Tie draw: ronda · round ${d.round}${d.document ? `, ganadoras · winners: ${(d.document.winners as string[]).join(", ")}` : ""}`);
    }
    if (v.rollCall) {
      lines.push("", "| Persona · Person | Respuestas · Answers |", "|---|---|");
      for (const x of (v.rollCall as { votes: { member: string; right: number; answers: unknown }[] }).votes) lines.push(`| ${x.member}${x.right > 0 ? ` (${x.right})` : ""} | \`${JSON.stringify(x.answers)}\` |`);
    }
  }
  return c.body(lines.join("\n") + "\n", 200, { "content-type": "text/markdown; charset=utf-8" });
}
