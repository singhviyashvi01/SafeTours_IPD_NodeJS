"""
hex_data.py

Loads the enriched hex dataset once at import time and exposes a
lat/lng -> hex record lookup. Mirrors the old Flask main.py's HEX_LOOKUP
pattern (built from build_infra_scores.py's output: hex_scores_enriched.json).

ASSUMPTION: resolution 9 was the old service's H3_RESOLUTION. If your real
cell resolution differs, change H3_RESOLUTION below.

If the data file is missing, import still succeeds with an empty lookup —
crime_score()/infra_score() fall back to neutral defaults rather than
crashing the service on startup.
"""

import json
import os
import h3

H3_RESOLUTION = 9
_HEX_FILE = os.getenv("HEX_DATA_FILE", "hex_scores_enriched.json")


def _load_hex_lookup() -> dict:
    if not os.path.exists(_HEX_FILE):
        return {}
    with open(_HEX_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)
    return {item["hex_id"]: item for item in records}


HEX_LOOKUP: dict = _load_hex_lookup()


def get_hex_record(lat: float, lng: float) -> dict | None:
    hex_id = h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
    return HEX_LOOKUP.get(hex_id)
