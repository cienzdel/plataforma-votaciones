import { describe, expect, it } from "vitest";
import { gmailMailer, smtpMailer } from "../src/mail/index.ts";
import { parseProfile } from "../src/profile.ts";
import { PROFILE } from "./helpers.ts";

describe("Gmail adapter", () => {
  it("refreshes the OAuth token once and sends a raw RFC 5322 message", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }));
      return new Response("{}");
    }) as typeof fetch;
    const mailer = gmailMailer({ clientId: "id", clientSecret: "secret", refreshToken: "rt", from: "Mesa <mesa@example.org>" }, fakeFetch);
    await mailer.send({ to: "p1@example.org", subject: "Código · Code", text: "Hola ñ" });
    await mailer.send({ to: "p2@example.org", subject: "Second", text: "x" });

    expect(calls.map((c) => new URL(c.url).host)).toEqual(["oauth2.googleapis.com", "gmail.googleapis.com", "gmail.googleapis.com"]);
    expect(String(calls[0]!.init.body)).toContain("grant_type=refresh_token");
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer at-1");
    const raw = Buffer.from(JSON.parse(String(calls[1]!.init.body)).raw, "base64url").toString("utf8");
    expect(raw).toContain("To: p1@example.org");
    expect(raw).toMatch(/Subject: =\?UTF-8\?/);
  });

  it("fails loudly when Google rejects the request", async () => {
    const denied = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const mailer = gmailMailer({ clientId: "id", clientSecret: "s", refreshToken: "rt", from: "m@example.org" }, denied);
    await expect(mailer.send({ to: "p1@example.org", subject: "s", text: "t" })).rejects.toThrow("gmail token request failed: 401");
  });
});

describe("profile", () => {
  it("accepts the example profile and names the first invalid member", () => {
    expect(parseProfile(PROFILE).id).toBe("example");
    expect(() => parseProfile({ ...PROFILE, quorum: [[2, 1]] })).toThrow("invalid profile member: quorum");
    expect(() => parseProfile({ ...PROFILE, degrees: [{ id: "Bio", name: "x" }] })).toThrow("degrees");
    expect(() => parseProfile(null)).toThrow("type");
  });
});

describe("directory mailer", () => {
  it("writes one JSON file per message", async () => {
    const { mkdtempSync, readdirSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DirectoryMailer } = await import("../src/mail/index.ts");
    const dir = mkdtempSync(join(tmpdir(), "pv-mail-"));
    await new DirectoryMailer(dir).send({ to: "p1@example.org", subject: "s", text: "t" });
    const files = readdirSync(dir);
    expect(JSON.parse(readFileSync(join(dir, files[0]!), "utf8"))).toEqual({ to: "p1@example.org", subject: "s", text: "t" });
    rmSync(dir, { recursive: true });
  });
});

describe("SMTP transport security", () => {
  it("refuses to authenticate when the server does not offer STARTTLS", async () => {
    const { createServer } = await import("node:net");
    const lines: string[] = [];
    const server = createServer((socket) => {
      socket.write("220 fake ESMTP\r\n");
      socket.on("data", (d) => {
        for (const line of d.toString().split("\r\n").filter(Boolean)) {
          lines.push(line);
          if (/^EHLO/i.test(line)) socket.write("250-fake\r\n250 AUTH PLAIN\r\n");
          else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
          else socket.write("250 ok\r\n");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const mailer = smtpMailer({ host: "127.0.0.1", port, user: "u", password: "secret-password", from: "a@example.org" });
      await expect(mailer.send({ to: "b@example.org", subject: "Code", text: "12345678" })).rejects.toThrow();
      expect(lines.join("\n")).not.toMatch(/AUTH|12345678/);
    } finally {
      server.close();
    }
  });
});
