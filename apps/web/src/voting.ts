/**
 * The voter's side of the protocol (spec/protocol.md §5, §6, §10.1): fingerprint check,
 * blinding, finalisation, casting and the individual check of receipts. Everything that must
 * survive a reload is saved in this browser before it is sent.
 */
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { hashJsonHex, jsonEqual, keyFingerprint, verifyBoard, voteAck, type Board, type ChainRecord } from "@pv/core";
import { api, cfg, getSession, postVote } from "./api.ts";

const suite = RSABSSA.SHA384.PSS.Randomized();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
// blindrsa-ts needs plain Uint8Array (PLAN/h1-pruebas-de-concepto.md).
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

export interface Opening {
  candidates_hash?: string | null;
  key: { fingerprint: string; public_key: string } | null;
  opened_at: string;
  closes_at: string | null;
  rules: { method: string; timing: string };
  voting_id: string;
}

export interface VotingView {
  id: string;
  meeting_id: string;
  title: string;
  status: "created" | "awaiting_pages" | "open" | "awaiting_draw" | "closed" | "annulled";
  method: "yes_no" | "single_winner" | "posts" | "limited_vote";
  mode: "secret" | "roll_call" | "manual" | "paper";
  timing: "live" | "final_link";
  draw_commitment: string | null;
  draw_round: number | null;
  my_nominal_votes: number[];
  params: Record<string, unknown>;
  opening: Opening | null;
  board: (Board & { result: Record<string, unknown> | null }) | null;
  /** The whole candidates table (spec/formats.md §6), salt included, so that its hash can be checked. */
  candidates: { candidates: { id: string; name: string }[]; posts: { id: string; name: string }[] } | null;
  my_rights: number;
}

export class StorageError extends Error {}
export class KeyMismatchError extends Error {}
/** The opening notice is not on GitHub Pages, and it is too late for it to be still on its way. */
export class NotPublishedError extends Error {}

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

/** Saves or throws: losing a credential must not happen silently. */
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new StorageError();
  }
}

/**
 * Storage key of the logged-in member: credentials, votes and receipts belong to one member, so
 * another member who logs in on the same browser never sees or spends them.
 */
function k(kind: string, votingId: string, right?: number): string {
  const member = getSession()?.member.id;
  if (member === undefined) throw new StorageError();
  return `pv:${member}:${kind}:${votingId}` + (right === undefined ? "" : `:${right}`);
}

