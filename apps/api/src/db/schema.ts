/**
 * Tables of milestone H5 (PLAN/PLAN.md §5.1): census, roles, login, meetings, attendance and
 * proxies. Every table here holds personal data with the retention of the census, except `meeting`.
 * Times are Unix milliseconds.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const member = sqliteTable("member", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** Degree ids of the profile, as a JSON array. */
  degrees: text("degrees", { mode: "json" }).$type<string[]>().notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
});

/** Internal record of census changes: who, what and when. */
export const censusChange = sqliteTable("census_change", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: text("member_id").notNull().references(() => member.id),
  change: text("change", { enum: ["added", "updated", "deactivated", "reactivated"] }).notNull(),
  byMemberId: text("by_member_id").references(() => member.id),
  reason: text("reason"),
  at: integer("at").notNull(),
});

/** The `mesa` role. `alias` is the public name of the position (e.g. "Secretaría"). */
export const roleAssignment = sqliteTable("role_assignment", {
  memberId: text("member_id").primaryKey().references(() => member.id),
  alias: text("alias").notNull(),
  byMemberId: text("by_member_id").references(() => member.id),
  at: integer("at").notNull(),
});

/** Public log of role changes, by alias only. */
export const roleLog = sqliteTable("role_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alias: text("alias").notNull(),
  change: text("change", { enum: ["assigned", "removed"] }).notNull(),
  at: integer("at").notNull(),
});

/** One-time login codes; only a hash is kept. Deleted when used or expired. */
export const authCode = sqliteTable("auth_code", {
  memberId: text("member_id").primaryKey().references(() => member.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull(),
  assistedBy: text("assisted_by").references(() => member.id),
});

/** Login sessions; only a hash of the bearer token is kept. */
export const authSession = sqliteTable("auth_session", {
  tokenHash: text("token_hash").primaryKey(),
  memberId: text("member_id").notNull().references(() => member.id),
  expiresAt: integer("expires_at").notNull(),
});

/** A plenary session ("sesión"); called meeting in code to avoid confusion with login sessions. */
export const meeting = sqliteTable("meeting", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status", { enum: ["scheduled", "open", "closed"] }).notNull(),
  /** 1 or 2: the call in force (convocatoria). */
  call: integer("call").notNull(),
  openedAt: integer("opened_at"),
  closedAt: integer("closed_at"),
  /** Active members when the meeting opened (frozen). */
  membersTotal: integer("members_total"),
});

export const attendanceEvent = sqliteTable(
  "attendance_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    meetingId: text("meeting_id").notNull().references(() => meeting.id),
    memberId: text("member_id").notNull().references(() => member.id),
    kind: text("kind", { enum: ["in", "out"] }).notNull(),
    mode: text("mode", { enum: ["in_person", "remote"] }).notNull(),
    at: integer("at").notNull(),
    byMemberId: text("by_member_id").notNull().references(() => member.id),
  },
  (t) => [index("attendance_meeting").on(t.meetingId, t.memberId)],
);

/** Proxy votes. Only "justified: yes" is recorded, never the reason (ADR-0012). */
export const delegation = sqliteTable(
  "delegation",
  {
    meetingId: text("meeting_id").notNull().references(() => meeting.id),
    fromMemberId: text("from_member_id").notNull().references(() => member.id),
    toMemberId: text("to_member_id").notNull().references(() => member.id),
    justified: integer("justified", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
    /** Set when the person who delegated arrives or the officials revoke it. */
    suspendedAt: integer("suspended_at"),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.fromMemberId] })],
);
