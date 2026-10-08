from typing import Any

from pydantic import BaseModel, Field


class LearnerFeatures(BaseModel):
    avg_quiz_score: float = Field(0, ge=0, le=100)
    quizzes_taken: float = Field(0, ge=0)
    lessons_completed: float = Field(0, ge=0)
    streak_days: float = Field(0, ge=0)
    avg_session_minutes: float = Field(0, ge=0)
    days_since_last_active: float = Field(0, ge=0)
    tutor_questions: float = Field(0, ge=0)
    hint_requests: float = Field(0, ge=0)


class BatchRequest(BaseModel):
    learners: list[LearnerFeatures] = Field(max_length=2000)


class DifficultyRequest(BaseModel):
    avg_score: float = Field(ge=0, le=100)


class LessonText(BaseModel):
    id: str
    text: str


class SimilarRequest(BaseModel):
    lessons: list[LessonText]
    completed_ids: list[str] = []
    k: int = Field(3, ge=1, le=10)


class ForecastRequest(BaseModel):
    series: list[float] = Field(max_length=500)
    horizon: int = Field(4, ge=1, le=26)


class SandboxTest(BaseModel):
    args: list[Any] = []
    expected: Any = None


class GradeRequest(BaseModel):
    code: str = Field(max_length=20000)
    function: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
    tests: list[SandboxTest] = Field(min_length=1, max_length=40)
    timeout: float = Field(5.0, ge=1.0, le=10.0)
