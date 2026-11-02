/**
 * Login by one-time code sent by e-mail, assisted login and bearer sessions (ADR-0013).
 * Only hashes of codes and session tokens are stored. Attempts are limited in memory (ADR-0018).
 */
import { randomBytes, randomInt } from "node:crypto";
import { and, count, eq, isNotNull, lt } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { HttpError, sha256Hex, type Deps } from "./context.ts";
import { authCode, authSession, member, roleAssignment } from "./db/schema.ts";

export const CODE_TTL_MS = 10 * 60_000;
/** Wrong guesses allowed per request for a mailed code. */
export const CODE_ATTEMPTS = 5;
/**
 * Assisted codes are longer, so they need no attempt limit that a third party could exhaust:
 * 10^12 values against at most a few hundred thousand guesses in their 10 minutes.
 */
export const ASSISTED_CODE_DIGITS = 12;
/**
 * Login-code mails per hour for the whole census (40-60 people), so that an outsider who knows
 * addresses cannot spend the quota that result and assisted-login notices need (ADR-0014).
 */
export const CODE_MAILS_PER_HOUR = 120;
export const SESSION_TTL_MS = 12 * 3600_000;
/** Minimum time between two codes requested for the same address. */
export const CODE_INTERVAL_MS = 60_000;

export type Member = typeof member.$inferSelect;
export type AuthEnv = { Variables: { member: Member; official: boolean } };

function codeHash(memberId: string, code: string): string {
  return sha256Hex("pv/login-code", memberId, code);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** Key of a mailed code: the hash of the request id that only the asking browser holds. */
const requestKey = (request: string) => sha256Hex("pv/login-request", request);

export function isOfficial(deps: Deps, memberId: string): boolean {
  return deps.db.select().from(roleAssignment).where(eq(roleAssignment.memberId, memberId)).get() !== undefined;
}

/** Stores a fresh mailed code for the browser that holds `request`, and returns it. */
function issueMailedCode(deps: Deps, memberId: string, request: string): string {
  const code = newCode(8);
  deps.db.delete(authCode).where(lt(authCode.expiresAt, deps.now())).run();
  deps.db.insert(authCode).values({ id: requestKey(request), memberId, codeHash: codeHash(memberId, code), expiresAt: deps.now() + CODE_TTL_MS, attempts: 0, assistedBy: null }).run();
  return code;
}

/** Stores a fresh assisted code, replacing only the member's previous assisted code, and returns it. */
function issueAssistedCode(deps: Deps, memberId: string, assistedBy: string): string {
  const code = newCode(ASSISTED_CODE_DIGITS);
  deps.db.delete(authCode).where(and(eq(authCode.memberId, memberId), isNotNull(authCode.assistedBy))).run();
  deps.db.insert(authCode).values({ id: randomBytes(16).toString("hex"), memberId, codeHash: codeHash(memberId, code), expiresAt: deps.now() + CODE_TTL_MS, attempts: 0, assistedBy }).run();
  return code;
}

/** Requires a valid session; sets `member` and `official`. */
export function requireMember(deps: Deps): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const row = token
      ? deps.db.select().from(authSession).innerJoin(member, eq(member.id, authSession.memberId)).where(eq(authSession.tokenHash, sha256Hex("pv/session", token))).get()
      : undefined;
    if (row === undefined || row.auth_session.expiresAt <= deps.now() || !row.member.active) throw new HttpError(401, "unauthenticated");
    c.set("member", row.member);
    c.set("official", isOfficial(deps, row.member.id));
    await next();
  };
}

/** Requires the `mesa` role. Use after requireMember. */
export const requireOfficial: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.get("official")) throw new HttpError(403, "officials_only");
  await next();
};

