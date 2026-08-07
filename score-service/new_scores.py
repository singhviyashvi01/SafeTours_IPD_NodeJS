"""
The two new scoring functions for the merged 7-factor engine.
Both take LIVE values from Node — no independent computation, no DB reads
for the score itself (per locked decision).
"""

from datetime import datetime, timezone
from festival_table import festival_multiplier
from models import CommunityReport

# ---------------------------------------------------------------------------
# crowd_score
# ---------------------------------------------------------------------------
# ASSUMPTION (flag this in your eval notes / confirm with team):
#   crowd_count = live count of app users detected in this hex cell right now.
#   Risk is U-shaped: too empty = isolation risk, too packed = pickpocketing /
#   crowd-crush risk. Middle band is safest.
#   Thresholds are placeholders — tune once you have real usage numbers.

CROWD_LOW = 3          # below this: isolation risk climbs
CROWD_HIGH = 40         # above this: overcrowding risk climbs
CROWD_ISOLATION_CAP = 70.0   # max score contribution from being alone
CROWD_OVERCROWD_CAP = 100.0  # max score contribution from overcrowding


def crowd_score(crowd_count: int, on_date: datetime | None = None) -> float:
    if crowd_count <= 0:
        base = CROWD_ISOLATION_CAP
    elif crowd_count < CROWD_LOW:
        # linear ramp down from isolation cap to near-zero as count approaches CROWD_LOW
        base = CROWD_ISOLATION_CAP * (1 - crowd_count / CROWD_LOW)
    elif crowd_count <= CROWD_HIGH:
        # safe middle band
        base = 10.0
    else:
        # overcrowding ramp — capped
        excess = crowd_count - CROWD_HIGH
        base = min(CROWD_OVERCROWD_CAP, 20.0 + excess * 1.5)

    mult = festival_multiplier((on_date or datetime.now(timezone.utc)).date())
    return round(min(base * mult, 100.0), 2)


# ---------------------------------------------------------------------------
# community_report_score
# ---------------------------------------------------------------------------
# Gate: verified == True only.
# Guard: MIN_VERIFIED_REPORTS before reports can swing the score hard —
#   protects against one compromised/malicious account spiking a zone.
# Recency: reports decay linearly over RECENCY_WINDOW_HOURS.

MIN_VERIFIED_REPORTS = 3         # below this, contribution is dampened
RECENCY_WINDOW_HOURS = 24.0      # reports older than this contribute ~0
SEVERITY_SCALE = 20.0            # severity(1-5) * this = raw contribution per report


def _recency_weight(ts: datetime, now: datetime) -> float:
    age_hours = max(0.0, (now - ts).total_seconds() / 3600.0)
    if age_hours >= RECENCY_WINDOW_HOURS:
        return 0.0
    return 1.0 - (age_hours / RECENCY_WINDOW_HOURS)


def community_report_score(
    reports: list[CommunityReport],
    now: datetime | None = None,
    on_date: datetime | None = None,
) -> float:
    now = now or datetime.now(timezone.utc)
    verified = [r for r in reports if r.verified]

    if not verified:
        return 0.0

    weighted_sum = 0.0
    weight_total = 0.0
    for r in verified:
        ts = r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)
        w = _recency_weight(ts, now)
        weighted_sum += r.severity * SEVERITY_SCALE * w
        weight_total += w

    if weight_total == 0:
        return 0.0

    raw_score = weighted_sum / weight_total  # 0-100 scale roughly (severity 5 * 20 = 100 max)

    # Guard: dampen if under the minimum verified-report count.
    # Below MIN_VERIFIED_REPORTS, scale contribution down proportionally
    # so a single report can never spike a zone to RED on its own.
    count = len(verified)
    if count < MIN_VERIFIED_REPORTS:
        damping = count / MIN_VERIFIED_REPORTS
        raw_score *= damping

    mult = festival_multiplier((on_date or now).date())
    return round(min(raw_score * mult, 100.0), 2)
