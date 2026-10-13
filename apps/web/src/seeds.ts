/**
 * Draw seeds of the officials (spec/draws.md §2). The seed never leaves this browser until it is
 * revealed; only its commitment is sent. The officials can also download it as a backup.
 */
import { drawCommitment, toHex } from "@pv/core";

export function newSeed(): { seed: string; commitment: string } {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const commitment = toHex(drawCommitment(seed));
  const hex = toHex(seed);
  try {
    localStorage.setItem("pv:seed:" + commitment, hex);
  } catch {
    // the officials must then keep the downloaded copy
  }
  return { seed: hex, commitment };
}

export function loadSeed(commitment: string): string | null {
  try {
    return localStorage.getItem("pv:seed:" + commitment);
  } catch {
    return null;
  }
}

export function seedFile(commitment: string, seed: string): string {
  return URL.createObjectURL(new Blob([JSON.stringify({ commitment, seed }, null, 2)], { type: "application/json" }));
}
