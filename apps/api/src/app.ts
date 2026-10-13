import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./auth.ts";
import { censusRoutes, roleRoutes } from "./census.ts";
import { HttpError, type Deps } from "./context.ts";
import { meetingRoutes } from "./meetings.ts";
import { votingRoutes } from "./votings.ts";

/**
 * The session API. There is no request logger: no IP, user agent, header or time is recorded
 * (ADR-0018). Errors are answered with a code and never logged with identifiers.
 */
export function createApp(deps: Deps): Hono {
  const app = new Hono();
  app.use(cors({ origin: deps.webOrigin, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "DELETE"] }));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: "invalid_json" }, 400);
    console.error("internal error:", err.name);
    return c.json({ error: "internal" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/auth", authRoutes(deps));
  app.route("/census", censusRoutes(deps));
  app.route("/roles", roleRoutes(deps));
  app.route("/meetings", meetingRoutes(deps));
  app.route("/votings", votingRoutes(deps));
  return app;
}
