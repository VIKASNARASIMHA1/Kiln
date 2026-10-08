import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import Markdown from '../components/Markdown';
import { useAuth } from '../hooks/useAuth';
import type { ExerciseCard, LessonDetail } from '../types';
import LevelTag from '../components/LevelTag';

export default function Lesson() {
  const { lessonId } = useParams();
  const { refresh } = useAuth();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [exercises, setExercises] = useState<ExerciseCard[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setLesson(null);
    api<{ lesson: LessonDetail }>(`/lessons/${lessonId}`).then((r) => setLesson(r.lesson)).catch((e: Error) => setError(e.message));
    api<{ exercises: ExerciseCard[] }>(`/exercises/lesson/${lessonId}`).then((r) => setExercises(r.exercises)).catch(() => setExercises([]));
  }, [lessonId]);

  const complete = async () => {
    try {
      await api(`/lessons/${lessonId}/complete`, { method: 'POST' });
      setLesson((l) => (l ? { ...l, completed: true } : l));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save progress');
    }
  };

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!lesson) return <p className="muted">Loading lesson…</p>;
  return (
    <div className="split">
      <article>
        <p className="muted"><Link to={`/courses/${lesson.courseId}`}>Back to course</Link></p>
        <h1>{lesson.title}</h1>
        <p><LevelTag level={lesson.difficulty} /> {lesson.topics?.join(', ')}</p>
        <Markdown source={lesson.body} />
        {exercises.length > 0 && (
          <section className="practice">
            <h2>Practice</h2>
            <ul>
              {exercises.map((e) => (
                <li key={e.id}>
                  <Link to={`/exercises/${e.id}`}>{e.title}</Link>
                  <LevelTag level={e.difficulty} />
                  <span className={e.solved ? 'solved-text' : 'muted'}>{e.solved ? 'Solved' : e.attempts ? `${e.attempts} attempt${e.attempts > 1 ? 's' : ''}` : 'Not started'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="row">
          <Link className="btn" to={`/quiz/${lesson.id}`}>Take the quiz</Link>
          <button className="btn ghost" onClick={complete} disabled={lesson.completed}>
            {lesson.completed ? 'Completed' : 'Mark as complete'}
          </button>
        </div>
      </article>
      <aside>
        <h2>Ask about this lesson</h2>
        <ChatPanel lessonId={lesson.id} suggestions={['Explain this in simpler words', 'Give me a short example']} />
      </aside>
    </div>
  );
}
