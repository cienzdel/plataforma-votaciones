import { cellIdHex, cellSpec, tallyCells, voteAck, type CellSpec } from "./ballot.ts";
import { fromHex, isHex, toHex } from "./bytes.ts";
import { verifyChain, type ChainRecord } from "./chain.ts";
import { drandRandomness, drawCommitment, drawSigma, LIVE_ROUND_DELAY_SECONDS, QUICKNET, roundAt, shuffle } from "./draw.ts";
import { isFraction } from "./fraction.ts";
import { canonicalize, hashJsonHex, jsonEqual } from "./jcs.ts";
import { isId } from "./methods/common.ts";
import { computeResult, METHODS, needsTiebreakOrder, validateParams } from "./methods/index.ts";
import { limitedVoteConsistent } from "./methods/limitedVote.ts";
import { computeQuorum } from "./quorum.ts";
import { importVotingKey, keyFingerprint, verifySignature } from "./signature.ts";
import { isTimestamp, parseTimestamp } from "./time.ts";
import { check, SpecError, type BoardCounters, type Rules, type Tallies } from "./types.ts";

/** Error codes of the universal verification, in the order of spec/protocol.md §10.2. */
export type BoardErrorCode =
  | "format_invalid"
  | "rules_hash_mismatch"
  | "opening_mismatch"
  | "key_invalid"
  | "invalid_signature"
  | "token_voting_id_mismatch"
  | "duplicate_token"
  | "participation_unsorted"
  | "cells_invalid"
  | "tallies_mismatch"
  | "counters_inconsistent"
  | "quorum_mismatch"
  | "commitment_mismatch"
  | "drand_invalid"
  | "round_mismatch"
  | "order_mismatch"
  | "result_mismatch"
  | "candidates_mismatch"
  | "chain_mismatch"
  | "prev_mismatch"
  | "receipt_mismatch";

export interface DrawDocument {
  commitment: string;
  drand: { chain_hash: string; randomness: string; round: number; signature: string };
  items: string[];
  order: string[];
  purpose: string;
  round_rule?: { after: string; delay_seconds: number };
  seed: string;
  sigma: string;
  type: "draw";
  version: 1;
  voting_id: string;
}