export function authRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const lastRequest = new Map<string, number>();
  let mailsSent: number[] = [];

  /**
   * Always answers 202 with a fresh request id, at once, so that neither the response nor its
   * timing reveals who is in the census or whether the mail provider failed. The code only works
   * together with that request id.
   */
  app.post("/code", async (c) => {
    const { email } = await c.req.json<{ email?: unknown }>();
    if (typeof email !== "string") throw new HttpError(400, "invalid_email");
    const address = normaliseEmail(email);
    const now = deps.now();
    const last = lastRequest.get(address);
    if (last !== undefined && now - last < CODE_INTERVAL_MS) throw new HttpError(429, "too_many_requests");
    lastRequest.set(address, now);
    const request = randomBytes(24).toString("base64url");
    mailsSent = mailsSent.filter((at) => now - at < 3600_000);
    const m = deps.db.select().from(member).where(and(eq(member.email, address), eq(member.active, true))).get();
    if (m !== undefined && mailsSent.length < CODE_MAILS_PER_HOUR) {
      mailsSent.push(now);
      const code = issueMailedCode(deps, m.id, request);
      // Not awaited, and a failure is not reported: the person can ask the officials for an assisted code.
      deps.mailer
        .send({
          to: m.email,
          subject: "Código de acceso · Login code",
          text: `Tu código de acceso es ${code}. Caduca en 10 minutos.\nYour login code is ${code}. It expires in 10 minutes.\n\n${deps.webOrigin}`,
        })
        .catch(() => undefined);
    }
    return c.json({ status: "sent_if_registered", request }, 202);
  });

  app.post("/session", async (c) => {
    const { email, code, request } = await c.req.json<{ email?: unknown; code?: unknown; request?: unknown }>();
    if (typeof email !== "string" || typeof code !== "string" || (request !== undefined && typeof request !== "string")) throw new HttpError(400, "invalid_request");
    const entered = code.replace(/\s/g, "");
    const m = deps.db.select().from(member).where(and(eq(member.email, normaliseEmail(email)), eq(member.active, true))).get();
    if (!m) throw new HttpError(401, "invalid_code");
    if (entered.length === ASSISTED_CODE_DIGITS) {
      // Assisted: no attempt limit, so guesses by others cannot lock the person out.
      const row = deps.db.select().from(authCode).where(and(eq(authCode.memberId, m.id), isNotNull(authCode.assistedBy), eq(authCode.codeHash, codeHash(m.id, entered)))).get();
      if (!row || row.expiresAt <= deps.now()) throw new HttpError(401, "invalid_code");
    } else {
      // Mailed: only with the request id of the browser that asked, whose attempts are its own.
      const row = typeof request === "string" ? deps.db.select().from(authCode).where(eq(authCode.id, requestKey(request))).get() : undefined;
      if (!row || row.memberId !== m.id || row.assistedBy !== null || row.expiresAt <= deps.now() || row.attempts >= CODE_ATTEMPTS) throw new HttpError(401, "invalid_code");
      if (row.codeHash !== codeHash(m.id, entered)) {
        deps.db.update(authCode).set({ attempts: row.attempts + 1 }).where(eq(authCode.id, row.id)).run();
        throw new HttpError(401, "invalid_code");
      }
    }
    deps.db.delete(authCode).where(eq(authCode.memberId, m.id)).run();
    deps.db.delete(authSession).where(lt(authSession.expiresAt, deps.now())).run();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = deps.now() + SESSION_TTL_MS;
    deps.db.insert(authSession).values({ tokenHash: sha256Hex("pv/session", token), memberId: m.id, expiresAt }).run();
    return c.json({ token, expires_at: expiresAt, member: { id: m.id, name: m.name, official: isOfficial(deps, m.id) } });
  });

  app.post("/logout", requireMember(deps), (c) => {
    const token = c.req.header("authorization")!.slice(7);
    deps.db.delete(authSession).where(eq(authSession.tokenHash, sha256Hex("pv/session", token))).run();
    return c.body(null, 204);
  });

  app.get("/me", requireMember(deps), (c) => {
    const m = c.get("member");
    return c.json({ id: m.id, name: m.name, email: m.email, degrees: m.degrees, official: c.get("official") });
  });

  /**
   * Assisted login: an official checks the person's identity face to face and gets a code to give
   * them. It is recorded with `assisted_by`, and the person is told by e-mail.
   */
  app.post("/assisted-code", requireMember(deps), requireOfficial, async (c) => {
    const { member_id } = await c.req.json<{ member_id?: unknown }>();
    const m = typeof member_id === "string" ? deps.db.select().from(member).where(eq(member.id, member_id)).get() : undefined;
    if (m === undefined || !m.active) throw new HttpError(404, "member_not_found");
    const code = issueAssistedCode(deps, m.id, c.get("member").id);
    await deps.mailer.send({
      to: m.email,
      subject: "Acceso asistido · Assisted login",
      text: "La mesa ha generado un código de acceso para ti tras comprobar tu identidad. Si no has sido tú, avisa a la mesa.\nThe officials generated a login code for you after checking your identity. If this was not you, tell the officials.",
    });
    return c.json({ code, expires_at: deps.now() + CODE_TTL_MS });
  });

  return app;
}

/** Number of members with the `mesa` role. */
export function officialsCount(deps: Deps): number {
  return deps.db.select({ n: count() }).from(roleAssignment).get()!.n;
}
