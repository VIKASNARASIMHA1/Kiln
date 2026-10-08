import type { LessonCard, Track } from '../types';

/** One tile per lesson, wider for harder lessons: empty, quiz taken, or completed in the track colour. */
export default function TemperStrip({ lessons, track }: { lessons: LessonCard[]; track?: Track }) {
  return (
    <div data-track={track}>
      <div className="temper" role="img" aria-label={`${lessons.filter((l) => l.completed).length} of ${lessons.length} lessons completed`}>
        {lessons.map((l) => (
          <span
            key={l.id}
            className={l.completed ? 'seg done' : l.bestScore !== null ? 'seg tried' : 'seg'}
            style={{ flexGrow: l.difficulty }}
            title={`${l.title}${l.bestScore !== null ? ` · best ${l.bestScore}%` : ''}`}
          />
        ))}
      </div>
      <div className="temper-legend">
        <span><i className="seg" /> Not started</span>
        <span><i className="seg tried" /> Quiz taken</span>
        <span><i className="seg done" /> Completed</span>
      </div>
    </div>
  );
}
