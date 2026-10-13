/** Builds valid opening notices, boards and chains for tests, with fictitious data only. */
import {
  buildChain,
  cellIdHex,
  cellSpec,
  computeQuorum,
  computeResult,
  concat,
  drawCommitment,
  drawSigma,
  drandRandomness,
  formatTimestamp,
  fromHex,
  hashJsonHex,
  keyFingerprint,
  QUICKNET,
  roundTime,
  shuffle,
  tallyCells,
  toHex,
  validateParams,
  voteAck,
  type BoardInput,
  type Method,
  type Mode,
  type Tallies,
  type Timing,
} from "../src/index.js";

export const VOTING_ID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
export const SEED = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
/** Real quicknet round, also used by spec/cases/draw-001. */
export const DRAND_ROUND = 33026212;
export const DRAND_SIGNATURE =
  "9791658769c0476a1f88d6b08366504f486ce0a883e4fb17e19b666f39e34f138bb4c480d84f57378d5e9d6694996f92";

const PSS = { name: "RSA-PSS", hash: "SHA-384" } as const;
const keys = new Map<string, Promise<CryptoKeyPair>>();

/** An RSA key pair, generated once per exponent and size. */
export function keyPair(bits = 3072, exponent = [1, 0, 1]): Promise<CryptoKeyPair> {
  const id = bits + ":" + exponent.join(",");
  if (!keys.has(id)) {
    const params = { ...PSS, modulusLength: bits, publicExponent: new Uint8Array(exponent) };
    keys.set(id, crypto.subtle.generateKey(params, true, ["sign", "verify"]) as Promise<CryptoKeyPair>);
  }
  return keys.get(id)!;
}

export async function publicKeyHex(pair: CryptoKeyPair): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
}

/** A credential `(token, sig)`; the signature is the standard RSASSA-PSS signature a blind signature finalises to. */
export async function credential(pair: CryptoKeyPair, votingId = VOTING_ID): Promise<[string, string]> {
  const token = concat(crypto.getRandomValues(new Uint8Array(32)), fromHex(votingId), crypto.getRandomValues(new Uint8Array(32)));
  const sig = await crypto.subtle.sign({ name: "RSA-PSS", saltLength: 48 }, pair.privateKey, token);
  return [toHex(token), toHex(new Uint8Array(sig))];
}

export interface FixtureOptions {
  method?: Method;
  params?: Record<string, unknown>;
  mode?: Mode;
  timing?: Timing;
  /** Ballots of a `secret` voting. */
  ballots?: Record<string, string>[];
  /** Tallies of the other modes. */
  tallies?: Tallies;
  received?: number;
  counters?: Record<string, number | null>;
  electorateFilter?: string | null;
  minAttendance?: [number, number] | null;
}

export interface Fixture extends BoardInput {
  opening: any;
  board: any;
  receipt?: any;
  candidates?: any;
}

function candidatesTable(method: Method, params: Record<string, unknown>) {
  const ids = validateParams(method, params);
  return {
    candidates: ids.map((id) => ({ id, name: "Example " + id })),
    posts: ((params.posts as string[] | undefined) ?? []).map((id) => ({ id, name: "Post " + id })),
    type: "candidates",
    version: 1,
    voting_id: VOTING_ID,
  };
}

