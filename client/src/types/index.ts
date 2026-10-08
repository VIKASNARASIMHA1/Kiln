export type Track = 'python' | 'web' | 'ml';

export interface Stats {
  avgQuizScore: number;
  quizzesTaken: number;
  lessonsCompleted: number;
  streakDays: number;
  avgSessionMinutes: number;
  daysSinceLastActive: number;
  tutorQuestions: number;
  hintRequests: number;
  exercisesSolved: number;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  track: Track;
  isDemo: boolean;
  stats: Stats;
}
export interface CourseSummary {
  id: string;
  title: string;
  track: Track;
  description: string;
  total: number;
  done: number;
}
export interface LessonCard {
  id: string;
  title: string;
  difficulty: number;
  order: number;
  topics?: string[];
  completed: boolean;
  bestScore: number | null;
}
export interface LessonDetail extends LessonCard {
  body: string;
  courseId: string;
}
export interface NextRec {
  next: { id: string; title: string; difficulty: number } | null;
  message?: string;
  reason?: string;
  source?: string;
  related?: { id: string; title: string; score: number }[];
}
export interface QuizQuestion {
  prompt: string;
  options: string[];
}
export interface QuizResult {
  correct: boolean;
  chosen: number;
  answer: number;
  explanation: string;
}
export interface Source {
  lessonId: string;
  title: string;
  snippet: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
  error?: boolean;
}
export interface Analytics {
  totals: { students: number; atRisk: number; avgScore: number; avgStreak: number };
  riskDistribution: { label: string; count: number }[];
  byTrack: { track: Track; students: number; avgScore: number }[];
  engagement: { history: { week: string; value: number }[]; forecast: { week: string; value: number }[]; trend: string };
  atRisk: {
    id: string;
    name: string;
    track: Track;
    probability: number;
    drivers: { feature: string; label: string; impact: number }[];
    daysSinceLastActive: number;
    avgScore: number;
  }[];
  source: 'model' | 'heuristic';
  note: string;
}

export interface ExerciseCard {
  id: string;
  title: string;
  difficulty: number;
  solved: boolean;
  attempts: number;
}
export interface ExerciseDetail {
  id: string;
  lessonId: string;
  title: string;
  difficulty: number;
  prompt: string;
  functionName: string;
  starter: string;
  visibleTests: { args: unknown[]; expected: unknown }[];
  hintsTotal: number;
  hintsShown: string[];
  solved: boolean;
  attempts: number;
  lastCode: string;
}
export interface TestResult {
  kind: 'visible' | 'hidden';
  label: string;
  args?: unknown[];
  expected?: unknown;
  got?: string | null;
  passed: boolean;
  error: { type?: string; message?: string; line?: number | null } | null;
}
export interface RunResponse {
  status: 'ok' | 'error' | 'timeout' | 'crashed';
  message: string | null;
  error: { type?: string; message?: string; line?: number | null } | null;
  stdout: string;
  stdoutTruncated: boolean;
  results: TestResult[];
  passedCount: number;
  total: number;
  solved?: boolean;
  newlySolved?: boolean;
}
