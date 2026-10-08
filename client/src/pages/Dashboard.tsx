import { BookOpen, Code, Flame, MessageCircle, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import LevelTag from '../components/LevelTag';
import TemperStrip from '../components/TemperStrip';
import TrackIcon from '../components/TrackIcon';
import { useAuth } from '../hooks/useAuth';
import type { CourseSummary, LessonCard, NextRec } from '../types';
import { trackName } from '../utils/format';

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [rec, setRec] = useState<NextRec | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    refresh();
    Promise.all([
      api<{ courses: CourseSummary[] }>('/courses'),
      api<{ lessons: LessonCard[] }>('/progress'),
      api<NextRec>('/recommend/next'),
    ])
      .then(([c, p, r]) => {
        setCourses(c.courses);
        setLessons(p.lessons);
        setRec(r);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const s = user.stats;
  const stats = [
    { label: 'quiz average', value: s.quizzesTaken ? `${Math.round(s.avgQuizScore)}%` : '–', tone: 'blue', Icon: Target },
    { label: 'day streak', value: String(s.streakDays), tone: 'orange', Icon: Flame },
    { label: 'lessons completed', value: String(s.lessonsCompleted), tone: 'mint', Icon: BookOpen },
    { label: 'exercises solved', value: String(s.exercisesSolved ?? 0), tone: 'violet', Icon: Code },
    { label: 'tutor questions', value: String(s.tutorQuestions), tone: 'coral', Icon: MessageCircle },
  ];

  return (
    <>
      <header className="banner" data-track={user.track}>
        <div>
          <h1>Hi, {user.name.split(' ')[0]}</h1>
          <p>Your track: {trackName[user.track]}</p>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}

      <dl className="statline">
        {stats.map(({ label, value, tone, Icon }) => (
          <div key={label} className={`stat tone-${tone}`}>
            <span className="stat-ic"><Icon size={22} aria-hidden /></span>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="panel">
        <h2>Your track progress</h2>
        {lessons.length ? <TemperStrip lessons={lessons} track={user.track} /> : <p className="muted">Loading your lessons…</p>}
      </section>

      <section className="panel next">
        <h2>Up next</h2>
        {rec?.next ? (
          <>
            <p className="next-title">
              <Link to={`/lessons/${rec.next.id}`}>{rec.next.title}</Link>
              <LevelTag level={rec.next.difficulty} />
            </p>
            <p className="muted">{rec.reason}</p>
            {rec.related && rec.related.length > 0 && (
              <p className="muted">Related: {rec.related.map((r) => r.title).join(', ')}</p>
            )}
          </>
        ) : (
          <p className="muted">{rec?.message ?? 'Finding your next lesson…'}</p>
        )}
      </section>

      <section>
        <h2>Courses</h2>
        <ul className="courses course-grid">
          {courses.map((c) => (
            <li key={c.id} data-track={c.track}>
              <Link to={`/courses/${c.id}`} className="course-card">
                <span className="course-ic"><TrackIcon track={c.track} size={26} /></span>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
                <span className="bar" aria-hidden="true"><i style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} /></span>
                <span className="count">{c.done}/{c.total} done</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
