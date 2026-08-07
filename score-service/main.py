"""
SafeTours scoring microservice.
Standalone FastAPI service, port 8000. Node's riskEngine.js calls POST /score
over HTTP — no shared code, no shared DB.

Run (PowerShell, from score-service/ with venv active):
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
from dotenv import load_dotenv
load_dotenv()  # load .env before importing weather_service/news_service
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from auth import verify_api_key
from models import ScoreRequest, ScoreResponse, ScoreBreakdown
from score_engine import compute_score, classify_zone
from weather_service import get_weather_score
from news_service import get_news_status
from db import init_db

# Tunable — applied to the final aggregate only, never folded into the 7
# weights and never touching crowd_score(), per locked decision.
SOLO_MULTIPLIER = 1.08

# Used when the news hard-cap fires: we skip the weighted formula entirely,
# so there's no real per-factor breakdown to report — this is just a
# contract-shaped placeholder that makes the override visible in the
# response (news=100 signals "this is why").
HARD_CAP_BREAKDOWN = ScoreBreakdown(
    crime=0.0, time=0.0, community_reports=0.0, crowd=0.0,
    infra=0.0, weather=0.0, news=100.0,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SafeTours Score Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/score", response_model=ScoreResponse, dependencies=[Depends(verify_api_key)])
async def score(req: ScoreRequest):
    # weather_service and news_service both do blocking `requests` calls —
    # run them off the event loop, same reasoning as db.py's aiosqlite-only
    # rule (a blocking network call here would stall every other request).
    weather_val, news_status = await asyncio.gather(
        asyncio.to_thread(get_weather_score, req.lat, req.lng),
        asyncio.to_thread(get_news_status),
    )

    # Hard cap short-circuits BEFORE the weighted formula runs at all —
    # same tier as the solo-traveller multiplier, per locked decision.
    if news_status["hard_cap"]:
        return ScoreResponse(score=100.0, zone="RED", breakdown=HARD_CAP_BREAKDOWN, fallback=False)

    try:
        result = compute_score(
            lat=req.lat,
            lng=req.lng,
            crowd_count=req.crowd_count,
            community_reports=req.community_reports,
            weather_val=weather_val,
            news_delta=news_status["delta"],
        )
    except NotImplementedError as e:
        # shouldn't trigger anymore now that the stubs are ported — kept as
        # a safety net in case a factor gets reverted to a stub mid-edit
        raise HTTPException(status_code=501, detail=str(e))

    final_score = result["score"]
    if req.solo:
        final_score = round(min(100.0, final_score * SOLO_MULTIPLIER), 2)

    return ScoreResponse(
        score=final_score,
        zone=classify_zone(final_score),
        breakdown=ScoreBreakdown(**result["breakdown"]),
        fallback=result["fallback"],
    )
