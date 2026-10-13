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

// --- Milestone H6: secret votings (PLAN/PLAN.md §5.1, spec/protocol.md)

export const voting = sqliteTable("voting", {
  /** 16 random bytes as hex (spec/formats.md §1.4). */
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => meeting.id),
  title: text("title").notNull(),
  /** `awaiting_draw`: closed to votes, waiting for the drand round and the seed (spec/draws.md §5). */
  status: text("status", { enum: ["created", "awaiting_pages", "open", "awaiting_draw", "closed", "annulled"] }).notNull(),
  /** Effective rules (spec/formats.md §4) and their hash. */
  rules: text("rules", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  rulesHash: text("rules_hash").notNull(),
  /** Candidates table (spec/formats.md §6), or null for yes/no. */
  candidates: text("candidates", { mode: "json" }).$type<Record<string, unknown> | null>(),
  /** Fixed closing time of a final-link voting, Unix ms. */
  closesAt: integer("closes_at"),
  openedAt: integer("opened_at"),
  closedAt: integer("closed_at"),
  /** Board counters fixed at opening, as JSON. */
  snapshotCounters: text("snapshot_counters", { mode: "json" }).$type<Record<string, number>>(),
  quorum: text("quorum", { mode: "json" }).$type<Record<string, unknown>>(),
  /** Published documents, kept as served. */
  opening: text("opening", { mode: "json" }).$type<Record<string, unknown>>(),
  board: text("board", { mode: "json" }).$type<Record<string, unknown>>(),
  annulReason: text("annul_reason"),
  /** Set when the board is in the data repository; ballots are erased only after that. */
  publishedAt: integer("published_at"),
  /** Tie-break draw: commitment of the officials' seed and the drand round, fixed in public in advance. */
  drawCommitment: text("draw_commitment"),
  drawRound: integer("draw_round"),
  /** `manual` and `paper`: tallies and number of ballots entered by the officials. */
  manualTallies: text("manual_tallies", { mode: "json" }).$type<Record<string, Record<string, number>>>(),
  manualReceived: integer("manual_received"),
  /** `roll_call`: the roll-call list (spec/formats.md §7), fixed at closing. */
  rollCall: text("roll_call", { mode: "json" }).$type<Record<string, unknown>>(),
});

/** Named votes of `roll_call` votings, one per right. Public by nature; retained like personal data. */
export const nominalVote = sqliteTable(
  "nominal_vote",
  {
    votingId: text("voting_id").notNull().references(() => voting.id),
    memberId: text("member_id").notNull().references(() => member.id),
    right: integer("right").notNull(),
    answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.votingId, t.memberId, t.right] })],
);

/** Stand-alone draws for in-room ties (spec/draws.md §6). */
export const tieDraw = sqliteTable("tie_draw", {
  id: text("id").primaryKey(),
  votingId: text("voting_id").notNull().references(() => voting.id),
  commitment: text("commitment").notNull(),
  /** RFC 3339 time of the commitment; the round is the first 30 s after it. */
  after: text("after").notNull(),
  round: integer("round").notNull(),
  items: text("items", { mode: "json" }).$type<string[]>().notNull(),
  spots: integer("spots").notNull(),
  document: text("document", { mode: "json" }).$type<Record<string, unknown>>(),
  publishedAt: integer("published_at"),
});

/** Assent by e-mail (spec/methods.md §7, spec/formats.md §8). */
export const assent = sqliteTable("assent", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  electorateFilter: text("electorate_filter"),
  members: integer("members").notNull(),
  sentAt: integer("sent_at").notNull(),
  closesAt: integer("closes_at").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull(),
  record: text("record", { mode: "json" }).$type<Record<string, unknown>>(),
  publishedAt: integer("published_at"),
});

export const assentObjection = sqliteTable(
  "assent_objection",
  {
    assentId: text("assent_id").notNull().references(() => assent.id),
    memberId: text("member_id").notNull().references(() => member.id),
    at: integer("at").notNull(),
    withdrawnAt: integer("withdrawn_at"),
  },
  (t) => [primaryKey({ columns: [t.assentId, t.memberId] })],
);

/** Voting rights frozen at opening: `own` (0 or 1) plus proxies. */
export const electorateSnapshot = sqliteTable(
  "electorate_snapshot",
  {
    votingId: text("voting_id").notNull().references(() => voting.id),
    memberId: text("member_id").notNull().references(() => member.id),
    rights: integer("rights").notNull(),
  },
  (t) => [primaryKey({ columns: [t.votingId, t.memberId] })],
);

/** One per (voting, member, right). Stores the blinded message hash, never the token. */
export const issuance = sqliteTable(
  "issuance",
  {
    votingId: text("voting_id").notNull().references(() => voting.id),
    memberId: text("member_id").notNull().references(() => member.id),
    right: integer("right").notNull(),
    blindedHash: text("blinded_hash").notNull(),
    blindSig: text("blind_sig").notNull(),
  },
  (t) => [primaryKey({ columns: [t.votingId, t.memberId, t.right] })],
);

/** One key per voting. The private key is encrypted with the master key and deleted at closing. */
export const signingKey = sqliteTable("signing_key", {
  votingId: text("voting_id").primaryKey().references(() => voting.id),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key"),
  destroyedAt: integer("destroyed_at"),
});

/**
 * Received ballots. No time, no order: the token is the primary key and the table is created
 * WITHOUT ROWID by the migration (ADR-0018). Deleted when the board is published.
 */
export const ballotReceived = sqliteTable("ballot_received", {
  token: text("token").primaryKey(),
  votingId: text("voting_id").notNull(),
  sig: text("sig").notNull(),
  s: text("s").notNull(),
  answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull(),
});

/** Spent tokens, kept for good (they are also on the board). WITHOUT ROWID, no time. */
export const spentToken = sqliteTable("spent_token", {
  token: text("token").primaryKey(),
  votingId: text("voting_id").notNull(),
});

/** The hash chain of the body (spec/formats.md §9). `seq` orders documents, not votes. */
export const chainRecord = sqliteTable("chain_record", {
  seq: integer("seq").primaryKey(),
  board: text("board").notNull(),
  prev: text("prev").notNull(),
  recordHash: text("record_hash").notNull(),
  path: text("path").notNull(),
});
