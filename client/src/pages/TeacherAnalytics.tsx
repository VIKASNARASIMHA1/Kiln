import { BarChart3, Flame, Target, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { EngagementLine, RiskBars, TrackScores } from '../components/Charts';
import type { Analytics } from '../types';
import { pct, trackName } from '../utils/format';

export default function TeacherAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Analytics>('/analytics/overview').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Crunching the numbers…</p>;
  const t = data.totals;

  return (
    <>
      <header className="page-head">
        <h1>Class analytics</h1>
        <p className="muted">{data.note}</p>
        {data.source === 'heuristic' && <p className="error">The AI service is offline, so risk scores use simple rules instead of the model.</p>}
      </header>

      <dl className="statline">
        <div className="stat tone-blue"><span className="stat-ic"><Users size={22} aria-hidden /></span><dt>learners</dt><dd>{t.students}</dd></div>
        <div className="stat tone-coral"><span className="stat-ic"><Flame size={22} aria-hidden /></span><dt>at high risk of dropping out</dt><dd>{t.atRisk}</dd></div>
        <div className="stat tone-mint"><span className="stat-ic"><Target size={22} aria-hidden /></span><dt>average quiz score</dt><dd>{t.avgScore}%</dd></div>
        <div className="stat tone-sun"><span className="stat-ic"><BarChart3 size={22} aria-hidden /></span><dt>average streak (days)</dt><dd>{t.avgStreak}</dd></div>
      </dl>

      <div className="grid2">
        <section className="panel"><h2>Dropout risk</h2><RiskBars data={data.riskDistribution} /></section>
        <section className="panel"><h2>Quiz scores by track</h2><TrackScores data={data.byTrack} /></section>
      </div>

      <section className="panel">
        <h2>Weekly engagement and 4-week forecast</h2>
        <p className="muted">Overall engagement is {data.engagement.trend}.</p>
        <EngagementLine data={data.engagement} />
      </section>

      <section className="panel">
        <h2>Learners to contact first</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Learner</th><th>Track</th><th>Risk</th><th>Days inactive</th><th>Quiz avg</th><th>Main drivers</th></tr>
            </thead>
            <tbody>
              {data.atRisk.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{trackName[s.track]}</td>
                  <td><strong>{pct(s.probability)}</strong></td>
                  <td>{s.daysSinceLastActive}</td>
                  <td>{Math.round(s.avgScore)}%</td>
                  <td>{s.drivers.map((d) => d.label).join(', ') || '–'}</td>
                </tr>
              ))}
              {!data.atRisk.length && <tr><td colSpan={6} className="muted">No learners are at high risk right now.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
