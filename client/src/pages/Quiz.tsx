import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { QuizQuestion, QuizResult } from '../types';

interface Generated {
  attemptId: string;
  lessonTitle: string;
  source: 'llm' | 'bank';
  questions: QuizQuestion[];
}

export default function Quiz() {
  const { lessonId } = useParams();
  const { refresh } = useAuth();
  const [quiz, setQuiz] = useState<Generated | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; results: QuizResult[] } | null>(null);
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    api<Generated>('/quiz/generate', { method: 'POST', body: { lessonId } })
      .then((q) => {
        setQuiz(q);
        setAnswers(q.questions.map(() => -1));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, [lessonId]);

  const submit = async () => {
    if (!quiz) return;
    setBusy(true);
    try {
      setResult(await api(`/quiz/${quiz.attemptId}/submit`, { method: 'POST', body: { answers } }));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit');
    } finally {
      setBusy(false);
    }
  };

  const explainMistake = async (i: number) => {
    if (!quiz) return;
    try {
      const r = await api<{ explanation: string }>('/quiz/explain', { method: 'POST', body: { attemptId: quiz.attemptId, questionIndex: i } });
      setExplain((p) => ({ ...p, [i]: r.explanation }));
    } catch (e) {
      setExplain((p) => ({ ...p, [i]: e instanceof Error ? e.message : 'Could not load an explanation' }));
    }
  };

  if (error) return (<><p className="error" role="alert">{error}</p><Link to={`/lessons/${lessonId}`}>Back to the lesson</Link></>);
  if (!quiz) return <p className="muted">Preparing your quiz…{slow && ' An AI model is writing the questions, which can take up to a minute on a local model.'}</p>;

  return (
    <>
      <header className="page-head">
        <p className="muted"><Link to={`/lessons/${lessonId}`}>Back to the lesson</Link></p>
        <h1>Quiz: {quiz.lessonTitle}</h1>
        <p className="muted">{quiz.source === 'llm' ? 'Questions written by the AI from this lesson.' : 'Questions from the lesson question bank.'}</p>
      </header>
      {result && (
        <div className="score" role="status">
          <strong>{result.score}%</strong> {result.score >= 80 ? 'Strong result.' : result.score >= 50 ? 'Getting there. Review the explanations below.' : 'Review the lesson and try again.'}
        </div>
      )}
      <ol className="quiz">
        {quiz.questions.map((q, i) => {
          const r = result?.results[i];
          return (
            <li key={i}>
              <fieldset disabled={!!result}>
                <legend>{q.prompt}</legend>
                {q.options.map((o, k) => {
                  const cls = r ? (k === r.answer ? 'opt right' : k === r.chosen ? 'opt wrong' : 'opt') : 'opt';
                  return (
                    <label key={k} className={cls}>
                      <input type="radio" name={`q${i}`} checked={answers[i] === k} onChange={() => setAnswers(answers.map((a, j) => (j === i ? k : a)))} />
                      {o}
                    </label>
                  );
                })}
              </fieldset>
              {r && (
                <div className="why">
                  <p>{r.correct ? 'Correct. ' : r.chosen === -1 ? 'Skipped. ' : 'Not quite. '}{r.explanation}</p>
                  {!r.correct && r.chosen !== -1 && !explain[i] && (
                    <button className="link" onClick={() => explainMistake(i)}>Explain my mistake</button>
                  )}
                  {explain[i] && <p className="tutor-note">{explain[i]}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!result ? (
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit answers'}</button>
      ) : (
        <div className="row">
          <Link className="btn" to="/">Back to dashboard</Link>
          <button className="btn ghost" onClick={() => window.location.reload()}>Try a new quiz</button>
        </div>
      )}
    </>
  );
}
