"""Synthetic learner generator. Single source of truth for training data and DB seeding.

All data produced here is simulated. Never present it as real user behaviour.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURES = [
    "avg_quiz_score",
    "quizzes_taken",
    "lessons_completed",
    "streak_days",
    "avg_session_minutes",
    "days_since_last_active",
    "tutor_questions",
    "hint_requests",
]
TRACKS = ["python", "web", "ml"]
FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Arjun", "Ananya", "Vihaan", "Sara",
         "Neel", "Tara", "Dev", "Riya", "Aditya", "Kavya", "Yash", "Nisha", "Karan", "Pooja"]
LAST = ["Sharma", "Rao", "Nair", "Iyer", "Gowda", "Patel", "Reddy", "Menon", "Shetty", "Kulkarni"]
WEEKS = 12


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate_learners(n: int = 600, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    motivation = rng.beta(2, 2, n)
    skill = np.clip(0.55 * motivation + 0.45 * rng.beta(2, 2, n), 0, 1)

    df = pd.DataFrame(
        {
            "avg_quiz_score": np.clip(35 + 55 * skill + rng.normal(0, 7, n), 0, 100),
            "quizzes_taken": rng.poisson(2 + 10 * motivation),
            "lessons_completed": rng.poisson(1 + 8 * motivation),
            "streak_days": rng.poisson(1 + 9 * motivation**2),
            "avg_session_minutes": np.clip(rng.normal(10 + 35 * motivation, 6), 3, 90),
            "days_since_last_active": np.clip(rng.exponential(1 + 14 * (1 - motivation)), 0, 60).astype(int),
            "tutor_questions": rng.poisson(1 + 8 * motivation),
            "hint_requests": rng.poisson(1 + 6 * (1 - skill)),
        }
    )
    p_drop = _sigmoid(7 * (0.42 - motivation) + rng.normal(0, 0.6, n))
    df["dropped_out"] = (rng.random(n) < p_drop).astype(int)
    df["_motivation"] = motivation
    return df


def weekly_engagement(motivation: float, dropped: int, rng: np.random.Generator) -> list[float]:
    base = 40 + 140 * motivation
    trend = (motivation - 0.5) * 8
    series = []
    for w in range(WEEKS):
        v = base + trend * w + rng.normal(0, 10)
        if dropped and w > WEEKS * 0.6:
            v *= max(0.1, 1 - 0.18 * (w - WEEKS * 0.6))
        series.append(round(float(max(0, v)), 1))
    return series


def build_learner_records(n: int = 120, seed: int = 7) -> list[dict]:
    """Records used to seed the database (names, tracks, stats, weekly engagement)."""
    rng = np.random.default_rng(seed)
    df = generate_learners(n, seed)
    records = []
    for i, row in df.iterrows():
        first, last = FIRST[i % len(FIRST)], LAST[(i * 3) % len(LAST)]
        stats = {
            "avgQuizScore": round(float(row.avg_quiz_score), 1),
            "quizzesTaken": int(row.quizzes_taken),
            "lessonsCompleted": int(row.lessons_completed),
            "streakDays": int(row.streak_days),
            "avgSessionMinutes": round(float(row.avg_session_minutes), 1),
            "daysSinceLastActive": int(row.days_since_last_active),
            "tutorQuestions": int(row.tutor_questions),
            "hintRequests": int(row.hint_requests),
            "weeklyEngagement": weekly_engagement(float(row._motivation), int(row.dropped_out), rng),
        }
        records.append(
            {
                "name": f"{first} {last}",
                "email": f"{first.lower()}.{last.lower()}{i}@example.com",
                "track": TRACKS[i % len(TRACKS)],
                "stats": stats,
            }
        )
    return records
