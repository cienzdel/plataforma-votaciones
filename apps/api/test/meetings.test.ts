import { describe, expect, it, vi } from "vitest";
import { snapshot } from "../src/meetings.ts";
import { FIRST, setup } from "./helpers.ts";

async function openMeeting(n = 9) {
  const t = setup();
  const c = await t.withCensus(n);
  const m = (await t.call("POST", "/meetings", { title: "Ordinary meeting" }, c.official)).body;
  await t.call("POST", `/meetings/${m.id}/open`, undefined, c.official);
  const attend = (email: string, kind = "in", mode = "in_person") =>
    t.call("POST", `/meetings/${m.id}/attendance`, { member_id: c.byEmail(email).id, kind, mode }, c.official);
  const delegate = (from: string, to: string, justified: unknown = true) =>
    t.call("POST", `/meetings/${m.id}/delegations`, { from_member_id: c.byEmail(from).id, to_member_id: c.byEmail(to).id, justified }, c.official);
  return { ...t, ...c, meetingId: m.id as string, attend, delegate };
}

describe("meetings and calls", () => {
  it("freezes the members, checks quorum and allows the second call after 15 minutes", async () => {
    const t = await openMeeting(11); // 12 members: quorum 4 at first call, 3 at second
    const get = async () => (await t.call("GET", `/meetings/${t.meetingId}`, undefined, t.official)).body;
    expect((await get()).quorum).toMatchObject({ call: 1, required: 4, present: 0, met: false });
    for (const e of ["p1", "p2", "p3"]) await t.attend(`${e}@example.org`);
    expect((await get()).quorum).toMatchObject({ present: 3, met: false });

    expect((await t.call("POST", `/meetings/${t.meetingId}/second-call`, undefined, t.official)).body).toEqual({ error: "second_call_too_early" });
    t.clock.t += 15 * 60_000;
    expect((await t.call("POST", `/meetings/${t.meetingId}/second-call`, undefined, t.official)).body.call).toBe(2);
    expect((await get()).quorum).toMatchObject({ call: 2, required: 3, met: true });
    expect((await t.call("POST", `/meetings/${t.meetingId}/second-call`, undefined, t.official)).status).toBe(409);

    // Members see the summary without the attendance list.
    const person = await t.login("p1@example.org");
    const seen = (await t.call("GET", `/meetings/${t.meetingId}`, undefined, person)).body;
    expect(seen.present).toBeUndefined();
    expect(seen.quorum.met).toBe(true);
    expect((await t.call("GET", "/meetings", undefined, person)).body.meetings).toHaveLength(1);
    expect((await t.call("POST", "/meetings", { title: "x" }, person)).status).toBe(403);

    expect((await t.call("POST", `/meetings/${t.meetingId}/close`, undefined, t.official)).body.status).toBe("closed");
    expect((await t.call("POST", `/meetings/${t.meetingId}/close`, undefined, t.official)).status).toBe(409);
    expect((await t.attend("p4@example.org")).body).toEqual({ error: "not_open" });
    expect((await get()).quorum).toBeNull();
  });

  it("opens one meeting at a time", async () => {
    const t = await openMeeting();
    const other = (await t.call("POST", "/meetings", { title: "Extraordinary meeting" }, t.official)).body;
    expect((await t.call("POST", `/meetings/${other.id}/open`, undefined, t.official)).body).toEqual({ error: "another_meeting_open" });
    expect((await t.call("POST", `/meetings/${t.meetingId}/open`, undefined, t.official)).body).toEqual({ error: "not_scheduled" });
    expect((await t.call("POST", "/meetings", { title: " " }, t.official)).status).toBe(400);
    expect((await t.call("GET", "/meetings/nope", undefined, t.official)).status).toBe(404);
  });

  it("records entries and exits, in person or remote", async () => {
    const t = await openMeeting();
    expect((await t.attend("p1@example.org", "in", "remote")).status).toBe(201);
    expect((await t.attend("p1@example.org", "in")).body).toEqual({ error: "already_present" });
    expect((await t.attend("p2@example.org", "out")).body).toEqual({ error: "not_present" });
    expect((await t.attend("p1@example.org", "out")).body.present).toEqual([]);
    expect((await t.attend("p1@example.org", "sideways")).status).toBe(400);
  });
});

