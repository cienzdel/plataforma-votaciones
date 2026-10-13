/** The body's hash chain (spec/formats.md §9) and its file in the data repository. */
import { GENESIS_PREV, hashJsonHex, recordHash } from "@pv/core";
import { desc } from "drizzle-orm";
import type { Deps } from "./context.ts";
import type { Db } from "./db/index.ts";
import { chainRecord } from "./db/schema.ts";
import { jsonFile, type File } from "./publisher.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Appends a board, draw or assent record. Call inside the transaction that stores the document. */
export function appendToChain(tx: Tx, document: unknown, path: string): string {
  const last = tx.select().from(chainRecord).orderBy(desc(chainRecord.seq)).get();
  const prev = last?.recordHash ?? GENESIS_PREV;
  const board = hashJsonHex(document);
  const hash = recordHash(board, prev);
  tx.insert(chainRecord).values({ seq: (last?.seq ?? 0) + 1, board, prev, recordHash: hash, path }).run();
  return hash;
}

/** The record hash of a chained document. */
export function recordOf(deps: Deps, document: unknown): string {
  const h = hashJsonHex(document);
  return deps.db.select().from(chainRecord).all().find((r) => r.board === h)!.recordHash;
}

export function chainFile(deps: Deps): File {
  const records = deps.db.select().from(chainRecord).orderBy(chainRecord.seq).all();
  return jsonFile("chain.json", {
    records: records.map((r) => ({ board: r.board, path: r.path, prev: r.prev, record_hash: r.recordHash })),
    type: "chain",
    version: 1,
  });
}

/** Folder of a document in the data repository: the UTC date (spec/formats.md §9.1). */
export function datePath(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replaceAll("-", "/");
}
