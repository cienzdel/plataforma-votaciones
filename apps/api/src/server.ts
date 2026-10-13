/**
 * Entry point. Configuration comes only from environment variables:
 *
 * - PV_DB: SQLite file. PV_PROFILE: profile JSON. PV_WEB_ORIGIN: URL of the web client.
 * - PV_FIRST_OFFICIAL_EMAIL, PV_FIRST_OFFICIAL_NAME: first `mesa` member (ADR-0025).
 * - PV_MAIL: `smtp`, `gmail` or `memory` (development only), and for each:
 *   PV_SMTP_HOST, PV_SMTP_PORT, PV_SMTP_USER, PV_SMTP_PASSWORD, PV_MAIL_FROM;
 *   PV_GMAIL_CLIENT_ID, PV_GMAIL_CLIENT_SECRET, PV_GMAIL_REFRESH_TOKEN, PV_MAIL_FROM.
 * - PV_MASTER_KEY: 32 bytes in hex; encrypts the voting private keys at rest.
 * - PV_PUBLISH: `github` (PV_GITHUB_REPOSITORY, PV_GITHUB_BRANCH, PV_GITHUB_TOKEN, PV_PAGES_URL) or
 *   `directory` (PV_PUBLISH_DIR, development only).
 * - PV_PORT: session API port (default 8080). PV_RECEPTION_PORT: reception port (default 8081),
 *   served on its own subdomain by the proxy.
 */
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { ensureFirstOfficial } from "./census.ts";
import { openDb } from "./db/index.ts";
import { masterKey } from "./keys.ts";
import { gmailMailer, MemoryMailer, smtpMailer, type Mailer } from "./mail/index.ts";
import { parseProfile } from "./profile.ts";
import { DirectoryPublisher, GitHubPublisher, type Publisher } from "./publisher.ts";
import { receptionApp } from "./reception.ts";
import { closeDue } from "./votings.ts";

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error("missing environment variable " + name);
  return value;
}

function mailer(): Mailer {
  switch (env("PV_MAIL")) {
    case "smtp":
      return smtpMailer({ host: env("PV_SMTP_HOST"), port: Number(env("PV_SMTP_PORT")), user: env("PV_SMTP_USER"), password: env("PV_SMTP_PASSWORD"), from: env("PV_MAIL_FROM") });
    case "gmail":
      return gmailMailer({ clientId: env("PV_GMAIL_CLIENT_ID"), clientSecret: env("PV_GMAIL_CLIENT_SECRET"), refreshToken: env("PV_GMAIL_REFRESH_TOKEN"), from: env("PV_MAIL_FROM") });
    case "memory":
      return new MemoryMailer();
    default:
      throw new Error("PV_MAIL must be smtp, gmail or memory");
  }
}

function publisher(): Publisher {
  switch (env("PV_PUBLISH")) {
    case "github":
      return new GitHubPublisher({ repository: env("PV_GITHUB_REPOSITORY"), branch: env("PV_GITHUB_BRANCH"), token: env("PV_GITHUB_TOKEN"), pagesUrl: env("PV_PAGES_URL") });
    case "directory":
      return new DirectoryPublisher(env("PV_PUBLISH_DIR"));
    default:
      throw new Error("PV_PUBLISH must be github or directory");
  }
}

const deps = {
  db: openDb(env("PV_DB")),
  mailer: mailer(),
  profile: parseProfile(JSON.parse(readFileSync(env("PV_PROFILE"), "utf8"))),
  now: Date.now,
  webOrigin: env("PV_WEB_ORIGIN"),
  publisher: publisher(),
  masterKey: masterKey(env("PV_MASTER_KEY")),
};
ensureFirstOfficial(deps, { email: env("PV_FIRST_OFFICIAL_EMAIL"), name: env("PV_FIRST_OFFICIAL_NAME") });
serve({ fetch: createApp(deps).fetch, port: Number(process.env.PV_PORT ?? 8080) });
serve({ fetch: receptionApp(deps).fetch, port: Number(process.env.PV_RECEPTION_PORT ?? 8081) });

// Final-link votings close on their own at the fixed time.
let closing = false;
setInterval(() => {
  if (closing) return;
  closing = true;
  closeDue(deps)
    .catch((e: Error) => console.error("scheduled closing failed:", e.name))
    .finally(() => (closing = false));
}, 5_000);
