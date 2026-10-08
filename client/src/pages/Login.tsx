import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Flame } from 'lucide-react';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../hooks/useAuth';
import type { Track } from '../types';

// A row of tiles along the bottom that "fire" one after another, like a kiln warming up.
// A few stay cool, like lessons not started yet. It plays once and respects reduced motion.
const FIRE = ['#ff8a3d', '#ffc43d', '#ff5a7a', '#ff8a3d', '#7b4dff', '#ffc43d', '#3b6cff', '#14c48c'];
const TILES = Array.from({ length: 30 }, (_, i) => ({
  c: i % 7 === 3 || i % 11 === 6 ? 'var(--line)' : FIRE[(i * 3 + Math.floor(i / 5)) % FIRE.length],
}));

const TRACKS: { id: Track; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'web', label: 'Web' },
  { id: 'ml', label: 'Machine learning' },
];

export default function Login() {
  const { login, register, guest } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', track: 'python' as Track });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signingIn = mode === 'login';

  const run = async (fn: () => Promise<void>, to = '/') => {
    setBusy(true);
    setError('');
    try {
      await fn();
      nav(to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => (signingIn ? login(form.email, form.password) : register(form.name, form.email, form.password, form.track)));
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const switchTo = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
  };

  return (
    <div className="gate">
      <header className="gate-top">
        <span className="gate-brand"><Logo size={36} /> Kiln</span>
        <ThemeToggle showLabel={false} />
      </header>

      <main className="gate-stage">
        <h1>Build skills that hold.</h1>
        <p className="lead">A tutor that reads your course notes, code that gets graded, and quizzes that fit your level.</p>

        <section className="arch" aria-labelledby="gate-title">
          <span className="arch-seal" aria-hidden="true"><Flame size={26} /></span>

          <div className="seg-toggle" role="group" aria-label="Sign in or create an account">
            <button type="button" aria-pressed={signingIn} onClick={() => switchTo('login')}>Sign in</button>
            <button type="button" aria-pressed={!signingIn} onClick={() => switchTo('register')}>Create account</button>
          </div>

          <form className="gate-form" onSubmit={submit}>
            <h2 id="gate-title">{signingIn ? 'Welcome back' : 'Start your first firing'}</h2>

            {!signingIn && (
              <label className="field">Name<input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} /></label>
            )}
            <label className="field">Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
            <label className="field">
              Password
              <span className="pw">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={signingIn ? 'current-password' : 'new-password'}
                  required
                  minLength={signingIn ? 1 : 8}
                />
                <button type="button" className="pw-eye" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </span>
              {!signingIn && <span className="hint-text">At least 8 characters.</span>}
            </label>

            {!signingIn && (
              <fieldset className="track-fieldset">
                <legend>Learning track</legend>
                <div className="track-chips">
                  {TRACKS.map((t) => (
                    <label key={t.id} className="track-chip" data-track={t.id}>
                      <input type="radio" name="track" value={t.id} checked={form.track === t.id} onChange={set('track')} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn wide" disabled={busy}>{signingIn ? 'Sign in' : 'Create account'}</button>
          </form>
        </section>

        <div className="gate-demo">
          <p>Just looking? Try it without an account.</p>
          <div className="row">
            <button className="btn ghost" disabled={busy} onClick={() => run(() => guest('student'))}>Student demo</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(() => guest('teacher'), '/teacher')}>Teacher demo</button>
          </div>
          <p className="fine">Demo learners and their activity are simulated for this portfolio project.</p>
        </div>
      </main>

      <div className="fire-row" aria-hidden="true">
        {TILES.map((t, i) => (
          <i key={i} style={{ '--c': t.c, '--i': i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
