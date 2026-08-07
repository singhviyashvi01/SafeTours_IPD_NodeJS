"""
news_service.py

Ported + split from old event_layer.py's check_active_events(), which
tangled two mechanisms into one return value. Split per locked decision:

  - CRITICAL keywords -> hard cap. This is a short-circuit handled by
    main.py BEFORE compute_score() runs at all — it is not one of the
    7 weighted factors, same tier as the solo-traveller multiplier.
  - NON-CRITICAL keywords -> a delta (0.0-0.3), which IS the 7% "news"
    factor. normalize_news_delta() converts it to the engine's 0-100 scale.

Also NOT lat/lng-scoped — the underlying NewsAPI query is Mumbai-wide, same
as the old code. news_score(lat, lng) in the score_engine stub signature
doesn't apply cleanly here; see score_engine.py's comment on this.

BUG FIX: EVENT_TTL_HOURS existed in the old file but was never applied —
every query used a flat 24h NewsAPI window and nothing inside it ever
expired. Fixed here: fetch a window wide enough for the longer TTL (12h,
critical), then drop any matched article older than ITS OWN type's TTL —
non-critical events now expire at 6h even though the fetch window covers 12h.

NOTE: uses `requests`, which blocks. Call get_news_status() via
asyncio.to_thread() from main.py, same reasoning as weather_service.py.
"""

import requests
from datetime import datetime, timedelta, timezone

import os
NEWS_URL = "https://newsapi.org/v2/everything"
NEWS_API_KEY = os.environ.get("NEWS_API_KEY")

CRITICAL_KEYWORDS = [
    "riot", "flood", "landslide", "stampede", "explosion",
    "terrorist", "bomb", "shooting", "cyclone", "tsunami", "earthquake",
]
NON_CRITICAL_KEYWORDS = [
    "protest", "fire", "accident", "traffic block",
    "waterlogging", "strike", "road closed",
]
EVENT_TTL_HOURS = {"critical": 12, "non_critical": 6}


def _no_event() -> dict:
    return {"hard_cap": False, "delta": 0.0, "reason": None, "events": []}


def get_news_status(now: datetime | None = None) -> dict:
    """
    Single NewsAPI call. Returns:
        {
            "hard_cap": bool,      # True -> caller must force score to 100/RED
            "delta": 0.0-0.3,      # feeds normalize_news_delta() if not hard_cap
            "reason": str | None,
            "events": [...],
        }
    """
    now = now or datetime.now(timezone.utc)
    fetch_window = timedelta(hours=max(EVENT_TTL_HOURS.values()))  # 12h, covers both TTLs
    since = (now - fetch_window).strftime("%Y-%m-%dT%H:%M:%SZ")

    all_keywords = CRITICAL_KEYWORDS + NON_CRITICAL_KEYWORDS
    query = "Mumbai AND (" + " OR ".join(all_keywords) + ")"

    try:
        resp = requests.get(
            NEWS_URL,
            params={
                "q": query,
                "from": since,
                "sortBy": "publishedAt",
                "language": "en",
                "apiKey": NEWS_API_KEY,
            },
            timeout=5,
        )
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
    except requests.exceptions.RequestException:
        return _no_event()

    matched_critical = []
    matched_non_critical = []

    for article in articles:
        title = (article.get("title") or "").lower()
        description = (article.get("description") or "").lower()
        content = (article.get("content") or "").lower()
        text = title + " " + description + " " + content
        if "mumbai" not in text:
            continue

        published_raw = article.get("publishedAt")
        try:
            published = datetime.strptime(published_raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            age_hours = (now - published).total_seconds() / 3600.0
        except (TypeError, ValueError):
            age_hours = 0.0  # unparsable timestamp -> treat as fresh rather than silently drop

        matched = False
        for kw in CRITICAL_KEYWORDS:
            if kw in text and age_hours <= EVENT_TTL_HOURS["critical"]:
                matched_critical.append({
                    "keyword": kw,
                    "title": article.get("title"),
                    "published": published_raw,
                    "source": article.get("source", {}).get("name"),
                })
                matched = True
                break

        if matched:
            continue

        for kw in NON_CRITICAL_KEYWORDS:
            if kw in text and age_hours <= EVENT_TTL_HOURS["non_critical"]:
                matched_non_critical.append({
                    "keyword": kw,
                    "title": article.get("title"),
                    "published": published_raw,
                    "source": article.get("source", {}).get("name"),
                })
                break

    if matched_critical:
        top = matched_critical[0]
        return {
            "hard_cap": True,
            "delta": 0.0,
            "reason": f"{top['keyword'].upper()} reported near Mumbai ({top['source']})",
            "events": matched_critical,
        }

    if matched_non_critical:
        delta = min(0.3, len(matched_non_critical) * 0.1)
        top = matched_non_critical[0]
        return {
            "hard_cap": False,
            "delta": round(delta, 2),
            "reason": f"{top['keyword'].capitalize()} reported near Mumbai ({top['source']})",
            "events": matched_non_critical,
        }

    return _no_event()


def normalize_news_delta(delta: float) -> float:
    """delta comes from get_news_status() (0.0-0.3). This produces the
    actual 0-100 news_score the 7% weight multiplies against."""
    return round(min(1.0, delta / 0.3) * 100, 2)
