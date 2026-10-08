"""Retrain and cache models: python -m app.training.train_all"""
from app.models.dropout_predictor import DropoutPredictor
from app.models.rl_scheduler import DifficultyScheduler
from app.synthetic import generate_learners

if __name__ == "__main__":
    p = DropoutPredictor().fit(generate_learners(1500, seed=42))
    p.save()
    print("dropout model:", p.metrics)
    print("RL policy (difficulty per skill bucket 0-4):", DifficultyScheduler().policy())
