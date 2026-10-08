import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


LOW = dict(avg_quiz_score=85, quizzes_taken=12, lessons_completed=9, streak_days=9,
           avg_session_minutes=40, days_since_last_active=0, tutor_questions=8, hint_requests=1)
HIGH = dict(avg_quiz_score=40, quizzes_taken=1, lessons_completed=0, streak_days=0,
            avg_session_minutes=6, days_since_last_active=30, tutor_questions=0, hint_requests=6)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_dropout_ordering_and_quality(client):
    lo = client.post("/predict/dropout", json=LOW).json()
    hi = client.post("/predict/dropout", json=HIGH).json()
    assert hi["probability"] > lo["probability"]
    assert hi["risk"] == "high" and lo["risk"] == "low"
    assert hi["drivers"]
    assert client.get("/models/info").json()["dropout"]["auc"] > 0.75


def test_batch_and_validation(client):
    r = client.post("/predict/dropout/batch", json={"learners": [LOW, HIGH]}).json()
    assert len(r["results"]) == 2
    assert client.post("/predict/dropout", json={**LOW, "avg_quiz_score": 500}).status_code == 422


def test_rl_difficulty_is_monotonic(client):
    levels = [client.post("/recommend/difficulty", json={"avg_score": s}).json()["difficulty"] for s in (5, 30, 50, 70, 95)]
    assert levels == sorted(levels)
    assert levels[0] < levels[-1]


def test_similar_lessons(client):
    lessons = [
        {"id": "a", "text": "python variables loops functions lists"},
        {"id": "b", "text": "python dictionaries and list comprehension functions"},
        {"id": "c", "text": "neural networks gradient descent training loss"},
    ]
    r = client.post("/recommend/similar", json={"lessons": lessons, "completed_ids": ["a"], "k": 2}).json()["results"]
    assert r[0]["id"] == "b"
    assert client.post("/recommend/similar", json={"lessons": lessons, "completed_ids": []}).json()["results"] == []


def test_forecast(client):
    up = client.post("/forecast/engagement", json={"series": [10, 14, 18, 22, 26, 30], "horizon": 3}).json()
    assert up["trend"] == "rising" and up["forecast"][0] > 30
    down = client.post("/forecast/engagement", json={"series": [60, 50, 42, 30, 22, 12], "horizon": 3}).json()
    assert down["trend"] == "falling"
    assert client.post("/forecast/engagement", json={"series": [5], "horizon": 2}).json()["trend"] == "flat"
