"""
Fetch police stations and hospitals in Mumbai via OpenStreetMap Overpass API.
Run once. Saves results to infra_locations.json. No API key needed.
"""
import requests
import json

# overpass-api.de's main instance has been bouncing script-like requests (HTTP 406)
# since it started filtering out non-browser traffic. Try mirrors in order.
OVERPASS_MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

HEADERS = {
    "User-Agent": "SafeTours-InfraScoreBuilder/1.0 (academic IPD project; contact: student)",
    "Accept": "application/json",
}

# Mumbai bounding box (south, west, north, east) — generous, covers full metro area
BBOX = (18.85, 72.75, 19.30, 73.05)

QUERY_TEMPLATE = """
[out:json][timeout:60];
(
  node["amenity"="{amenity}"]({bbox});
  way["amenity"="{amenity}"]({bbox});
);
out center;
"""


def fetch_amenity(amenity: str):
    bbox_str = ",".join(str(x) for x in BBOX)
    query = QUERY_TEMPLATE.format(amenity=amenity, bbox=bbox_str)

    last_error = None
    for mirror in OVERPASS_MIRRORS:
        try:
            print(f"  trying {mirror} ...")
            resp = requests.post(mirror, data={"data": query}, headers=HEADERS, timeout=90)
            resp.raise_for_status()
            data = resp.json()
            coords = []
            for el in data.get("elements", []):
                if el["type"] == "node":
                    coords.append((el["lat"], el["lon"]))
                elif "center" in el:
                    coords.append((el["center"]["lat"], el["center"]["lon"]))
            return coords
        except requests.exceptions.RequestException as e:
            print(f"  {mirror} failed: {e}")
            last_error = e
            continue

    raise RuntimeError(f"All Overpass mirrors failed. Last error: {last_error}")


def main():
    print("Fetching police stations...")
    police = fetch_amenity("police")
    print(f"  {len(police)} police locations")

    print("Fetching hospitals...")
    hospital = fetch_amenity("hospital")
    print(f"  {len(hospital)} hospital locations")

    if len(police) < 20 or len(hospital) < 20:
        print("WARNING: suspiciously low count — check the bbox or query before trusting this data.")

    with open("infra_locations.json", "w") as f:
        json.dump({"police": police, "hospital": hospital}, f)

    print("Saved to infra_locations.json")


if __name__ == "__main__":
    main()