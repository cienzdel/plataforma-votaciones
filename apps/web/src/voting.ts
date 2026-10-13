/**
 * The voter's side of the protocol (spec/protocol.md §5, §6, §10.1): fingerprint check,
 * blinding, finalisation, casting and the individual check of receipts. Everything that must
 * survive a reload is saved in this browser before it is sent.
 */
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { checkReceipt, keyFingerprint, voteAck, type Board } from "@pv/core";
import { api, cfg, postVote } from "./api.ts";

const suite = RSABSSA.SHA384.PSS.Randomized();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
// blindrsa-ts needs plain Uint8Array (PLAN/h1-pruebas-de-concepto.md).
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

export interface Opening {
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
  candidates: { candidates: { id: string; name: string }[]; posts: { id: string; name: string }[] } | null;
  my_rights: number;
}

export class StorageError extends Error {}
export class KeyMismatchError extends Error {}

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

const k = (kind: string, votingId: string, right?: number) => `pv:${kind}:${votingId}` + (right === undefined ? "" : `:${right}`);

/**
 * Checks the key against the opening notice served by GitHub Pages when available (always for
 * final-link votings), otherwise against the one from the API (ADR-0008).
 */
async function checkKey(v: VotingView): Promise<string> {
  const opening = v.opening!;
  const fp = keyFingerprint(opening.key!.public_key);
  if (fp !== opening.key!.fingerprint) throw new KeyMismatchError();
  const data = cfg().data;
  if (data !== null) {
    const path = `${opening.opened_at.slice(0, 10).replaceAll("-", "/")}/${v.id}.opening.json`;
    const res = await fetch(`${data}/${path}`, { cache: "no-store", credentials: "omit" }).catch(() => null);
    if (res?.ok) {
      const published = (await res.json()) as Opening;
      if (published.key?.public_key !== opening.key!.public_key) throw new KeyMismatchError();
    } else if (opening.closes_at !== null) throw new KeyMismatchError();
  }
  save(k("fp", v.id), fp);
  return fp;
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
  if (load(k("fp", v.id)) === null) await checkKey(v);
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
  return load<Receipt>(k("receipt", votingId, right));
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

/** Individual verification of every receipt of this browser against the board (spec/protocol.md §10.1). */
export function checkMyReceipts(v: VotingView): boolean | null {
  if (v.board === null) return null;
  const receipts = Array.from({ length: Math.max(v.my_rights, 0) }, (_, j) => getReceipt(v.id, j)).filter((r) => r !== null);
  if (receipts.length === 0) return null;
  const fp = load<string>(k("fp", v.id));
  return receipts.every((r) => checkReceipt(v.board as Board, r)) && (fp === null || v.board.key?.fingerprint === fp);
}

export function receiptFile(r: Receipt): string {
  return URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
}
