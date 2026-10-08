import { Router } from 'express';
import { listLearners } from '../db/users.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { forecastEngagement, predictDropoutBatch } from '../services/aiClient.js';

const router = Router();
router.use(requireAuth, requireRole('teacher', 'admin'));

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

export function aggregateWeekly(students) {
  const weeks = Math.max(0, ...students.map((s) => s.stats?.weeklyEngagement?.length || 0));
  return Array.from({ length: weeks }, (_, w) =>
    round1(mean(students.map((s) => s.stats?.weeklyEngagement?.[w]).filter((v) => typeof v === 'number')))
  );
}

router.get('/overview', async (_req, res) => {
  const students = await listLearners();
  const { results, source } = await predictDropoutBatch(students.map((s) => s.stats));

  const scored = students.map((s, i) => ({ s, r: results[i] }));
  const dist = { low: 0, medium: 0, high: 0 };
  scored.forEach(({ r }) => (dist[r.risk] += 1));

  const byTrack = ['python', 'web', 'ml'].map((track) => {
    const group = students.filter((s) => s.track === track && s.stats?.quizzesTaken > 0);
    return { track, students: students.filter((s) => s.track === track).length, avgScore: round1(mean(group.map((s) => s.stats.avgQuizScore))) };
  });

  const history = aggregateWeekly(students);
  const fc = history.length ? await forecastEngagement(history, 4) : { forecast: [], trend: 'flat' };

  res.json({
    totals: {
      students: students.length,
      atRisk: dist.high,
      avgScore: round1(mean(students.filter((s) => s.stats?.quizzesTaken > 0).map((s) => s.stats.avgQuizScore))),
      avgStreak: round1(mean(students.map((s) => s.stats?.streakDays || 0))),
    },
    riskDistribution: [
      { label: 'Low', count: dist.low },
      { label: 'Medium', count: dist.medium },
      { label: 'High', count: dist.high },
    ],
    byTrack,
    engagement: {
      history: history.map((value, i) => ({ week: `W${i + 1}`, value })),
      forecast: fc.forecast.map((value, i) => ({ week: `W${history.length + i + 1}`, value })),
      trend: fc.trend,
    },
    atRisk: scored
      .filter(({ r }) => r.risk === 'high')
      .sort((a, b) => b.r.probability - a.r.probability)
      .slice(0, 10)
      .map(({ s, r }) => ({
        id: s.id,
        name: s.name,
        track: s.track,
        probability: r.probability,
        drivers: r.drivers,
        daysSinceLastActive: s.stats?.daysSinceLastActive || 0,
        avgScore: s.stats?.avgQuizScore || 0,
      })),
    source,
    note: 'Seeded learners are simulated. Predictions come from a model trained on simulated data.',
  });
});

export default router;
