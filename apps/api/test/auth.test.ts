import { describe, expect, it } from "vitest";
import { authCode } from "../src/db/schema.ts";
import { FIRST, setup } from "./helpers.ts";

describe("login by e-mail code", () => {
  it("logs in with the code and opens a 12-hour session", async () => {
    const t = setup();
    expect((await t.call("POST", "/auth/code", { email: " MESA@example.org " })).status).toBe(202);
    expect(t.mailer.sent).toHaveLength(1);
    const res = await t.call("POST", "/auth/session", { email: FIRST.email, code: t.lastCode(FIRST.email) });
    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ name: FIRST.name, official: true });
    const me = await t.call("GET", "/auth/me", undefined, res.body.token);
    expect(me.body).toMatchObject({ email: FIRST.email, official: true });
    t.clock.t += 12 * 3600_000;
    expect((await t.call("GET", "/auth/me", undefined, res.body.token)).status).toBe(401);
  });

  it("does not reveal whether an address is in the census", async () => {
    const t = setup();
    const res = await t.call("POST", "/auth/code", { email: "nobody@example.org" });
    expect(res).toEqual({ status: 202, body: { status: "sent_if_registered" } });
    expect(t.mailer.sent).toHaveLength(0);
    expect((await t.call("POST", "/auth/session", { email: "nobody@example.org", code: "12345678" })).status).toBe(401);
  });

  it("stores only a hash of the code and uses it once", async () => {
    const t = setup();
    await t.call("POST", "/auth/code", { email: FIRST.email });
    const code = t.lastCode(FIRST.email);
    const stored = t.deps.db.select().from(authCode).all();
    expect(JSON.stringify(stored)).not.toContain(code);
    expect((await t.call("POST", "/auth/session", { email: FIRST.email, code })).status).toBe(200);
    expect((await t.call("POST", "/auth/session", { email: FIRST.email, code })).status).toBe(401);
  });

  it("allows 5 attempts", async () => {
    const t = setup();
    await t.call("POST", "/auth/code", { email: FIRST.email });
    for (let i = 0; i < 5; i++) expect((await t.call("POST", "/auth/session", { email: FIRST.email, code: "00000000" })).status).toBe(401);
    expect((await t.call("POST", "/auth/session", { email: FIRST.email, code: t.lastCode(FIRST.email) })).status).toBe(401);
  });

  it("expires codes after 10 minutes", async () => {
    const t = setup();
    await t.call("POST", "/auth/code", { email: FIRST.email });
    t.clock.t += 10 * 60_000;
    expect((await t.call("POST", "/auth/session", { email: FIRST.email, code: t.lastCode(FIRST.email) })).status).toBe(401);
  });

  it("limits code requests per address", async () => {
    const t = setup();
    expect((await t.call("POST", "/auth/code", { email: FIRST.email })).status).toBe(202);
    expect((await t.call("POST", "/auth/code", { email: FIRST.email })).status).toBe(429);
    t.clock.t += 60_000;
    expect((await t.call("POST", "/auth/code", { email: FIRST.email })).status).toBe(202);
  });

  it("rejects malformed requests and missing sessions", async () => {
    const t = setup();
    expect((await t.call("POST", "/auth/code", { email: 1 })).status).toBe(400);
    expect((await t.call("POST", "/auth/session", { email: FIRST.email })).status).toBe(400);
    expect((await t.call("GET", "/auth/me")).status).toBe(401);
    expect((await t.call("GET", "/auth/me", undefined, "forged")).status).toBe(401);
    const res = await t.app.request("/auth/code", { method: "POST", body: "{", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("logs out", async () => {
    const t = setup();
    const token = await t.login(FIRST.email);
    expect((await t.call("POST", "/auth/logout", undefined, token)).status).toBe(204);
    expect((await t.call("GET", "/auth/me", undefined, token)).status).toBe(401);
  });
});

describe("assisted login", () => {
  it("gives the officials a code, records who did it and tells the person", async () => {
    const t = setup();
    const { official, byEmail } = await t.withCensus(2);
    const person = byEmail("p1@example.org");
    const res = await t.call("POST", "/auth/assisted-code", { member_id: person.id }, official);
    expect(res.status).toBe(200);
    expect(t.mailer.sent.at(-1)).toMatchObject({ to: person.email, subject: "Acceso asistido · Assisted login" });
    expect(t.mailer.sent.at(-1)!.text).not.toContain(res.body.code);
    expect(t.deps.db.select().from(authCode).all()[0]!.assistedBy).not.toBeNull();
    const session = await t.call("POST", "/auth/session", { email: person.email, code: res.body.code });
    expect(session.body.member.official).toBe(false);
    expect((await t.call("POST", "/auth/assisted-code", { member_id: person.id }, session.body.token)).status).toBe(403);
    expect((await t.call("POST", "/auth/assisted-code", { member_id: "x" }, official)).status).toBe(404);
  });
});
