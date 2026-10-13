/** What the voter's browser does (spec/protocol.md §5–§6), with the same library the web client will use. */
import { RSABSSA } from "@cloudflare/blindrsa-ts";
import { voteAck } from "@pv/core";
import type { Hono } from "hono";

const suite = RSABSSA.SHA384.PSS.Randomized();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
// blindrsa-ts needs plain Uint8Array, never a Node Buffer (PLAN/h1-pruebas-de-concepto.md).
const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

export interface Credential {
  token: string;
  sig: string;
}

export async function importKey(publicKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", bytes(publicKey), { name: "RSA-PSS", hash: "SHA-384" }, true, ["verify"]);
}

/** Prepares and blinds a token for `votingId`. */
export async function blind(publicKey: string, votingId: string) {
  const pk = await importKey(publicKey);
  const msg = new Uint8Array([...bytes(votingId), ...crypto.getRandomValues(new Uint8Array(32))]);
  const token = suite.prepare(msg);
  const { blindedMsg, inv } = await suite.blind(pk, token);
  return { pk, token, inv, blindedMsg: hex(blindedMsg) };
}

export async function finalize(b: Awaited<ReturnType<typeof blind>>, blindSig: string): Promise<Credential> {
  const sig = await suite.finalize(b.pk, b.token, bytes(blindSig), b.inv);
  if (!(await suite.verify(b.pk, sig, b.token))) throw new Error("credential does not verify");
  return { token: hex(b.token), sig: hex(sig) };
}

/** Builds and sends a vote; returns the HTTP status, the body and the receipt. */
export async function cast(reception: Hono, votingId: string, cred: Credential, answers: Record<string, string>, headers: Record<string, string> = {}) {
  const vote = { answers, s: hex(crypto.getRandomValues(new Uint8Array(32))), sig: cred.sig, token: cred.token, voting_id: votingId };
  const res = await reception.request("/cast", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(vote) });
  const body = await res.json();
  return { status: res.status, body, vote, receipt: { ...vote, ack: voteAck(vote), type: "receipt", version: 1 }, headers: res.headers };
}