export interface Board {
  annulment?: { reason: string };
  candidates_hash: string | null;
  cells: Record<string, [string, string][]> | null;
  closed_at: string;
  counters: BoardCounters;
  draw: DrawDocument | null;
  key: { fingerprint: string; public_key: string } | null;
  opened_at: string;
  participation: [string, string][] | null;
  quorum: { forced: { reason: string } | null; met: boolean; min_attendance: { required: number; met: boolean } | null; required: number };
  result: unknown;
  roll_call_hash: string | null;
  rules: Rules;
  rules_hash: string;
  status: "closed" | "annulled";
  tallies: Tallies;
  title: string;
  type: "board";
  version: 1;
  voting_id: string;
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

export interface BoardInput {
  /** The opening notice (spec/formats.md §12). */
  opening: unknown;
  board: unknown;
  /** The chain file (spec/formats.md §9). */
  chain: { records: ChainRecord[] };
  /** The candidates table, if available (spec/formats.md §6). */
  candidates?: unknown;
  /** A voter's receipt, for the individual check (spec/protocol.md §10.1). */
  receipt?: unknown;
}

export type BoardReport =
  | { valid: true; result: unknown }
  | { valid: false; error: BoardErrorCode; universalValid: boolean };

class Failure extends Error {
  readonly code: BoardErrorCode;
  constructor(code: BoardErrorCode) {
    super(code);
    this.code = code;
  }
}

function fail(condition: boolean, code: BoardErrorCode): void {
  if (!condition) throw new Failure(code);
}

const BOARD_MEMBERS = [
  "candidates_hash", "cells", "closed_at", "counters", "draw", "key", "opened_at", "participation", "quorum",
  "result", "roll_call_hash", "rules", "rules_hash", "status", "tallies", "title", "type", "version", "voting_id",
];
const COUNTERS = ["issued", "members", "present", "proxies", "received", "rights", "session_members", "session_present"];
const DRAW_MEMBERS = ["commitment", "drand", "items", "order", "purpose", "seed", "sigma", "type", "version", "voting_id"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const hasMembers = (v: Record<string, unknown>, names: string[]) => jsonEqual(Object.keys(v).sort(), [...names].sort());
const isReason = (v: unknown) => isObject(v) && hasMembers(v, ["reason"]) && typeof v.reason === "string";
const isThreshold = (v: unknown) => isObject(v) && hasMembers(v, ["met", "required"]) && isCount(v.required) && typeof v.met === "boolean";
const isPairs = (v: unknown, a: number, b?: number) =>
  Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && isHex(p[0], a) && (b === undefined ? typeof p[1] === "string" : isHex(p[1], b)));

function checkRules(r: unknown): asserts r is Rules {
  check(isObject(r) && hasMembers(r, ["electorate_filter", "method", "min_attendance", "mode", "params", "profile", "quorum", "timing"]), "rules");
  check(METHODS.includes(r.method as Rules["method"]) && isObject(r.params), "method");
  check(["secret", "roll_call", "manual", "paper"].includes(r.mode as string) && ["live", "final_link"].includes(r.timing as string), "mode");
  check(isFraction(r.quorum) && (r.min_attendance === null || isFraction(r.min_attendance)), "quorum");
  check(r.electorate_filter === null || isId(r.electorate_filter), "electorate_filter");
  const p = r.profile;
  check(isObject(p) && hasMembers(p, ["hash", "id", "version"]) && isHex(p.hash, 32) && typeof p.id === "string" && typeof p.version === "string", "profile");
}

function checkDraw(d: unknown): asserts d is DrawDocument {
  check(isObject(d) && d.type === "draw" && d.version === 1 && d.purpose === "tiebreak_order", "draw");
  check(hasMembers(d, d.round_rule === undefined ? DRAW_MEMBERS : [...DRAW_MEMBERS, "round_rule"]), "draw members");
  check([d.commitment, d.seed, d.sigma].every((h) => isHex(h, 32)) && isHex(d.voting_id, 16), "draw hashes");
  check(Array.isArray(d.items) && Array.isArray(d.order), "draw items");
  const r = d.drand;
  check(isObject(r) && hasMembers(r, ["chain_hash", "randomness", "round", "signature"]), "drand");
  check(isHex(r.chain_hash, 32) && isHex(r.randomness, 32) && isHex(r.signature, 48) && isCount(r.round), "drand values");
  const rule = d.round_rule;
  check(rule === undefined || (isObject(rule) && hasMembers(rule, ["after", "delay_seconds"]) && isTimestamp(rule.after) && isCount(rule.delay_seconds)), "round rule");
}

/** Step 1: the board conforms to spec/formats.md. Throws SpecError otherwise. */
function checkFormat(b: unknown): { board: Board; spec: CellSpec; candidates: string[] } {
  canonicalize(b);
  check(isObject(b) && b.type === "board" && b.version === 1 && isHex(b.voting_id, 16) && typeof b.title === "string", "board");
  const annulled = b.status === "annulled";
  check(b.status === "closed" || annulled, "status");
  check(hasMembers(b, annulled ? [...BOARD_MEMBERS, "annulment"] : BOARD_MEMBERS), "board members");
  check(annulled ? isReason(b.annulment) && b.result === null : isObject(b.result), "result");
  check(isTimestamp(b.opened_at) && isTimestamp(b.closed_at) && isHex(b.rules_hash, 32), "times");
  checkRules(b.rules);
  const { method, mode, params } = b.rules;
  const candidates = validateParams(method, params);
  const spec = cellSpec(method, params);

  const c = b.counters;
  const secret = mode === "secret";
  check(isObject(c) && hasMembers(c, COUNTERS) && COUNTERS.every((n) => isCount(c[n]) || (n === "issued" && !secret && c[n] === null)), "counters");
  const q = b.quorum;
  check(isObject(q) && hasMembers(q, ["forced", "met", "min_attendance", "required"]) && isThreshold({ met: q.met, required: q.required }), "quorum");
  check((q.min_attendance === null || isThreshold(q.min_attendance)) && (q.forced === null || isReason(q.forced)), "quorum");

  if (secret) {
    const k = b.key;
    check(isObject(k) && hasMembers(k, ["fingerprint", "public_key"]) && isHex(k.public_key) && isHex(k.fingerprint, 32), "key");
    check(isPairs(b.participation, 80, 384), "participation");
    const cells = b.cells;
    check(isObject(cells) && Object.values(cells).every((list) => isPairs(list, 32)), "cells");
  } else check(b.key === null && b.participation === null && b.cells === null, "not secret");

  const t = b.tallies;
  check(isObject(t) && hasMembers(t, [...spec.keys()]), "tallies");
  for (const [cell, values] of spec) {
    const tc = t[cell];
    check(isObject(tc) && hasMembers(tc, [...values]) && values.every((v) => isCount(tc[v])), "tally");
  }
  const needsDraw = needsTiebreakOrder(method);
  if (b.draw !== null) checkDraw(b.draw);
  check(needsDraw ? b.draw !== null || annulled : b.draw === null, "draw presence");
  check(method === "yes_no" ? b.candidates_hash === null : isHex(b.candidates_hash, 32), "candidates_hash");
  check(mode === "roll_call" ? isHex(b.roll_call_hash, 32) : b.roll_call_hash === null, "roll_call_hash");
  return { board: b as unknown as Board, spec, candidates };
}

/** Step 2: what the opening notice fixed in public. */
function checkOpening(b: Board, o: unknown): void {
  const skipDraw = b.status === "annulled" && b.draw === null;
  const ok =
    isObject(o) &&
    o.type === "opening" &&
    o.voting_id === b.voting_id &&
    jsonEqual(o.rules, b.rules) &&
    o.rules_hash === b.rules_hash &&
    jsonEqual(o.key, b.key) &&
    jsonEqual(o.quorum, b.quorum) &&
    // An annulled voting may be published without its draw (spec/formats.md §12).
    (skipDraw || o.draw_commitment === (b.draw?.commitment ?? null)) &&
    (b.rules.timing === "final_link"
      ? o.closes_at === b.closed_at && (skipDraw || o.draw_round === (b.draw?.drand.round ?? null))
      : o.closes_at === null && o.draw_round === null);
  fail(ok, "opening_mismatch");
}

/** Steps 3 and 4: key and participation (`secret` only). */
async function checkParticipation(b: Board, participation: [string, string][]): Promise<void> {
  const key = b.key!;
  const cryptoKey = await importVotingKey(key.public_key);
  fail(keyFingerprint(key.public_key) === key.fingerprint && cryptoKey !== null, "key_invalid");
  for (const [token, sig] of participation) {
    fail(await verifySignature(cryptoKey!, fromHex(token), fromHex(sig)), "invalid_signature");
    fail(token.slice(64, 96) === b.voting_id, "token_voting_id_mismatch");
  }
  const tokens = participation.map(([t]) => t);
  fail(new Set(tokens).size === tokens.length, "duplicate_token");
  fail(tokens.every((t, i) => i === 0 || tokens[i - 1]! < t), "participation_unsorted");
}

/** Step 5: every cell of the method, one sorted entry per ballot, allowed values only. */
function checkCells(spec: CellSpec, cells: Record<string, [string, string][]>, ballots: number): void {
  const ok =
    hasMembers(cells, [...spec.keys()]) &&
    [...spec].every(([cell, values]) => {
      const list = cells[cell]!;
      return list.length === ballots && list.every(([id, v], i) => values.includes(v) && (i === 0 || list[i - 1]![0] < id));
    });
  fail(ok, "cells_invalid");
}

/** Step 9: the tie-break draw (spec/draws.md §5). The drand BLS signature is not verified here. */
function checkDraw9(b: Board, d: DrawDocument, candidates: string[]): void {
  fail(d.voting_id === b.voting_id && jsonEqual([...d.items].sort(), [...candidates].sort()), "order_mismatch");
  const seed = fromHex(d.seed);
  fail(toHex(drawCommitment(seed)) === d.commitment, "commitment_mismatch");
  fail(d.drand.chain_hash === QUICKNET.chainHash && toHex(drandRandomness(fromHex(d.drand.signature))) === d.drand.randomness, "drand_invalid");
  const rule = d.round_rule;
  const roundOk =
    b.rules.timing === "final_link"
      ? rule === undefined && d.drand.round === roundAt(parseTimestamp(b.closed_at))
      : rule !== undefined &&
        rule.after === b.closed_at &&
        rule.delay_seconds === LIVE_ROUND_DELAY_SECONDS &&
        d.drand.round === roundAt(parseTimestamp(rule.after) + rule.delay_seconds);
  fail(roundOk, "round_mismatch");
  const sigma = drawSigma(seed, fromHex(d.drand.randomness));
  fail(toHex(sigma) === d.sigma && jsonEqual(shuffle(sigma, d.items).order, d.order), "order_mismatch");
}

/** Step 11: the candidates table, when available. */
function checkCandidates(b: Board, table: unknown, candidates: string[]): void {
  const t = table as { candidates?: { id: string }[]; posts?: { id: string }[] };
  const ids = (list: { id: string }[] | undefined) => new Set((list ?? []).map((x) => x.id));
  const cands = ids(t.candidates);
  const posts = ids(t.posts);
  const params = b.rules.params as { posts?: string[] };
  const ok =
    hashJsonHex(table) === b.candidates_hash && candidates.every((c) => cands.has(c)) && (params.posts ?? []).every((p) => posts.has(p));
  fail(ok, "candidates_mismatch");
}

/** Step 12: the board is in the chain and the chain links are intact. */
function checkChain(b: Board, records: ChainRecord[]): void {
  const boardHash = hashJsonHex(b);
  fail(records.some((r) => r.board === boardHash), "chain_mismatch");
  const error = verifyChain(records);
  if (error !== null) throw new Failure(error.error);
}

/** Individual verification of a receipt against a board (spec/protocol.md §10.1). */
export function checkReceipt(board: Board, receipt: unknown): boolean {
  try {
    const r = receipt as Receipt;
    const cells = board.cells!;
    return (
      r.type === "receipt" &&
      r.voting_id === board.voting_id &&
      voteAck(r) === r.ack &&
      board.participation!.some(([t, s]) => t === r.token && s === r.sig) &&
      Object.entries(r.answers).every(([c, v]) => {
        const id = cellIdHex(r.s, r.voting_id, c);
        return cells[c]?.some(([i, x]) => i === id && x === v) === true;
      })
    );
  } catch {
    return false;
  }
}

/**
 * Universal verification of one board (spec/protocol.md §10.2), plus the receipt check of §10.1
 * if a receipt is given. Reports the first failing check.
 */
export async function verifyBoard(input: BoardInput): Promise<BoardReport> {
  let board: Board;
  try {
    let spec: CellSpec, candidates: string[];
    try {
      ({ board, spec, candidates } = checkFormat(input.board));
    } catch (e) {
      throw e instanceof SpecError ? new Failure("format_invalid") : e;
    }
    const b = board;
    fail(hashJsonHex(b.rules) === b.rules_hash, "rules_hash_mismatch");
    checkOpening(b, input.opening);

    const secret = b.rules.mode === "secret";
    const c = b.counters;
    if (secret) {
      await checkParticipation(b, b.participation!);
      checkCells(spec, b.cells!, b.participation!.length);
    }
    const tallyOk = secret
      ? jsonEqual(b.tallies, tallyCells(spec, b.cells!))
      : Object.values(b.tallies).every((t) => Object.values(t).reduce((x, y) => x + y, 0) === c.received);
    fail(tallyOk && (b.rules.method !== "limited_vote" || limitedVoteConsistent(b.rules.params, b.tallies)), "tallies_mismatch");

    const unrestricted = b.rules.electorate_filter === null;
    const countersOk =
      c.rights === c.present + c.proxies &&
      (secret ? c.received === b.participation!.length && c.received <= c.issued! && c.issued! <= c.rights : c.received <= c.rights) &&
      (!unrestricted || (c.members === c.session_members && c.present === c.session_present));
    fail(countersOk, "counters_inconsistent");

    const q = computeQuorum(b.rules, c);
    const metAll = q.met && (q.min_attendance === null || q.min_attendance.met);
    const { forced, ...published } = b.quorum;
    fail(jsonEqual(published, q) && (metAll || forced !== null), "quorum_mismatch");

    if (b.draw !== null) checkDraw9(b, b.draw, candidates);
    if (b.status === "closed") {
      const expected = computeResult(b.rules.method, b.rules.params, b.tallies, c, b.draw?.order);
      fail(jsonEqual(expected, b.result), "result_mismatch");
    }
    if (input.candidates !== undefined) checkCandidates(b, input.candidates, candidates);
    checkChain(b, input.chain.records);
  } catch (e) {
    if (e instanceof Failure) return { valid: false, error: e.code, universalValid: false };
    throw e;
  }
  if (input.receipt !== undefined && !(board.rules.mode === "secret" && checkReceipt(board, input.receipt))) {
    return { valid: false, error: "receipt_mismatch", universalValid: true };
  }
  return { valid: true, result: board.result };
}
