from __future__ import annotations

import numpy as np


def _holt(y: np.ndarray, alpha: float, beta: float):
    level, trend = y[0], y[1] - y[0]
    sse = 0.0
    for t in range(1, len(y)):
        pred = level + trend
        sse += (y[t] - pred) ** 2
        new_level = alpha * y[t] + (1 - alpha) * (level + trend)
        trend = beta * (new_level - level) + (1 - beta) * trend
        level = new_level
    return level, trend, sse


def forecast(series: list[float], horizon: int = 4) -> dict:
    """Holt linear-trend exponential smoothing with a small grid search for alpha/beta."""
    y = np.asarray(series, dtype=float)
    if len(y) < 3:
        last = float(y[-1]) if len(y) else 0.0
        return {"forecast": [round(last, 1)] * horizon, "trend": "flat", "slope": 0.0}
    grid = [(a, b) for a in np.arange(0.1, 1.0, 0.1) for b in np.arange(0.1, 1.0, 0.1)]
    alpha, beta = min(grid, key=lambda ab: _holt(y, ab[0], ab[1])[2])
    level, trend, _ = _holt(y, alpha, beta)
    fc = [round(float(max(0.0, level + trend * (h + 1))), 1) for h in range(horizon)]
    rel = trend / (abs(y.mean()) + 1e-9)
    label = "rising" if rel > 0.02 else "falling" if rel < -0.02 else "flat"
    return {"forecast": fc, "trend": label, "slope": round(float(trend), 2)}
