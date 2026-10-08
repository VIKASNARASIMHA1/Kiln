import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import LevelTag from '../components/LevelTag';
import TrackIcon from '../components/TrackIcon';
import type { LessonCard, Track } from '../types';
import { trackName } from '../utils/format';

interface Detail {
  course: { id: string; title: string; track: Track; description: string };
  lessons: LessonCard[];
}

export default function Course() {
  const { courseId } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Detail>(`/courses/${courseId}`).then(setData).catch((e: Error) => setError(e.message));
  }, [courseId]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Loading course…</p>;
  return (
    <div data-track={data.course.track}>
      <p className="muted"><Link to="/">Dashboard</Link> / {trackName[data.course.track]}</p>
      <header className="course-head">
        <span className="course-ic"><TrackIcon track={data.course.track} size={30} /></span>
        <div>
          <h1>{data.course.title}</h1>
          <p>{data.course.description}</p>
        </div>
      </header>
      <ol className="lesson-list">
        {data.lessons.map((l) => (
          <li key={l.id} className={l.completed ? 'done' : ''}>
            <span><Link to={`/lessons/${l.id}`}>{l.title}</Link><LevelTag level={l.difficulty} /></span>
            <span className="muted">
              {l.completed ? 'Completed' : l.bestScore !== null ? `Best quiz ${l.bestScore}%` : 'Not started'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
