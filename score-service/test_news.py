import requests, json

API_KEY = "04503749af994eb18637b7dc7f57e2a5"

keywords = ["riot","flood","landslide","stampede","explosion","terrorist","bomb",
            "shooting","cyclone","tsunami","earthquake","protest","fire","accident",
            "traffic block","waterlogging","strike","road closed"]
query = "Mumbai AND (" + " OR ".join(keywords) + ")"

r = requests.get(
    "https://newsapi.org/v2/everything",
    params={"q": query, "sortBy": "publishedAt", "language": "en", "apiKey": API_KEY},
)
print(json.dumps(r.json(), indent=2)[:2000])
