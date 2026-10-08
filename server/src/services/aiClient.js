import { env } from '../config/env.js';

async function post(path, body, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.aiServiceUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ai-service ${path} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const toFeatures = (s = {}) => ({
  avg_quiz_score: s.avgQuizScore || 0,
  quizzes_taken: s.quizzesTaken || 0,
  lessons_completed: s.lessonsCompleted || 0,
  streak_days: s.streakDays || 0,
  avg_session_minutes: s.avgSessionMinutes || 0,
  days_since_last_active: s.daysSinceLastActive || 0,
  tutor_questions: s.tutorQuestions || 0,
  hint_requests: s.hintRequests || 0,
});

/** Rule-of-thumb fallback used only when the AI service is unreachable. */
export function heuristicRisk(stats = {}) {
  const inactive = Math.min(1, (stats.daysSinceLastActive || 0) / 21);
  const weak = 1 - Math.min(1, (stats.avgQuizScore || 0) / 100);
  const lowStreak = 1 - Math.min(1, (stats.streakDays || 0) / 7);
  const probability = Math.round((0.5 * inactive + 0.25 * weak + 0.25 * lowStreak) * 1000) / 1000;
  const risk = probability >= 0.66 ? 'high' : probability >= 0.33 ? 'medium' : 'low';
  return { probability, risk, drivers: [] };
}

export async function predictDropoutBatch(statsList) {
  try {
    const { results } = await post('/predict/dropout/batch', { learners: statsList.map(toFeatures) });
    return { results, source: 'model' };
  } catch (e) {
    console.warn('AI service unavailable, using heuristic risk:', e.message);
    return { results: statsList.map(heuristicRisk), source: 'heuristic' };
  }
}

export async function recommendDifficulty(avgScore) {
  try {
    return { ...(await post('/recommend/difficulty', { avg_score: avgScore })), source: 'rl' };
  } catch {
    const difficulty = avgScore < 45 ? 1 : avgScore < 75 ? 2 : 3;
    return { difficulty, source: 'rule' };
  }
}

export async function similarLessons(lessons, completedIds, k = 3) {
  try {
    const { results } = await post('/recommend/similar', { lessons, completed_ids: completedIds, k });
    return results;
  } catch {
    return [];
  }
}

export async function forecastEngagement(series, horizon = 4) {
  try {
    return { ...(await post('/forecast/engagement', { series, horizon })), source: 'model' };
  } catch {
    const last = series.at(-1) ?? 0;
    return { forecast: Array(horizon).fill(last), trend: 'flat', slope: 0, source: 'fallback' };
  }
}
