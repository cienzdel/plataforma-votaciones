"""Byte strings, hashes and the restricted canonical JSON profile (spec/formats.md §1)."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

MAX_INT = 2**53 - 1
_MEMBER = re.compile(r"[a-z][a-z0-9_@-]*")
_HEX = re.compile(r"(?:[0-9a-f]{2})*")
_ESCAPES = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r"}


class ProfileError(ValueError):
    """A value outside the restricted JSON profile."""


def H(*parts: bytes) -> bytes:
    """SHA-256 of the concatenation."""
    return hashlib.sha256(b"".join(parts)).digest()


def tag(t: str) -> bytes:
    """Domain-separation prefix utf8(t) ‖ 0x00."""
    return t.encode("ascii") + b"\x00"


def u64be(n: int) -> bytes:
    return n.to_bytes(8, "big")


def is_hex(value: Any, length: int | None = None) -> bool:
    """Lowercase hex of exactly `length` bytes (any length if None)."""
    return (
        isinstance(value, str)
        and _HEX.fullmatch(value) is not None
        and (length is None or len(value) == 2 * length)
    )


def unhex(value: str) -> bytes:
    if not is_hex(value):
        raise ValueError("invalid hex string")
    return bytes.fromhex(value)


def _escape(match: re.Match[str]) -> str:
    c = match.group(0)
    return _ESCAPES.get(c, "\\u%04x" % ord(c))


def jcs_text(value: Any) -> str:
    """RFC 8785 serialisation under the restricted profile. Raises ProfileError."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if type(value) is int:
        if abs(value) > MAX_INT:
            raise ProfileError("integer out of range")
        return str(value)
    if type(value) is str:
        if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise ProfileError("lone surrogate")
        return '"' + re.sub(r'[\x00-\x1f"\\]', _escape, value) + '"'
    if type(value) is list:
        return "[" + ",".join(jcs_text(v) for v in value) + "]"
    if type(value) is dict:
        for name in value:
            if type(name) is not str or _MEMBER.fullmatch(name) is None:
                raise ProfileError(f"member name outside the profile: {name!r}")
        return "{" + ",".join(jcs_text(n) + ":" + jcs_text(value[n]) for n in sorted(value)) + "}"
    raise ProfileError(f"value outside the profile: {type(value).__name__}")


def jcs(value: Any) -> bytes:
    return jcs_text(value).encode("utf-8")


def HJ(value: Any) -> bytes:
    """H(JCS(v))."""
    return H(jcs(value))


def hj_hex(value: Any) -> str:
    return HJ(value).hex()


def same(a: Any, b: Any) -> bool:
    """Equality of two JSON values under the profile (so that True never equals 1)."""
    try:
        return jcs_text(a) == jcs_text(b)
    except ProfileError:
        return False


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ProfileError("duplicate member name")
    return result


def _no_float(text: str) -> Any:
    raise ProfileError(f"number outside the profile: {text}")


def load_json(text: str) -> Any:
    """Parses JSON, rejecting floats, NaN/Infinity and duplicate member names."""
    return json.loads(text, object_pairs_hook=_no_duplicates, parse_float=_no_float, parse_constant=_no_float)
