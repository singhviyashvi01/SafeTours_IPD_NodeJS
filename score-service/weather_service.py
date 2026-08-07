"""
weather_service.py

Ported from old weather_layer.py — same OWM condition-code buckets and
heat/visibility/wind penalties, scaled 0.0-1.0 -> 0-100.

Deliberately NOT merged with news delta here (old code did
`combined_weather = weather + events["delta"]` before scoring — that
tangled two of the new engine's separate 7-factor weights together).
Per the locked weighting, weather and news are independent factors now.

NOTE: uses `requests`, which blocks. Call this via asyncio.to_thread()
from main.py — never await it directly. Same reasoning as db.py's
aiosqlite-only rule: a blocking network call inside an async route stalls
every other request on this event loop.
"""

import os
import requests
OWM_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_API_KEY = os.environ.get("OWM_API_KEY")

CONDITION_SCORE = {
    800: 0.0, 801: 0.1, 802: 0.1, 803: 0.2, 804: 0.2,
    300: 0.3, 301: 0.3, 302: 0.4, 310: 0.3, 311: 0.3, 312: 0.4,
    313: 0.4, 314: 0.4, 321: 0.3,
    500: 0.4, 501: 0.5, 502: 0.7, 503: 0.8, 504: 0.9, 511: 0.6,
    520: 0.4, 521: 0.5, 522: 0.7, 531: 0.6,
    200: 0.7, 201: 0.8, 202: 0.9, 210: 0.6, 211: 0.7, 212: 0.9,
    221: 0.8, 230: 0.7, 231: 0.8, 232: 0.9,
    600: 0.4, 601: 0.5, 602: 0.7, 611: 0.5, 612: 0.5, 613: 0.6,
    615: 0.4, 616: 0.5, 620: 0.4, 621: 0.6, 622: 0.8,
    701: 0.4, 711: 0.6, 721: 0.3, 731: 0.5, 741: 0.5,
    751: 0.5, 761: 0.5, 762: 0.7, 771: 0.8, 781: 1.0,
}


def get_weather_score(lat: float, lng: float) -> float:
    """Returns 0-100. Falls back to neutral 50.0 on any API failure so the
    rest of the score doesn't break if OWM is unreachable or times out."""
    try:
        resp = requests.get(
            OWM_URL,
            params={"lat": lat, "lon": lng, "appid": OWM_API_KEY, "units": "metric"},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()

        condition_id = data["weather"][0]["id"]
        temp_c = data["main"]["temp"]
        wind_mps = data["wind"]["speed"]
        visibility_m = data.get("visibility", 10000)

        base = CONDITION_SCORE.get(condition_id, 0.3)  # unknown code -> mild caution

        heat_penalty = 0.15 if temp_c >= 42 else 0.08 if temp_c >= 38 else 0.0
        visibility_penalty = 0.15 if visibility_m < 500 else 0.08 if visibility_m < 1000 else 0.0
        wind_penalty = 0.15 if wind_mps >= 20 else 0.08 if wind_mps >= 15 else 0.0

        final = min(1.0, base + heat_penalty + visibility_penalty + wind_penalty)
        return round(final * 100, 2)

    except requests.exceptions.RequestException:
        return 50.0
