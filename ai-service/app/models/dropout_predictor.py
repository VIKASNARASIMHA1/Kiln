from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.synthetic import FEATURES, generate_learners

MODEL_PATH = Path(__file__).resolve().parents[2] / "saved_models" / "dropout.joblib"
LABELS = {
    "avg_quiz_score": "low quiz scores",
    "quizzes_taken": "few quizzes taken",
    "lessons_completed": "few lessons completed",
    "streak_days": "short activity streak",
    "avg_session_minutes": "short study sessions",
    "days_since_last_active": "long time since last activity",
    "tutor_questions": "few tutor questions",
    "hint_requests": "many hint requests",
}


class DropoutPredictor:
    def __init__(self):
        self.pipe: Pipeline | None = None
        self.metrics: dict = {}

    def fit(self, df: pd.DataFrame):
        X, y = df[FEATURES], df["dropped_out"]
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
        self.pipe = Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))])
        self.pipe.fit(X_tr, y_tr)
        auc = roc_auc_score(y_te, self.pipe.predict_proba(X_te)[:, 1])
        self.metrics = {"auc": round(float(auc), 3), "train_rows": int(len(X_tr)), "test_rows": int(len(X_te)),
                        "data": "synthetic"}
        return self

    def predict(self, features: dict) -> dict:
        assert self.pipe is not None
        x = pd.DataFrame([{f: float(features.get(f, 0)) for f in FEATURES}])
        prob = float(self.pipe.predict_proba(x)[0, 1])
        scaled = self.pipe.named_steps["scale"].transform(x)[0]
        contrib = self.pipe.named_steps["clf"].coef_[0] * scaled  # positive pushes risk up
        order = np.argsort(contrib)[::-1][:3]
        drivers = [{"feature": FEATURES[i], "label": LABELS[FEATURES[i]], "impact": round(float(contrib[i]), 3)}
                   for i in order if contrib[i] > 0]
        risk = "high" if prob >= 0.66 else "medium" if prob >= 0.33 else "low"
        return {"probability": round(prob, 3), "risk": risk, "drivers": drivers}

    def save(self):
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"pipe": self.pipe, "metrics": self.metrics}, MODEL_PATH)

    @classmethod
    def load_or_train(cls) -> "DropoutPredictor":
        obj = cls()
        if MODEL_PATH.exists():
            try:
                data = joblib.load(MODEL_PATH)
                obj.pipe, obj.metrics = data["pipe"], data["metrics"]
                return obj
            except Exception:
                pass
        obj.fit(generate_learners(1500, seed=42))
        try:
            obj.save()
        except OSError:
            pass
        return obj
