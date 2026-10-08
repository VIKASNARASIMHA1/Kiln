"""Tabular Q-learning exercise-difficulty scheduler, trained in a simulated student environment.

State  : learner skill bucket (0..4)
Action : difficulty level (1 easy, 2 medium, 3 hard)
Reward : simulated learning gain, minus a penalty when the exercise is far too hard.
"""
from __future__ import annotations

import numpy as np

N_BUCKETS = 5
DIFFICULTY_LEVEL = np.array([0.25, 0.55, 0.85])  # skill each level targets
N_ACTIONS = 3


def bucket(skill: float) -> int:
    return int(min(N_BUCKETS - 1, max(0, skill * N_BUCKETS)))


def _step(skill: float, a: int, rng: np.random.Generator):
    p_success = 1 / (1 + np.exp(-9 * (skill - DIFFICULTY_LEVEL[a] + 0.1)))
    success = rng.random() < p_success
    gain = 0.05 * np.exp(-((p_success - 0.7) ** 2) / (2 * 0.15**2)) * (1.0 if success else 0.7)
    reward = gain * 10 - (0.6 if p_success < 0.25 else 0.0)
    return min(1.0, skill + gain), float(reward)


class DifficultyScheduler:
    def __init__(self, episodes: int = 4000, steps: int = 25, seed: int = 0):
        self.q = np.zeros((N_BUCKETS, N_ACTIONS))
        self.rng = np.random.default_rng(seed)
        self._train(episodes, steps)

    def _train(self, episodes: int, steps: int):
        alpha, gamma = 0.15, 0.9
        for ep in range(episodes):
            eps = max(0.05, 1.0 - ep / (episodes * 0.7))
            skill = float(self.rng.uniform(0, 0.9))
            for _ in range(steps):
                s = bucket(skill)
                a = int(self.rng.integers(N_ACTIONS)) if self.rng.random() < eps else int(np.argmax(self.q[s]))
                skill, r = _step(skill, a, self.rng)
                s2 = bucket(skill)
                self.q[s, a] += alpha * (r + gamma * self.q[s2].max() - self.q[s, a])

    def difficulty_for(self, avg_score: float) -> dict:
        s = bucket(avg_score / 100.0)
        a = int(np.argmax(self.q[s]))
        return {"difficulty": a + 1, "state": s, "q_values": [round(float(v), 3) for v in self.q[s]]}

    def policy(self) -> list[int]:
        return [int(np.argmax(self.q[s])) + 1 for s in range(N_BUCKETS)]
