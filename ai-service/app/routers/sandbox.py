import hmac
import os
import sys

from fastapi import APIRouter, Depends, Header, HTTPException

from app.sandbox import runner
from app.schemas.api import GradeRequest

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


def _enabled() -> bool:
    return os.getenv("SANDBOX_ENABLED", "1").lower() not in ("0", "false", "no")


def require_access(x_sandbox_token: str | None = Header(default=None)):
    if not _enabled():
        raise HTTPException(503, "Code execution is disabled on this server")
    expected = os.getenv("SANDBOX_TOKEN", "")
    if expected and not hmac.compare_digest(expected, x_sandbox_token or ""):
        raise HTTPException(401, "Invalid sandbox token")


@router.get("/status")
def status():
    return {
        "enabled": _enabled(),
        "platform": sys.platform,
        "limitsEnforced": runner.limits_enforced(),
        "maxConcurrent": runner.MAX_CONCURRENT,
        "tokenRequired": bool(os.getenv("SANDBOX_TOKEN")),
    }


# Plain `def` so FastAPI runs it in a worker thread and the event loop stays free.
@router.post("/grade", dependencies=[Depends(require_access)])
def grade(body: GradeRequest):
    try:
        return runner.run_grade(body.code, body.function, [t.model_dump() for t in body.tests], body.timeout)
    except runner.SandboxBusy:
        raise HTTPException(503, "The code runner is busy. Try again in a moment.")
    except ValueError as e:
        raise HTTPException(422, str(e))
