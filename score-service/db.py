"""
aiosqlite connection scaffold — this is the SAME pattern Phase 7 (SMS queue)
and Phase 9 (dedup) will reuse in this same standalone service.

CRITICAL: always aiosqlite, never stdlib sqlite3 — sqlite3 is blocking and
will stall the FastAPI event loop under concurrent requests.

/score itself needs no persistence today (community_reports and crowd_count
arrive live from Node each call). This file exists now so Phase 7/9 slot in
without restructuring anything.
"""

import aiosqlite
from contextlib import asynccontextmanager

DB_PATH = "safetours_service.db"


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        # Placeholder table — Phase 7 will add sms_queue, Phase 9 will add
        # a dedup table. Nothing reads/writes this yet.
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS service_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )
        await db.commit()


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    try:
        yield db
    finally:
        await db.close()
