from fastapi import APIRouter, Request

from app.models.recommender import similar_lessons
from app.schemas.api import DifficultyRequest, SimilarRequest

router = APIRouter(prefix="/recommend", tags=["recommend"])


@router.post("/difficulty")
def difficulty(body: DifficultyRequest, request: Request):
    return request.app.state.scheduler.difficulty_for(body.avg_score)


@router.post("/similar")
def similar(body: SimilarRequest):
    return {"results": similar_lessons([l.model_dump() for l in body.lessons], body.completed_ids, body.k)}