/** A JSON file of the data repository as GitHub Pages serves it, or null if it is not there. */
async function fromPages<T>(path: string): Promise<T | null> {
  const res = await fetch(`${cfg().data}/${path}`, { cache: "no-store", credentials: "omit" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

const DAY_MS = 86_400_000;
/** How long after opening a live voting may be used before Pages serves its notice. */
export const PAGES_GRACE_MS = 15 * 60_000;
/** How many days back the notice of a voting is looked for, whatever date the API gives. */
const LOOKBACK_DAYS = 7;
const datePath = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "/");

/**
 * Checks what the API says about an open voting against its opening notice on GitHub Pages
 * (ADR-0008): the key, and the names shown on the ballot through `candidates_hash`. Where the notice
 * is looked for, and whether it may be missing, does not rest on the API alone: the dates around
 * today are tried too, and the API's copy is enough only for a live voting that opened minutes ago.
 */
export async function checkOpening(v: VotingView): Promise<void> {
  const opening = v.opening!;
  if (opening.key !== null && keyFingerprint(opening.key.public_key) !== opening.key.fingerprint) throw new KeyMismatchError();
  const names = v.candidates === null ? null : hashJsonHex(v.candidates);
  if (cfg().data === null) return; // no public archive to check against
  const now = Date.now();
  const openedAt = Date.parse(opening.opened_at);
  const days = [openedAt, ...Array.from({ length: LOOKBACK_DAYS + 1 }, (_, d) => now - d * DAY_MS)];
  for (const day of new Set(days.filter(Number.isFinite).map(datePath))) {
    const published = await fromPages<Opening & { voting_id: string }>(`${day}/${v.id}.opening.json`);
    if (published === null) continue;
    if (published.voting_id !== v.id || !jsonEqual(published.key, opening.key) || published.candidates_hash !== names) throw new KeyMismatchError();
    return;
  }
  if (opening.closes_at !== null || !(openedAt <= now + 60_000 && now - openedAt < PAGES_GRACE_MS)) throw new NotPublishedError();
}

interface Pending {
  token: string;
  inv: string;
  blinded_msg: string;
}

export interface Credential {
  token: string;
  sig: string;
}

/** Gets one credential per right, resuming any request interrupted before. */
export async function ensureCredentials(v: VotingView): Promise<Credential[]> {
  await checkOpening(v);
  // Once a key was accepted for this voting, no other key is used for it.
  const fp = keyFingerprint(v.opening!.key!.public_key);
  const saved = load<string>(k("fp", v.id));
  if (saved !== null && saved !== fp) throw new KeyMismatchError();
  if (saved === null) save(k("fp", v.id), fp);
  const pk = await crypto.subtle.importKey("spki", bytes(v.opening!.key!.public_key), { name: "RSA-PSS", hash: "SHA-384" }, true, ["verify"]);
  const creds: Credential[] = [];
  for (let j = 0; j < v.my_rights; j++) {
    const done = load<Credential>(k("cred", v.id, j));
    if (done !== null) {
      creds.push(done);
      continue;
    }
    let p = load<Pending>(k("pending", v.id, j));
    if (p === null) {
      const msg = new Uint8Array([...bytes(v.id), ...crypto.getRandomValues(new Uint8Array(32))]);
      const token = suite.prepare(msg);
      const { blindedMsg, inv } = await suite.blind(pk, token);
      p = { token: hex(token), inv: hex(inv), blinded_msg: hex(blindedMsg) };
      save(k("pending", v.id, j), p);
    }
    const { blind_sig } = await api<{ blind_sig: string }>("POST", "/votings/issue", { voting_id: v.id, right: j, blinded_msg: p.blinded_msg });
    const sig = await suite.finalize(pk, bytes(p.token), bytes(blind_sig), bytes(p.inv));
    if (!(await suite.verify(pk, sig, bytes(p.token)))) throw new KeyMismatchError();
    const cred = { token: p.token, sig: hex(sig) };
    save(k("cred", v.id, j), cred);
    creds.push(cred);
  }
  return creds;
}

export interface Receipt {
  ack: string;
  answers: Record<string, string>;
  s: string;
  sig: string;
  token: string;
  type: "receipt";
  version: 1;
  voting_id: string;
}

export function getReceipt(votingId: string, right: number): Receipt | null {
  return getSession() === null ? null : load<Receipt>(k("receipt", votingId, right));
}

/** Sends one ballot; a retry re-sends the identical vote, which the server accepts again. */
export async function castBallot(v: VotingView, right: number, cred: Credential, answers: Record<string, string>): Promise<Receipt> {
  const saved = load<Receipt>(k("vote", v.id, right));
  const vote = saved ?? { answers, s: hex(crypto.getRandomValues(new Uint8Array(32))), sig: cred.sig, token: cred.token, voting_id: v.id };
  if (saved === null) save(k("vote", v.id, right), vote);
  const { ack } = await postVote({ answers: vote.answers, s: vote.s, sig: vote.sig, token: vote.token, voting_id: vote.voting_id });
  const expected = voteAck(vote);
  if (ack !== expected) throw new Error("ack mismatch");
  const receipt: Receipt = { ack, answers: vote.answers, s: vote.s, sig: vote.sig, token: vote.token, type: "receipt", version: 1, voting_id: v.id };
  save(k("receipt", v.id, right), receipt);
  return receipt;
}

interface ChainFile {
  records: (ChainRecord & { path: string })[];
}

/**
 * Individual verification of every receipt of this browser (spec/protocol.md §10.1), against the
 * board, opening notice and chain published on GitHub Pages, never against what the API serves:
 * the check must not take its board from the party it is meant to detect. Null when there is
 * nothing to check (no receipt, or no public archive), "pending" while Pages does not serve the board.
 */
export async function checkMyReceipts(v: VotingView): Promise<boolean | "pending" | null> {
  const receipts = Array.from({ length: Math.max(v.my_rights, 0) }, (_, j) => getReceipt(v.id, j)).filter((r) => r !== null);
  if (receipts.length === 0 || cfg().data === null) return null;
  const chain = await fromPages<ChainFile>("chain.json");
  const record = chain?.records?.find((r) => typeof r.path === "string" && /^[0-9A-Za-z/_-]+\.board\.json$/.test(r.path) && r.path.split("/").at(-1) === `${v.id}.board.json`);
  if (!chain || !record) return "pending";
  const base = record.path.slice(0, -".board.json".length);
  const [board, opening] = await Promise.all([fromPages<Board>(`${base}.board.json`), fromPages<unknown>(`${base}.opening.json`)]);
  if (board === null || opening === null) return "pending";
  for (const receipt of receipts) {
    const report = await verifyBoard({ opening, board, chain, receipt });
    if (!report.valid) return false;
  }
  const fp = load<string>(k("fp", v.id));
  return fp === null || board.key?.fingerprint === fp;
}

export function receiptFile(r: Receipt): string {
  return URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
}
