"""drand quicknet and verifiable draws (spec/draws.md)."""

from __future__ import annotations

import hashlib

from py_ecc.bls.g2_primitives import subgroup_check
from py_ecc.bls.hash import os2ip
from py_ecc.bls.hash_to_curve import hash_to_G1
from py_ecc.bls.point_compression import decompress_G1, decompress_G2
from py_ecc.optimized_bls12_381 import FQ12, G2, final_exponentiate, neg, pairing

from .canonical import H, tag, u64be

CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
PUBLIC_KEY = bytes.fromhex(
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d"
    "1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"
)
GENESIS = 1692803367
PERIOD = 3
DST = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"
LIVE_DELAY = 30


def round_time(r: int) -> int:
    if r < 1:
        raise ValueError("invalid round")
    return GENESIS + (r - 1) * PERIOD


def round_at(t: int) -> int:
    """First round at or after the Unix time t."""
    if t <= GENESIS:
        raise ValueError("time before drand genesis")
    return -(-(t - GENESIS) // PERIOD) + 1


def verify_beacon(r: int, signature: bytes) -> bool:
    """
    Verifies a quicknet beacon: a BLS signature on G1 over H(u64be(r)) with the network's G2 key,
    hash-to-curve per RFC 9380 (spec/draws.md §1). Uses py_ecc's curve operations.
    """
    if len(signature) != 48:
        return False
    try:
        sig = decompress_G1(os2ip(signature))
        pk = decompress_G2((os2ip(PUBLIC_KEY[:48]), os2ip(PUBLIC_KEY[48:])))
        if not subgroup_check(sig) or not subgroup_check(pk):
            return False
        point = hash_to_G1(H(u64be(r)), DST, hashlib.sha256)
        product = pairing(G2, sig, final_exponentiate=False) * pairing(neg(pk), point, final_exponentiate=False)
        return final_exponentiate(product) == FQ12.one()
    except (ValueError, TypeError):
        return False


def commitment(seed: bytes) -> bytes:
    return H(tag("pv/draw-commit/v1"), seed)


def randomness(signature: bytes) -> bytes:
    return H(signature)


def sigma(seed: bytes, rnd: bytes) -> bytes:
    return H(tag("pv/draw-seed/v1"), seed, rnd)


def shuffle(sig: bytes, ids: list[str]) -> tuple[list[str], int]:
    """Fisher–Yates over the ids sorted by UTF-8 bytes. Returns (order, blocks consumed)."""
    if len(set(ids)) != len(ids):
        raise ValueError("repeated items")
    items = sorted(ids, key=lambda s: s.encode("utf-8"))
    ctr = 0

    def uniform(n: int) -> int:
        nonlocal ctr
        limit = 2**64 - (2**64 % n)
        while True:
            block = H(tag("pv/draw-prng/v1"), sig, u64be(ctr))
            ctr += 1
            x = int.from_bytes(block[:8], "big")
            if x < limit:
                return x % n

    for i in range(len(items) - 1, 0, -1):
        j = uniform(i + 1)
        items[i], items[j] = items[j], items[i]
    return items, ctr

