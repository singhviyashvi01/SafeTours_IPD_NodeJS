"""
Shared-secret auth for the SafeTours scoring microservice.
Node's riskEngine.js must send the same key on every /score call
via the X-API-Key header.
"""
import os
from fastapi import Header, HTTPException, status

API_KEY = os.getenv("SAFETOURS_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "SAFETOURS_API_KEY not set in .env — service will refuse all requests. "
        "Add SAFETOURS_API_KEY=<some-long-random-string> to your .env file."
    )


async def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )