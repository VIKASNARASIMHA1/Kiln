import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import CodeEditor from '../components/CodeEditor';
import { useAuth } from '../hooks/useAuth';
import type { ExerciseDetail, RunResponse, TestResult } from '../types';
import LevelTag from '../components/LevelTag';

const show = (v: unknown) => JSON.stringify(v);
const call = (fn: string, args: unknown[]) => `${fn}(${args.map(show).join(', ')})`;

function Result({ r, fn }: { r: TestResult; fn: string }) {
  return (
    <li className={r.passed ? 't-pass' : 't-fail'}>
      <strong>{r.passed ? 'Passed' : 'Failed'}</strong> {r.label}
      {r.kind === 'visible' && (
        <div className="t-detail">
          <code>{call(fn, r.args ?? [])}</code> should give <code>{show(r.expected)}</code>
          {!r.passed && (r.error ? <> but raised <code>{r.error.type}: {r.error.message}</code>{r.error.line ? ` (line ${r.error.line})` : ''}</> : <> but gave <code>{r.got}</code></>)}
        </div>
      )}
      {r.kind === 'hidden' && !r.passed && r.error && <div className="t-detail">Your code raised <code>{r.error.type}</code> on this input.</div>}
    </li>
  );
}

export default function Exercise() {
  const { exerciseId } = useParams();
  const { refresh } = useAuth();
  const [ex, setEx] = useState<ExerciseDetail | null>(null);
  const [code, setCode] = useState('');
  const [out, setOut] = useState<(RunResponse & { mode: 'run' | 'submit' }) | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [busy, setBusy] = useState<'run' | 'submit' | 'hint' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ exercise: ExerciseDetail }>(`/exercises/${exerciseId}`)
      .then(({ exercise }) => {
        setEx(exercise);
        setCode(exercise.lastCode || exercise.starter);
        setHints(exercise.hintsShown);
      })
      .catch((e: Error) => setError(e.message));
  }, [exerciseId]);

  const execute = useCallback(
    async (mode: 'run' | 'submit') => {
      if (busy) return;
      setBusy(mode);
      setError('');
      try {
        const res = await api<RunResponse>(`/exercises/${exerciseId}/${mode}`, { method: 'POST', body: { code } });
        setOut({ ...res, mode });
        if (mode === 'submit') {
          setEx((e) => (e ? { ...e, solved: e.solved || !!res.solved, attempts: e.attempts + 1 } : e));
          if (res.newlySolved) refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setBusy(null);
      }
    },
    [busy, code, exerciseId, refresh]
  );

  const getHint = async () => {
    setBusy('hint');
    setError('');
    try {
      const r = await api<{ hint: string }>(`/exercises/${exerciseId}/hint`, { method: 'POST' });
      setHints((h) => [...h, r.hint]);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load a hint');
    } finally {
      setBusy(null);
    }
  };

  if (!ex) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Loading exercise…</p>;
  const left = ex.hintsTotal - hints.length;

  return (
    <>
      <p className="muted"><Link to={`/lessons/${ex.lessonId}`}>Back to the lesson</Link></p>
      <header className="page-head">
        <h1 className="ex-title">{ex.title} <LevelTag level={ex.difficulty} />{ex.solved && <span className="tag solved">Solved</span>}</h1>
      </header>
      <div className="ex-split">
        <section>
          <div className="prose">
            {ex.prompt.split('\n').map((line, i) => (
              <p key={i}>{line.split(/(`[^`]+`)/g).map((p, k) => (p.startsWith('`') && p.length > 2 ? <code key={k}>{p.slice(1, -1)}</code> : p))}</p>
            ))}
          </div>
          <h2>Examples</h2>
          <ul className="examples">
            {ex.visibleTests.map((t, i) => (
              <li key={i}><code>{call(ex.functionName, t.args)}</code> → <code>{show(t.expected)}</code></li>
            ))}
          </ul>
          <p className="muted">Submitting also checks hidden tests, so handle edge cases such as empty input.</p>

          <h2>Hints</h2>
          {hints.map((h, i) => <p key={i} className="hint"><strong>Hint {i + 1}.</strong> {h}</p>)}
          <button className="btn ghost" onClick={getHint} disabled={left <= 0 || busy !== null}>
            {left > 0 ? `Show a hint (${left} left)` : 'No more hints'}
          </button>
        </section>

        <section>
          <CodeEditor value={code} onChange={setCode} onRun={() => execute('run')} />
          <div className="row tight">
            <button className="btn" onClick={() => execute('run')} disabled={busy !== null}>{busy === 'run' ? 'Running…' : 'Run tests'}</button>
            <button className="btn ghost" onClick={() => execute('submit')} disabled={busy !== null}>{busy === 'submit' ? 'Submitting…' : 'Submit'}</button>
            <button className="link" onClick={() => { setCode(ex.starter); setOut(null); }}>Reset to starter</button>
          </div>
          <p className="fine">Ctrl+Enter runs the example tests. Your code runs in a separate, time-limited process on the server.</p>
          {error && <p className="error" role="alert">{error}</p>}

          {out && (
            <div className="results" role="status" aria-live="polite">
              {out.status === 'ok' ? (
                <>
                  <p className={out.mode === 'submit' && out.solved ? 'verdict ok' : 'verdict'}>
                    {out.mode === 'submit'
                      ? out.solved ? (out.newlySolved ? 'Solved. Nice work!' : 'All tests pass.') : `${out.passedCount} of ${out.total} tests pass.`
                      : `${out.passedCount} of ${out.total} example tests pass.`}
                  </p>
                  <ul className="tests">{out.results.map((r, i) => <Result key={i} r={r} fn={ex.functionName} />)}</ul>
                </>
              ) : (
                <p className="verdict bad">
                  {out.status === 'error' && <>{out.error?.type}: {out.error?.message}{out.error?.line ? ` (line ${out.error.line})` : ''}</>}
                  {(out.status === 'timeout' || out.status === 'crashed') && out.message}
                </p>
              )}
              {out.stdout && (<><h2>Your print output</h2><pre className="console">{out.stdout}{out.stdoutTruncated ? '\n… output cut off' : ''}</pre></>)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
