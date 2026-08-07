"""
Reconstructed build_infra_scores.py (original lost — this replaces it).

Regenerates police_dist_m, hospital_dist_m, and infra_score for all hexes
in hex_scores_enriched.json. Requires infra_locations.json (from
fetch_infra_locations.py) in the same directory.

BANDING LOGIC (DISTANCE_BANDS-equivalent):
    component(dist_m) = min(dist_m / INFRA_SATURATION_M, 1.0)
    infra_score = POLICE_WEIGHT * component(police_dist_m)
                + HOSPITAL_WEIGHT * component(hospital_dist_m)

Calibrated against the one known real anchor point:
    police_dist_m=4691, hospital_dist_m=4122 -> infra_score=0.9 (actual data)
    This formula gives ~0.88 for that anchor. Lower INFRA_SATURATION_M
    (e.g. 4500) if you need a tighter match — see anchor check printed
    at the end of this script.
"""
import json
import numpy as np
from scipy.spatial import cKDTree

INFRA_SATURATION_M = 5000.0
POLICE_WEIGHT = 0.5
HOSPITAL_WEIGHT = 0.5
INFRA_FALLBACK = 0.5  # must match INFRA_FALLBACK in score_engine.py

EARTH_RADIUS_M = 6371000.0


def latlng_to_ecef(lat, lng):
    """Cartesian projection for spherical-correct KDTree nearest-neighbor search."""
    lat_r, lng_r = np.radians(lat), np.radians(lng)
    x = EARTH_RADIUS_M * np.cos(lat_r) * np.cos(lng_r)
    y = EARTH_RADIUS_M * np.cos(lat_r) * np.sin(lng_r)
    z = EARTH_RADIUS_M * np.sin(lat_r)
    return np.column_stack([x, y, z])


def infra_component(dist_m: float) -> float:
    return min(dist_m / INFRA_SATURATION_M, 1.0)


def main():
    with open("infra_locations.json") as f:
        locs = json.load(f)

    police_pts = np.array(locs["police"])
    hospital_pts = np.array(locs["hospital"])

    if len(police_pts) == 0 or len(hospital_pts) == 0:
        raise RuntimeError("infra_locations.json missing police or hospital points — rerun fetch_infra_locations.py")

    police_tree = cKDTree(latlng_to_ecef(police_pts[:, 0], police_pts[:, 1]))
    hospital_tree = cKDTree(latlng_to_ecef(hospital_pts[:, 0], hospital_pts[:, 1]))

    with open("hex_scores_enriched.json") as f:
        hex_data = json.load(f)

    # hex_scores_enriched.json is a LIST of record dicts, not a dict keyed by hex_id.
    # Adjust HEX_ID_FIELD below if your records use a different key name.
    HEX_ID_FIELD = "hex_id"

    if not isinstance(hex_data, list):
        raise RuntimeError(f"Expected hex_scores_enriched.json to be a list, got {type(hex_data)}")

    sample = hex_data[0]
    if HEX_ID_FIELD not in sample:
        raise RuntimeError(
            f"'{HEX_ID_FIELD}' not found in record. Available keys: {list(sample.keys())}. "
            f"Update HEX_ID_FIELD in this script to match."
        )

    hex_ids = [rec[HEX_ID_FIELD] for rec in hex_data]
    centers_xyz = latlng_to_ecef(
        np.array([rec["lat"] for rec in hex_data]),
        np.array([rec["lng"] for rec in hex_data]),
    )

    police_dist, _ = police_tree.query(centers_xyz)
    hospital_dist, _ = hospital_tree.query(centers_xyz)

    for rec, p_dist, h_dist in zip(hex_data, police_dist, hospital_dist):
        score = (
            POLICE_WEIGHT * infra_component(p_dist)
            + HOSPITAL_WEIGHT * infra_component(h_dist)
        )
        rec["police_dist_m"] = round(float(p_dist), 1)
        rec["hospital_dist_m"] = round(float(h_dist), 1)
        rec["infra_score"] = round(float(score), 4)

    with open("hex_scores_enriched.json", "w") as f:
        json.dump(hex_data, f)

    print(f"Updated {len(hex_ids)} hexes")
    print(f"police_dist_m  min/max/mean: {police_dist.min():.0f} / {police_dist.max():.0f} / {police_dist.mean():.0f}")
    print(f"hospital_dist_m min/max/mean: {hospital_dist.min():.0f} / {hospital_dist.max():.0f} / {hospital_dist.mean():.0f}")

    anchor = POLICE_WEIGHT * infra_component(4691) + HOSPITAL_WEIGHT * infra_component(4122)
    print(f"Anchor check: dist(4691, 4122) -> {anchor:.3f} (target: 0.9)")


if __name__ == "__main__":
    main()