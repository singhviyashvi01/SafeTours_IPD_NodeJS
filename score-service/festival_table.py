"""
Hardcoded festival multiplier table.

ASSUMPTION (flagged for Arpita to confirm/replace):
  This is a placeholder set of Mumbai festival date ranges. Port your real
  table here if you already built one in the Flask backend — the shape
  just needs to stay {date_range: multiplier}.

Multiplier is applied ONLY to crowd_score() and community_report_score()
output, per locked decision — festivals are not a new weight category.
"""

from datetime import date

# (start_date, end_date, multiplier) — inclusive range, IST calendar dates
FESTIVAL_TABLE: list[tuple[date, date, float]] = [
    # Ganesh Chaturthi + visarjan window — dense crowds, elevated report volume
    (date(2026, 9, 14), date(2026, 9, 20), 1.3),
    # Navratri / Dandiya nights
    (date(2026, 10, 11), date(2026, 10, 20), 1.2),
    # Diwali
    (date(2026, 11, 8), date(2026, 11, 12), 1.25),
    # New Year's Eve crowding (Marine Drive / Gateway corridor)
    (date(2026, 12, 31), date(2026, 12, 31), 1.15),
]


def festival_multiplier(on_date: date) -> float:
    """Returns 1.0 (no adjustment) if on_date isn't in any festival window."""
    for start, end, mult in FESTIVAL_TABLE:
        if start <= on_date <= end:
            return mult
    return 1.0
