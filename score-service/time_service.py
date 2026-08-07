"""
time_service.py

Ported from old time_layer.py. Bug fix applied: score_engine passes a
UTC-aware `now` (or naive, treated as UTC) — the old code read hour/weekday
straight off whatever tz it was given, which silently shifted every bucket
by 5.5 hours and misclassified weekday/weekend near midnight IST. Now we
always convert to Asia/Kolkata before bucketing.

Returns 0-100 (old layer was 0.0-1.0 — scaled to match the new engine's
0-100 breakdown fields).
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

MUMBAI_TZ = ZoneInfo("Asia/Kolkata")

# (start_hour, end_hour, score) — 24hr format, end exclusive
TIME_BUCKETS = [
    (5, 9, 0.2),
    (9, 13, 0.2),
    (13, 17, 0.3),
    (17, 20, 0.4),
    (20, 23, 0.6),
    (23, 24, 0.8),
    (0, 2, 0.9),
    (2, 5, 0.7),
]

DAY_MODIFIERS = {
    "weekday": 0.0,
    "weekend": 0.1,
    "holiday": 0.15,
    "festival": 0.2,
}

# (month, day, type, name)
# ASSUMPTION: dates ported as-is from the old table (originally labelled
# 2024-2025). Confirm/replace with 2026 dates before the eval if festival
# timing matters for your demo window.
MUMBAI_FESTIVALS = [
    (1, 26, "holiday", "Republic Day"),
    (2, 26, "festival", "Maha Shivratri"),
    (3, 14, "festival", "Holi"),
    (4, 14, "holiday", "Ambedkar Jayanti"),
    (4, 18, "holiday", "Good Friday"),
    (5, 1, "holiday", "Maharashtra Day"),
    (8, 15, "holiday", "Independence Day"),
    (8, 16, "festival", "Ganesh Chaturthi"),
    (8, 17, "festival", "Ganesh Chaturthi"),
    (8, 18, "festival", "Ganesh Chaturthi"),
    (8, 19, "festival", "Ganesh Chaturthi"),
    (8, 20, "festival", "Ganesh Chaturthi"),
    (8, 21, "festival", "Ganesh Chaturthi"),
    (8, 22, "festival", "Ganesh Chaturthi"),
    (8, 23, "festival", "Ganesh Chaturthi"),
    (8, 24, "festival", "Ganesh Chaturthi"),
    (8, 25, "festival", "Ganesh Chaturthi Visarjan"),
    (10, 2, "holiday", "Gandhi Jayanti"),
    (10, 20, "festival", "Navratri begins"),
    (10, 21, "festival", "Navratri"),
    (10, 22, "festival", "Navratri"),
    (10, 23, "festival", "Navratri"),
    (10, 24, "festival", "Navratri"),
    (10, 25, "festival", "Navratri"),
    (10, 26, "festival", "Navratri"),
    (10, 27, "festival", "Navratri"),
    (10, 28, "festival", "Navratri"),
    (10, 29, "festival", "Dussehra"),
    (11, 1, "festival", "Diwali"),
    (11, 2, "festival", "Diwali"),
    (11, 3, "festival", "Diwali — Lakshmi Puja"),
    (11, 4, "festival", "Diwali"),
    (11, 5, "festival", "Diwali"),
    (12, 25, "holiday", "Christmas"),
    (12, 31, "festival", "New Year's Eve"),
]


def time_score(now: datetime | None = None) -> float:
    if now is None:
        now = datetime.now(MUMBAI_TZ)
    else:
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        now = now.astimezone(MUMBAI_TZ)  # the bug fix — always convert, never assume

    hour = now.hour
    weekday = now.weekday()
    month, day = now.month, now.day

    bucket_score = 0.3
    for start, end, score in TIME_BUCKETS:
        if start <= hour < end:
            bucket_score = score
            break

    day_type = "weekday"
    for f_month, f_day, f_type, _name in MUMBAI_FESTIVALS:
        if month == f_month and day == f_day:
            day_type = f_type
            break
    if day_type == "weekday" and weekday >= 5:
        day_type = "weekend"

    final = min(1.0, bucket_score + DAY_MODIFIERS[day_type])
    return round(final * 100, 2)