/** A valid voting with its opening notice, board, one-record chain, candidates table and (in `secret`) a receipt. */
export async function fixture(o: FixtureOptions = {}): Promise<Fixture> {
  const method = o.method ?? "yes_no";
  const params = o.params ?? { base: "cast", rule: "simple" };
  const mode = o.mode ?? "secret";
  const timing = o.timing ?? "live";
  const secret = mode === "secret";
  const rules = {
    electorate_filter: o.electorateFilter ?? null,
    method,
    min_attendance: o.minAttendance ?? null,
    mode,
    params,
    profile: { hash: "4d7c5059d6643531b085ef2e23b20dae3bb0d557e73c04d0a695d17a8765e616", id: "example", version: "0.1.0" },
    quorum: [1, 3],
    timing,
  };
  const spec = cellSpec(method, params);
  const candidateIds = validateParams(method, params);

  let key = null;
  let participation = null;
  let cells: Record<string, [string, string][]> | null = null;
  let tallies = o.tallies!;
  let receipt;
  let received = o.received ?? 0;
  if (secret) {
    const pair = await keyPair();
    const publicKey = await publicKeyHex(pair);
    key = { fingerprint: keyFingerprint(publicKey), public_key: publicKey };
    const ballots = o.ballots ?? [{ q: "for" }, { q: "against" }, { q: "for" }];
    const votes = [];
    for (const answers of ballots) {
      const [token, sig] = await credential(pair);
      votes.push({ answers, s: toHex(crypto.getRandomValues(new Uint8Array(32))), sig, token, voting_id: VOTING_ID });
    }
    participation = votes.map((v) => [v.token, v.sig] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    cells = {};
    for (const cell of spec.keys()) {
      cells[cell] = votes.map((v) => [cellIdHex(v.s, VOTING_ID, cell), v.answers[cell]!] as [string, string]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }
    tallies = tallyCells(spec, cells);
    received = votes.length;
    receipt = { ...votes[0]!, ack: voteAck(votes[0]!), type: "receipt", version: 1 };
  }

  const counters = {
    issued: secret ? received + 1 : null,
    members: 12,
    present: 6,
    proxies: 1,
    received,
    rights: 7,
    session_members: 12,
    session_present: 6,
    ...o.counters,
  } as Record<string, number>;
  const q = computeQuorum({ quorum: [1, 3], min_attendance: rules.min_attendance as [number, number] | null }, counters as never);
  const metAll = q.met && (q.min_attendance === null || q.min_attendance.met);
  const quorum = { forced: metAll ? null : { reason: "Opened by the officials" }, ...q };

  let draw = null;
  let closedAt = "2027-03-10T18:42:00Z";
  if (method === "posts" || method === "limited_vote") {
    const t = roundTime(DRAND_ROUND);
    closedAt = formatTimestamp(1000 * (timing === "final_link" ? t : t - 30));
    const seed = fromHex(SEED);
    const randomness = drandRandomness(fromHex(DRAND_SIGNATURE));
    const sigma = drawSigma(seed, randomness);
    draw = {
      commitment: toHex(drawCommitment(seed)),
      drand: { chain_hash: QUICKNET.chainHash, randomness: toHex(randomness), round: DRAND_ROUND, signature: DRAND_SIGNATURE },
      items: candidateIds,
      order: shuffle(sigma, candidateIds).order,
      purpose: "tiebreak_order",
      ...(timing === "live" ? { round_rule: { after: closedAt, delay_seconds: 30 } } : {}),
      seed: SEED,
      sigma: toHex(sigma),
      type: "draw",
      version: 1,
      voting_id: VOTING_ID,
    };
  }
  const table = method === "yes_no" ? undefined : candidatesTable(method, params);
  const board = {
    candidates_hash: table === undefined ? null : hashJsonHex(table),
    cells,
    closed_at: closedAt,
    counters,
    draw,
    key,
    opened_at: "2027-03-10T18:30:00Z",
    participation,
    quorum,
    result: computeResult(method, params, tallies, counters as never, draw?.order),
    roll_call_hash: mode === "roll_call" ? hashJsonHex({ type: "roll_call", version: 1, voting_id: VOTING_ID, votes: [] }) : null,
    rules,
    rules_hash: hashJsonHex(rules),
    status: "closed",
    tallies,
    title: "Example voting",
    type: "board",
    version: 1,
    voting_id: VOTING_ID,
  };
  const opening = {
    closes_at: timing === "final_link" ? closedAt : null,
    draw_commitment: draw?.commitment ?? null,
    draw_round: timing === "final_link" && draw !== null ? DRAND_ROUND : null,
    key,
    opened_at: board.opened_at,
    quorum,
    rules,
    rules_hash: board.rules_hash,
    title: board.title,
    type: "opening",
    version: 1,
    voting_id: VOTING_ID,
  };
  return { opening, board, chain: { records: buildChain([board]) }, receipt, candidates: table };
}

/** Recomputes the derived hashes after a test changes a board, so that only the intended check fails. */
export function rechain(f: Fixture): Fixture {
  return { ...f, chain: { records: buildChain([f.board]) } };
}
