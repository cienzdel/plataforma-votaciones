import { hashJsonHex } from "./jcs.ts";

export const GENESIS_PREV = "0".repeat(64);

export interface ChainRecord {
  board: string;
  prev: string;
  record_hash: string;
}

export interface ChainError {
  error: "chain_mismatch" | "prev_mismatch";
  index: number;
}

/** `record_hash = HJ({board, prev})` (spec/formats.md §9). */
export function recordHash(board: string, prev: string): string {
  return hashJsonHex({ board, prev });
}

/** Appends `document` after the record whose hash is `prev`. */
export function chainRecord(prev: string, document: unknown): ChainRecord {
  const board = hashJsonHex(document);
  return { board, prev, record_hash: recordHash(board, prev) };
}

export function buildChain(documents: readonly unknown[]): ChainRecord[] {
  const records: ChainRecord[] = [];
  for (const d of documents) records.push(chainRecord(records.at(-1)?.record_hash ?? GENESIS_PREV, d));
  return records;
}

/**
 * Checks every link of a chain and, when `documents` is given, that record `i` is the hash of
 * document `i`. Returns the first error by index; within a record, the document hash is checked
 * first, then `prev`, then `record_hash`.
 */
export function verifyChain(records: readonly ChainRecord[], documents?: readonly unknown[]): ChainError | null {
  if (documents !== undefined && documents.length !== records.length) {
    return { error: "chain_mismatch", index: Math.min(documents.length, records.length) };
  }
  for (const [i, r] of records.entries()) {
    if (documents !== undefined && r.board !== hashJsonHex(documents[i])) return { error: "chain_mismatch", index: i };
    if (r.prev !== (i === 0 ? GENESIS_PREV : records[i - 1]!.record_hash)) return { error: "prev_mismatch", index: i };
    if (r.record_hash !== recordHash(r.board, r.prev)) return { error: "chain_mismatch", index: i };
  }
  return null;
}
