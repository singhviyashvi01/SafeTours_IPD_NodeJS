from news_service import get_news_status
import json

result = get_news_status()
print(json.dumps(result, indent=2))
