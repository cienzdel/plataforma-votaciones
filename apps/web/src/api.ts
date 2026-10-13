/** Configuration, session and calls to the two API origins. */

export interface Config {
  /** Session API. */
  api: string;
  /** Reception origin (another subdomain). */
  reception: string;
  /** Where GitHub Pages serves the data repository, or null. */
  data: string | null;
}

let config: Config | null = null;

/** Loads config.json, published next to the page by the same build. */
export async function loadConfig(): Promise<Config> {
  if (config === null) config = (await (await fetch("./config.json", { cache: "no-store" })).json()) as Config;
  return config;
}

export function cfg(): Config {
  return config!;
}

export interface Session {
  token: string;
  expires_at: number;
  member: { id: string; name: string; official: boolean };
}

const SESSION_KEY = "pv:session";

export function getSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return s !== null && s.expires_at > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null): void {
  try {
    if (s === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // the session then lasts until the page is reloaded
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Calls the session API with the bearer token. Never sends cookies. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const s = getSession();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (s !== null) headers.authorization = "Bearer " + s.token;
  const res = await fetch(cfg().api + path, { method, headers, credentials: "omit", body: body === undefined ? null : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  if (res.status === 401 && s !== null) setSession(null);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? "error");
  return data as T;
}

/** Sends a vote to the reception origin: no session header and no cookies (spec/protocol.md §6). */
export async function postVote(vote: unknown): Promise<{ ack: string }> {
  const res = await fetch(cfg().reception + "/cast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    body: JSON.stringify(vote),
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error");
  return data;
}
