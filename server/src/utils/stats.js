const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Updates streak and last-active info. Call whenever a learner does something meaningful. */
export function touchActivity(user, now = new Date()) {
  const last = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
  const gapDays = last ? Math.round((startOfDay(now) - startOfDay(last)) / DAY) : null;
  if (gapDays === null || gapDays > 1) user.stats.streakDays = 1;
  else if (gapDays === 1) user.stats.streakDays = (user.stats.streakDays || 0) + 1;
  else user.stats.streakDays = Math.max(1, user.stats.streakDays || 0);
  user.stats.daysSinceLastActive = 0;
  user.lastActiveAt = now;
}

/** Folds a new quiz score (0-100) into the running average. */
export function recordQuiz(user, score) {
  const n = user.stats.quizzesTaken || 0;
  user.stats.avgQuizScore = Math.round((((user.stats.avgQuizScore || 0) * n + score) / (n + 1)) * 10) / 10;
  user.stats.quizzesTaken = n + 1;
}

export function userPublic(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    track: u.track,
    isDemo: !!u.isDemo,
    stats: u.stats,
  };
}
