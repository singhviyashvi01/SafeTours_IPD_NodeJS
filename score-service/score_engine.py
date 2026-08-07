"""
Merged 7-factor SafeTours score engine.

Weights (locked):
  crime 35% | time 15% | community_reports 15% | crowd 10%
  infra 10% | weather 8% | news 7%

Architecture note: weather and news both require blocking network calls
(OpenWeatherMap, NewsAPI). Per db.py's async-safety rule, those calls are
made in main.py via asyncio.to_thread() and their RESULTS are passed into
compute_score() as weather_val / news_delta. compute_score() itself stays
synchronous with zero network calls — no event-loop risk, and it's
trivially unit-testable without mocking HTTP.

This is why news_score(lat, lng) from the original stub signature doesn't
survive as-is: the old event_layer.py query was Mumbai-wide, not per-hex,
and the hard-cap half of it is a short-circuit that main.py handles BEFORE
compute_score() is ever called (per the locked decision, same tier as the
solo-traveller multiplier). What's left here is normalize_news_delta(),
a pure function of the delta already fetched once in main.py.
"""

from datetime import datetime, timezone
from models import CommunityReport
from new_scores import crowd_score, community_report_score
from hex_data import get_hex_record
from time_service import time_score
from news_service import normalize_news_delta

WEIGHTS = {
    "crime": 0.35,
    "time": 0.15,
    "community_reports": 0.15,
    "crowd": 0.10,
    "infra": 0.10,
    "weather": 0.08,
    "news": 0.07,
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "weights must sum to 1.0"

ZONE_THRESHOLDS = (
    (30, "GREEN"),
    (55, "YELLOW"),
    (75, "ORANGE"),
    (100, "RED"),
)


def classify_zone(score: float) -> str:
    for upper, label in ZONE_THRESHOLDS:
        if score <= upper:
            return label
    return "RED"


# --- crime / infra: hex-lookup based ---------------------------------------
# ASSUMPTION (flag for Arpita — none of the files I had contained the old
# score_engine.py's real crime formula or crime_severity's actual scale):
# this weighting is a placeholder so the service runs end-to-end. Confirm
# crime_severity's real range (0-1? 0-5?) and swap these constants for your
# real formula before the eval if you have it — don't ship this as-is
# without checking.

CRIME_COUNT_SCALE = 5.0     # points per incident before capping
CRIME_COUNT_CAP = 70.0
CRIME_SEVERITY_WEIGHT = 30.0
CRIME_FALLBACK = 50.0       # neutral score when hex_id isn't in the dataset

INFRA_FALLBACK = 50.0       # matches old DEFAULT_INFRA_SCORE=0.5 * 100


def crime_score(lat: float, lng: float) -> float:
    """
    Crime component, 0-100. Combined via the locked 35% crime weight
    in compute_score() — this function does NOT apply that weight itself.

    Ported directly from rebuild_hex_crime.py's crime_only_score():
        crime_count_norm = min(crime_count / 10.0, 1.0)
        crime_score_01   = (crime_count_norm * 0.6) + (crime_severity * 0.4)

    Note: crime_count is a per-hex AVERAGE (region total crimes / hex count
    in that region) from rebuild_hex_crime.py Step 3, not a raw incident
    count for that specific cell. crime_severity is a fixed 0-1 constant
    per region (0.35-0.82), not measured per-hex.
    """
    record = get_hex_record(lat, lng)
    if record is None:
        return 50.0  # neutral fallback, no hex data for this coordinate

    crime_count = record.get("crime_count", 0)
    crime_severity = record.get("crime_severity", 0.5)

    crime_count_norm = min(crime_count / 10.0, 1.0)
    crime_score_01 = (crime_count_norm * 0.6) + (crime_severity * 0.4)

    return round(crime_score_01 * 100, 2)
# Reconstructed infra distance-banding constants — original DISTANCE_BANDS
# script was lost; see build_infra_scores.py for the offline generation logic.
INFRA_SATURATION_M = 5000.0
POLICE_WEIGHT = 0.5
HOSPITAL_WEIGHT = 0.5

def infra_score(lat: float, lng: float) -> float:
    record = get_hex_record(lat, lng)
    if record is None or record.get("infra_score") is None:
        return INFRA_FALLBACK
    # hex data stores infra_score 0.0-1.0, already risk-oriented (higher =
    # farther from police/hospital = riskier), per build_infra_scores.py's
    # DISTANCE_BANDS. So this is just a straight scale-up, no inversion.
    return round(min(100.0, max(0.0, record["infra_score"] * 100)), 2)


# --- MERGE -------------------------------------------------------------------

def compute_score(
    lat: float,
    lng: float,
    crowd_count: int,
    community_reports: list[CommunityReport],
    weather_val: float,
    news_delta: float,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    fallback = get_hex_record(lat, lng) is None
    breakdown = {
        "crime": crime_score(lat, lng),
        "time": time_score(now),
        "community_reports": community_report_score(community_reports, now=now),
        "crowd": crowd_score(crowd_count, on_date=now),
        "infra": infra_score(lat, lng),
        "weather": weather_val,
        "news": normalize_news_delta(news_delta),
    }

    total = sum(breakdown[factor] * weight for factor, weight in WEIGHTS.items())
    total = round(min(max(total, 0.0), 100.0), 2)

    return {
        "score": total,
        "zone": classify_zone(total),
        "breakdown": breakdown,
        "fallback": fallback,
    }
