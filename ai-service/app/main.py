from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.models.dropout_predictor import DropoutPredictor
from app.models.rl_scheduler import DifficultyScheduler
from app.routers import forecast, predict, recommend, sandbox


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor = DropoutPredictor.load_or_train()
    app.state.scheduler = DifficultyScheduler()
    yield


app = FastAPI(title="Kiln AI Service", version="1.0.0", lifespan=lifespan)
app.include_router(predict.router)
app.include_router(recommend.router)
app.include_router(forecast.router)
app.include_router(sandbox.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/models/info")
def info():
    return {
        "dropout": app.state.predictor.metrics,
        "rl_policy_by_skill_bucket": app.state.scheduler.policy(),
        "note": "Models are trained on simulated learner data.",
    }
