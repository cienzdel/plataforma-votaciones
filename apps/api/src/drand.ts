/**
 * drand quicknet client (spec/draws.md §1). The server does not verify the BLS signature itself:
 * every verifier does, and `tools/verify` checks it on every published draw.
 */

/** Returns the round's signature (hex), or null if the round does not exist yet. */
export type DrandFetcher = (round: number) => Promise<string | null>;

const ENDPOINTS = ["https://api.drand.sh/v2/beacons/quicknet/rounds/", "https://api2.drand.sh/v2/beacons/quicknet/rounds/"];

export function drandClient(fetchFn: typeof fetch = fetch): DrandFetcher {
  return async (round) => {
    let lastError: unknown = null;
    for (const base of ENDPOINTS) {
      try {
        const res = await fetchFn(base + round, { cache: "no-store" });
        if (res.status === 404 || res.status === 425) return null;
        if (!res.ok) throw new Error("drand " + res.status);
        const body = (await res.json()) as { round: number; signature: string };
        if (body.round !== round || !/^[0-9a-f]{96}$/.test(body.signature)) throw new Error("drand: unexpected response");
        return body.signature;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  };
}
