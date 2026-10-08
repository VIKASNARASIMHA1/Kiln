from fastapi import APIRouter

from app.models.engagement_forecast import forecast
from app.schemas.api import ForecastRequest

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/engagement")
def engagement(body: ForecastRequest):
    return forecast(body.series, body.horizon)
