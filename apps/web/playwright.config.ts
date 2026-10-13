/**
 * Browser tests: the API (session and reception), with a fresh database, e-mails written to a
 * folder and publication to a folder, plus the built web client. Fictitious data only.
 */
import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const work = process.env.PV_E2E_DIR ?? mkdtempSync(join(tmpdir(), "pv-e2e-"));
process.env.PV_E2E_DIR = work;

const apiEnv = {
  PV_DB: join(work, "e2e.db"),
  PV_PROFILE: "../../profiles/example.json",
  PV_WEB_ORIGIN: "http://localhost:4173",
  PV_FIRST_OFFICIAL_EMAIL: "mesa@example.org",
  PV_FIRST_OFFICIAL_NAME: "Persona Mesa",
  PV_MAIL: "directory",
  PV_MAIL_DIR: join(work, "mail"),
  PV_MASTER_KEY: "07".repeat(32),
  PV_PUBLISH: "directory",
  PV_PUBLISH_DIR: join(work, "data"),
  PV_PORT: "8080",
  PV_RECEPTION_PORT: "8081",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:4173", locale: "es-ES" },
  webServer: [
    { command: "node src/server.ts", cwd: "../api", env: apiEnv, url: "http://localhost:8080/health", reuseExistingServer: false },
    { command: "pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: false },
  ],
});