describe("proxy votes", () => {
  it("enforces the rules of ADR-0012", async () => {
    const t = await openMeeting();
    await t.attend("p1@example.org");
    expect((await t.delegate("p2@example.org", "p1@example.org", false)).body).toEqual({ error: "justification_required" });
    expect((await t.delegate("p2@example.org", "p2@example.org")).body).toEqual({ error: "same_person" });
    expect((await t.delegate("p1@example.org", "p2@example.org")).body).toEqual({ error: "delegator_present" });
    expect((await t.delegate("p2@example.org", "p1@example.org")).status).toBe(201);
    expect((await t.delegate("p2@example.org", "p3@example.org")).body).toEqual({ error: "already_delegated" });
    expect((await t.delegate("p4@example.org", "p2@example.org")).body).toEqual({ error: "delegate_has_delegated" });
    expect((await t.delegate("p3@example.org", "p1@example.org")).status).toBe(201);
    expect((await t.delegate("p4@example.org", "p1@example.org")).body).toEqual({ error: "proxy_limit" });
    expect((await t.delegate("p1@example.org", "p5@example.org")).body).toEqual({ error: "delegator_present" });
    await t.attend("p1@example.org", "out");
    expect((await t.delegate("p1@example.org", "p5@example.org")).body).toEqual({ error: "delegator_holds_proxies" });
  });

  it("e-mails both people and stores no reason", async () => {
    const t = await openMeeting();
    const before = t.mailer.sent.length;
    await t.delegate("p2@example.org", "p1@example.org");
    const mails = t.mailer.sent.slice(before);
    expect(mails.map((m) => m.to).sort()).toEqual(["p1@example.org", "p2@example.org"]);
    const detail = (await t.call("GET", `/meetings/${t.meetingId}`, undefined, t.official)).body;
    expect(Object.keys(detail.delegations[0]).sort()).toEqual(["createdAt", "fromMemberId", "justified", "meetingId", "suspendedAt", "toMemberId"]);
  });

  it("is suspended when the person who delegated arrives, and can be revoked", async () => {
    const t = await openMeeting();
    await t.attend("p1@example.org");
    await t.delegate("p2@example.org", "p1@example.org");
    await t.delegate("p3@example.org", "p1@example.org");
    expect(snapshot(t.deps, t.meetingId).counters).toMatchObject({ present: 1, proxies: 2, rights: 3 });

    const before = t.mailer.sent.length;
    await t.attend("p2@example.org");
    expect(t.mailer.sent.slice(before).map((m) => m.subject)).toEqual(["Delegación de voto suspendido · Proxy vote suspended", "Delegación de voto suspendido · Proxy vote suspended"]);
    expect(snapshot(t.deps, t.meetingId).counters).toMatchObject({ present: 2, proxies: 1, rights: 3 });

    const from = t.byEmail("p3@example.org").id;
    expect((await t.call("DELETE", `/meetings/${t.meetingId}/delegations/${from}`, undefined, t.official)).status).toBe(204);
    expect((await t.call("DELETE", `/meetings/${t.meetingId}/delegations/${from}`, undefined, t.official)).status).toBe(404);
    expect(snapshot(t.deps, t.meetingId).counters).toMatchObject({ present: 2, proxies: 0, rights: 2 });

    // After leaving again, the person can delegate anew.
    await t.attend("p2@example.org", "out");
    expect((await t.delegate("p2@example.org", "p1@example.org")).status).toBe(201);
  });

  it("follows the presence of the delegate and the degree of the person who delegated", async () => {
    // p1, p3, p5… are "phys"; p2, p4… are "bio"; the official is "bio".
    const t = await openMeeting();
    await t.attend(FIRST.email);
    await t.attend("p1@example.org");
    await t.delegate("p2@example.org", "p1@example.org"); // bio → phys
    await t.delegate("p3@example.org", FIRST.email); // phys → bio

    const all = snapshot(t.deps, t.meetingId);
    expect(all.counters).toEqual({ session_members: 10, session_present: 2, members: 10, present: 2, proxies: 2, rights: 4 });

    const bio = snapshot(t.deps, t.meetingId, "bio");
    expect(bio.counters).toEqual({ session_members: 10, session_present: 2, members: 5, present: 1, proxies: 1, rights: 2 });
    expect(bio.rights).toContainEqual({ memberId: t.byEmail("p1@example.org").id, own: 0, proxies: 1 });

    await t.attend("p1@example.org", "out");
    expect(snapshot(t.deps, t.meetingId, "bio").counters).toMatchObject({ proxies: 0, rights: 1 });
  });

  it("cannot be registered in a closed meeting", async () => {
    const t = await openMeeting();
    await t.call("POST", `/meetings/${t.meetingId}/close`, undefined, t.official);
    expect((await t.delegate("p2@example.org", "p1@example.org")).body).toEqual({ error: "meeting_closed" });
  });
});

describe("no logs", () => {
  it("writes nothing to the console during a full session", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k));
    const t = await openMeeting();
    await t.attend("p1@example.org");
    await t.delegate("p2@example.org", "p1@example.org");
    await t.call("GET", "/nope");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const s of spies) s.mockRestore();
  });
});
