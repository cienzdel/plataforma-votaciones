import { describe, expect, it } from "vitest";
import { parseCsv, readCensus } from "../src/census.ts";
import { censusChange, meeting } from "../src/db/schema.ts";
import { census, FIRST, setup } from "./helpers.ts";

describe("CSV", () => {
  it("parses quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b ""c"", d"\r\n1,2\n')).toEqual([
      ["a", 'b "c", d'],
      ["1", "2"],
    ]);
    expect(() => parseCsv('a,"b')).toThrow();
  });

  it("validates the census rows", () => {
    const degrees = ["bio", "phys"];
    expect(readCensus("﻿name,email,degrees\nAna Ejemplo,ANA@example.org,bio;phys\n", degrees)).toEqual([
      { name: "Ana Ejemplo", email: "ana@example.org", degrees: ["bio", "phys"] },
    ]);
    expect(() => readCensus("nombre,correo\n", degrees)).toThrow("csv_header");
    expect(() => readCensus("name,email,degrees\nAna,ana@example.org,chem\n", degrees)).toThrow("csv_row_2");
    expect(() => readCensus("name,email,degrees\nAna,a@example.org,\nBea,A@example.org,\n", degrees)).toThrow("csv_row_3");
    expect(() => readCensus("name,email,degrees\nAna,not-an-address,\n", degrees)).toThrow("csv_row_2");
  });
});

describe("census import", () => {
  it("adds, updates and deactivates, recording every change", async () => {
    const t = setup();
    const official = await t.login(FIRST.email);
    const first = await t.call("POST", "/census/import", { csv: census(3) }, official);
    expect(first.body).toEqual({ dry_run: false, added: 3, updated: 1, deactivated: 0 });

    const csv = ["name,email,degrees", `${FIRST.name},${FIRST.email},bio`, "Persona Uno Renamed,p1@example.org,bio", "Persona 2,p2@example.org,bio", "Persona 4,p4@example.org,"].join("\n");
    expect((await t.call("POST", "/census/import", { csv, dry_run: true }, official)).body).toEqual({ dry_run: true, added: 1, updated: 1, deactivated: 1 });
    expect((await t.call("POST", "/census/import", { csv }, official)).body).toEqual({ dry_run: false, added: 1, updated: 1, deactivated: 1 });
    const members = (await t.call("GET", "/census", undefined, official)).body.members;
    expect(members.find((m: { email: string }) => m.email === "p3@example.org").active).toBe(false);
    expect(t.deps.db.select().from(censusChange).all().map((c) => c.change)).toContain("deactivated");

    // A deactivated member cannot log in.
    t.clock.t += 61_000;
    await t.call("POST", "/auth/code", { email: "p3@example.org" });
    expect(t.mailer.sent.some((m) => m.to === "p3@example.org")).toBe(false);

    // Reactivation.
    await t.call("POST", "/census/import", { csv: census(3) }, official);
    expect(t.deps.db.select().from(censusChange).all().map((c) => c.change)).toContain("reactivated");
  });

  it("refuses to deactivate an official", async () => {
    const t = setup();
    const official = await t.login(FIRST.email);
    const res = await t.call("POST", "/census/import", { csv: "name,email,degrees\nPersona 1,p1@example.org,bio" }, official);
    expect(res).toEqual({ status: 409, body: { error: "would_deactivate_official" } });
  });

  it("requires a reason while a meeting is open and updates its frozen total", async () => {
    const t = setup();
    const { official } = await t.withCensus(5);
    const m = (await t.call("POST", "/meetings", { title: "Ordinary meeting" }, official)).body;
    await t.call("POST", `/meetings/${m.id}/open`, undefined, official);
    expect(t.deps.db.select().from(meeting).get()!.membersTotal).toBe(6);
    expect((await t.call("POST", "/census/import", { csv: census(6) }, official)).body).toEqual({ error: "meeting_open_reason_required" });
    expect((await t.call("POST", "/census/import", { csv: census(5) }, official)).body.dry_run).toBe(false);
    expect((await t.call("POST", "/census/import", { csv: census(6), reason: "Late registration approved by the body" }, official)).status).toBe(200);
    expect(t.deps.db.select().from(meeting).get()!.membersTotal).toBe(7);
  });

  it("is only for officials", async () => {
    const t = setup();
    await t.withCensus(1);
    const person = await t.login("p1@example.org");
    expect((await t.call("GET", "/census", undefined, person)).status).toBe(403);
    expect((await t.call("POST", "/census/import", { csv: 1 }, await t.login(FIRST.email))).status).toBe(400);
  });
});

describe("roles", () => {
  it("allows 1 to 3 officials and publishes only aliases", async () => {
    const t = setup();
    const { official, byEmail } = await t.withCensus(4);
    for (const [i, alias] of ["Presidencia", "Vicesecretaría"].entries()) {
      expect((await t.call("POST", "/roles", { member_id: byEmail(`p${i + 1}@example.org`).id, alias }, official)).status).toBe(201);
    }
    expect((await t.call("POST", "/roles", { member_id: byEmail("p3@example.org").id, alias: "Extra" }, official)).body).toEqual({ error: "too_many_officials" });
    expect((await t.call("POST", "/roles", { member_id: byEmail("p1@example.org").id, alias: "Again" }, official)).body).toEqual({ error: "already_official" });
    expect((await t.call("POST", "/roles", { member_id: "nobody", alias: "X" }, official)).status).toBe(404);
    expect((await t.call("POST", "/roles", { member_id: "nobody", alias: " " }, official)).status).toBe(400);
    expect((await t.call("GET", "/roles", undefined, official)).body.officials).toHaveLength(3);

    const second = await t.login("p1@example.org");
    expect((await t.call("DELETE", `/roles/${byEmail("p2@example.org").id}`, undefined, second)).status).toBe(204);
    expect((await t.call("DELETE", `/roles/${byEmail("p2@example.org").id}`, undefined, second)).status).toBe(404);
    expect((await t.call("DELETE", `/roles/${byEmail(FIRST.email).id}`, undefined, second)).status).toBe(204);
    expect((await t.call("DELETE", `/roles/${byEmail("p1@example.org").id}`, undefined, second)).body).toEqual({ error: "last_official" });

    const log = (await t.call("GET", "/roles/log")).body.log;
    expect(log.map((l: { alias: string; change: string }) => `${l.change}:${l.alias}`)).toEqual([
      "assigned:Mesa",
      "assigned:Presidencia",
      "assigned:Vicesecretaría",
      "removed:Vicesecretaría",
      "removed:Mesa",
    ]);
    expect(JSON.stringify(log)).not.toContain("Persona");
  });
});
