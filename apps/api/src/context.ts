import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db/index.ts";
import type { Mailer } from "./mail/index.ts";
import type { Profile } from "./profile.ts";

/** Everything a route needs. The clock is injectable so that tests can move time. */
export interface Deps {
  db: Db;
  mailer: Mailer;
  profile: Profile;
  now: () => number;
  /** Address of the web client, for links in e-mails and CORS. */
  webOrigin: string;
}

/** An error returned to the client as `{"error": code}` with an HTTP status. */
export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 429;
  readonly code: string;
  constructor(status: 400 | 401 | 403 | 404 | 409 | 429, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function sha256Hex(...parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
}

/** A random id of 16 bytes, as hex. */
export function newId(): string {
  return randomBytes(16).toString("hex");
}
