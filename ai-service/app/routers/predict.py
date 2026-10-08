from fastapi import APIRouter, Request

from app.schemas.api import BatchRequest, LearnerFeatures

router = APIRouter(prefix="/predict", tags=["predict"])


@router.post("/dropout")
def dropout(body: LearnerFeatures, request: Request):
    return request.app.state.predictor.predict(body.model_dump())


@router.post("/dropout/batch")
def dropout_batch(body: BatchRequest, request: Request):
    p = request.app.state.predictor
    return {"results": [p.predict(l.model_dump()) for l in body.learners]}
