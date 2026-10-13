"""Assent deadlines and outcome (spec/methods.md §7) and timestamps (spec/formats.md §1.5)."""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")


def parse_timestamp(value: Any) -> datetime:
    """Parses `YYYY-MM-DDTHH:MM:SSZ`. Raises ValueError."""
    if type(value) is not str or _TIMESTAMP.fullmatch(value) is None:
        raise ValueError("invalid timestamp")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def is_timestamp(value: Any) -> bool:
    try:
        parse_timestamp(value)
        return True
    except ValueError:
        return False


def unix(value: str) -> int:
    return int(parse_timestamp(value).timestamp())


def format_timestamp(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def min_close(sent_at: str, tz: str, min_days: int) -> str:
    """23:59:00 local time on the local date of `sent_at` plus `min_days` days, in UTC."""
    if type(min_days) is not int or min_days < 0:
        raise ValueError("invalid number of days")
    zone = ZoneInfo(tz)
    day = parse_timestamp(sent_at).astimezone(zone).date() + timedelta(days=min_days)
    return format_timestamp(datetime.combine(day, time(23, 59), tzinfo=zone))


def outcome(objections: int) -> str:
    if type(objections) is not int or objections < 0:
        raise ValueError("invalid number of objections")
    return "approved" if objections == 0 else "next_plenary"
