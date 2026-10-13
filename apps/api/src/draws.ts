/**
 * In-room ties (spec/draws.md §6): when a `single_winner` voting ends in `draw_required`, the
 * officials commit to a seed, the projection screen shows the commitment and the drand round about
 * 30 s later, and the draw is computed once that round exists.
 */
import { formatTimestamp, isHex, roundAt } from "@pv/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireMember, requireOfficial, type AuthEnv } from "./auth.ts";
import { appendToChain, chainFile, datePath } from "./chain.ts";
import { HttpError, newId, type Deps } from "./context.ts";
import { tieDraw } from "./db/schema.ts";
import { jsonFile } from "./publisher.ts";
import { drawDocument, getVoting, LIVE_DRAW_DELAY_S } from "./votings.ts";

export type TieDraw = typeof tieDraw.$inferSelect;

export function drawRoutes(deps: Deps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(requireMember(deps));

  app.get("/", (c) => c.json({ draws: deps.db.select().from(tieDraw).where(eq(tieDraw.votingId, c.req.query("voting_id") ?? "")).all() }));

  app.use("*", requireOfficial);

  /** Fixes the commitment and the round in public, before the round exists. */
  app.post("/", async (c) => {
    const { voting_id, commitment } = await c.req.json<{ voting_id?: unknown; commitment?: unknown }>();
    const v = getVoting(deps, String(voting_id));
    const result = v.board?.result as { outcome?: string; tied?: string[]; spots?: number } | null | undefined;
    if (result?.outcome !== "draw_required") throw new HttpError(409, "no_tie_to_draw");
    if (!isHex(commitment, 32)) throw new HttpError(400, "invalid_commitment");
    if (deps.db.select().from(tieDraw).where(eq(tieDraw.votingId, v.id)).get()) throw new HttpError(409, "draw_exists");
    const after = Math.floor(deps.now() / 1000);
    const row: TieDraw = {
      id: newId(), votingId: v.id, commitment, after: formatTimestamp(after * 1000), round: roundAt(after + LIVE_DRAW_DELAY_S),
      items: result.tied!, spots: result.spots!, document: null, publishedAt: null,
    };
    deps.db.insert(tieDraw).values(row).run();
    return c.json(row, 201);
  });

  /** Reveals the seed, computes the draw, chains and publishes it. */
  app.post("/:id/reveal", async (c) => {
    const d = deps.db.select().from(tieDraw).where(eq(tieDraw.id, c.req.param("id"))).get();
    if (d === undefined) throw new HttpError(404, "draw_not_found");
    if (d.document !== null) throw new HttpError(409, "already_revealed");
    const { seed } = await c.req.json<{ seed?: unknown }>();
    const base = await drawDocument(deps, { votingId: d.votingId, commitment: d.commitment, round: d.round, seed: seed as string, items: d.items });
    const document = { ...base, purpose: "tie", round_rule: { after: d.after, delay_seconds: LIVE_DRAW_DELAY_S }, spots: d.spots, winners: (base.order as string[]).slice(0, d.spots) };
    const path = `${datePath(Date.parse(d.after))}/${d.votingId}.tie.draw.json`;
    deps.db.transaction((tx) => {
      appendToChain(tx, document, path);
      tx.update(tieDraw).set({ document }).where(eq(tieDraw.id, d.id)).run();
    });
    await deps.publisher.publish([jsonFile(path, document), chainFile(deps)], `Tie draw for voting ${d.votingId}`);
    deps.db.update(tieDraw).set({ publishedAt: deps.now() }).where(eq(tieDraw.id, d.id)).run();
    return c.json(deps.db.select().from(tieDraw).where(eq(tieDraw.id, d.id)).get());
  });

  return app;
}
