/**
 * Vote reception (spec/protocol.md §6, ADR-0004, ADR-0018). Served on its own origin. It accepts
 * no session and no cookies, sets none, logs nothing and stores no time or arrival order: the
 * ballot and the spent token are keyed by the token in WITHOUT ROWID tables.
 */
import { fromHex, importVotingKey, validAnswers, verifySignature, voteAck, type Method, type Vote } from "@pv/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HttpError, type Deps } from "./context.ts";
import { ballotReceived, signingKey, spentToken, voting } from "./db/schema.ts";

const HEX = /^[0-9a-f]*$/;
const isHex = (v: unknown, bytes: number): v is string => typeof v === "string" && v.length === 2 * bytes && HEX.test(v);

/** The vote object exactly as hashed for the acknowledgement. */
function voteObject(b: Record<string, unknown>): Vote {
  return { answers: b.answers as Record<string, string>, s: b.s as string, sig: b.sig as string, token: b.token as string, voting_id: b.voting_id as string };
}

export function receptionApp(deps: Deps): Hono {
  const app = new Hono();
  app.use(cors({ origin: deps.webOrigin, allowHeaders: ["content-type"], allowMethods: ["POST"], credentials: false }));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: "invalid_json" }, 400);
    return c.json({ error: "internal" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.post("/cast", async (c) => {
    // The service must not be able to link a ballot to a session (spec/protocol.md §6).
    if (c.req.header("authorization") !== undefined || c.req.header("cookie") !== undefined) throw new HttpError(400, "session_not_accepted");
    const b = await c.req.json<Record<string, unknown>>();
    if (typeof b !== "object" || b === null || Object.keys(b).sort().join() !== "answers,s,sig,token,voting_id") throw new HttpError(400, "invalid_vote");

    // 1. The voting exists, is open and is secret.
    const v = typeof b.voting_id === "string" ? deps.db.select().from(voting).where(eq(voting.id, b.voting_id)).get() : undefined;
    if (v === undefined) throw new HttpError(404, "voting_not_found");
    if (v.status !== "open" || (v.rules as { mode: string }).mode !== "secret") throw new HttpError(409, "voting_not_open");
    // 2. Token of this voting. 3. Valid signature. 4. Ballot secret.
    if (!isHex(b.token, 80) || b.token.slice(64, 96) !== v.id) throw new HttpError(400, "invalid_token");
    const key = deps.db.select().from(signingKey).where(eq(signingKey.votingId, v.id)).get()!;
    const cryptoKey = (await importVotingKey(key.publicKey))!;
    if (!isHex(b.sig, 384) || !(await verifySignature(cryptoKey, fromHex(b.token), fromHex(b.sig)))) throw new HttpError(400, "invalid_signature");
    if (!isHex(b.s, 32)) throw new HttpError(400, "invalid_secret");
    // 5. Complete ballot with allowed values.
    const rules = v.rules as { method: Method; params: Record<string, unknown> };
    if (typeof b.answers !== "object" || b.answers === null || !validAnswers(rules.method, rules.params, b.answers as Record<string, unknown>)) {
      throw new HttpError(400, "invalid_answers");
    }
    const vote = voteObject(b);
    const ack = voteAck(vote);

    // 6. Spent token: idempotent for the identical vote, rejected otherwise.
    const stored = deps.db.select().from(ballotReceived).where(eq(ballotReceived.token, vote.token)).get();
    if (stored !== undefined) {
      const same = voteAck({ answers: stored.answers, s: stored.s, sig: stored.sig, token: stored.token, voting_id: stored.votingId }) === ack;
      if (!same) throw new HttpError(409, "token_spent");
      return c.json({ ack });
    }
    if (deps.db.select().from(spentToken).where(eq(spentToken.token, vote.token)).get() !== undefined) throw new HttpError(409, "token_spent");

    // 7. Store without time or order.
    deps.db.transaction((tx) => {
      tx.insert(ballotReceived).values({ token: vote.token, votingId: v.id, sig: vote.sig, s: vote.s, answers: vote.answers }).run();
      tx.insert(spentToken).values({ token: vote.token, votingId: v.id }).run();
    });
    return c.json({ ack });
  });

  return app;
}
