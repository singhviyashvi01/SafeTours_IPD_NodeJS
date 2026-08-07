"""
Pydantic models for the SafeTours scoring microservice.
Contract locked with Node team — do not change field names without
updating node_changes_log.md and telling the Node teammate.

CHANGE LOG: added `solo` to ScoreRequest (needed for the solo-traveller
final multiplier in main.py, per locked decision). This is a new field,
not a rename — should be low-risk for Node, but still log it and flag it
to your Node teammate before the eval so their payload includes it.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class CommunityReport(BaseModel):
    """One user-submitted danger report, as sent by Node."""
    severity: int = Field(..., ge=1, le=5, description="1 (minor) to 5 (severe)")
    timestamp: datetime = Field(..., description="ISO 8601, when the report was filed")
    verified: bool = Field(..., description="Node's verification flag — we trust this, no re-auth here")

    @field_validator("timestamp")
    @classmethod
    def timestamp_not_future(cls, v: datetime) -> datetime:
        # allow small clock drift between services, reject anything wildly in the future
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
        if v > now.replace(microsecond=0) and (v - now).total_seconds() > 300:
            raise ValueError("report timestamp is in the future")
        return v


class ScoreRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    crowd_count: int = Field(..., ge=0, description="live count of app users detected in this hex cell")
    community_reports: list[CommunityReport] = Field(default_factory=list)
    solo: bool = Field(
        False,
        description="True if the traveller is alone. Applies SOLO_MULTIPLIER to the "
                     "final aggregate score in main.py — not folded into the 7 weights.",
    )


class ScoreBreakdown(BaseModel):
    crime: float
    time: float
    community_reports: float
    crowd: float
    infra: float
    weather: float
    news: float


class ScoreResponse(BaseModel):
    score: float
    zone: str
    breakdown: ScoreBreakdown
    fallback: bool