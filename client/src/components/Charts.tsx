import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import type { Analytics, Track } from '../types';
import { trackName } from '../utils/format';

// Recharts needs real colour values, so the palette mirrors the CSS tokens for each theme.
const PALETTE = {
  light: { edge: '#14163b', ink: '#14163b', muted: '#50557c', grid: '#d5dbf3', panel: '#ffffff', mint: '#14c48c', sun: '#ffc43d', coral: '#ff5a7a', blue: '#3b6cff', violet: '#7b4dff', orange: '#ff8a3d' },
  dark: { edge: '#5057b8', ink: '#f1f2ff', muted: '#a9aed8', grid: '#2c3162', panel: '#171a3a', mint: '#3ad9a4', sun: '#ffd25e', coral: '#ff7c95', blue: '#6c92ff', violet: '#a183ff', orange: '#ffa05c' },
};
const usePalette = () => PALETTE[useTheme().theme];

function tooltipStyle(p: (typeof PALETTE)['light']) {
  return { contentStyle: { background: p.panel, border: `2px solid ${p.edge}`, borderRadius: 12, color: p.ink }, labelStyle: { color: p.ink, fontWeight: 700 }, itemStyle: { color: p.ink }, cursor: { fill: p.grid, opacity: 0.4 } };
}

export function RiskBars({ data }: { data: Analytics['riskDistribution'] }) {
  const p = usePalette();
  const color: Record<string, string> = { Low: p.mint, Medium: p.sun, High: p.coral };
  const tick = { fontSize: 12, fill: p.muted };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="label" tick={tick} stroke={p.grid} />
        <YAxis allowDecimals={false} tick={tick} stroke={p.grid} />
        <Tooltip {...tooltipStyle(p)} />
        <Bar dataKey="count" name="Learners" radius={[8, 8, 0, 0]} stroke={p.edge} strokeWidth={2}>
          {data.map((d) => <Cell key={d.label} fill={color[d.label]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrackScores({ data }: { data: Analytics['byTrack'] }) {
  const p = usePalette();
  const color: Record<Track, string> = { python: p.blue, web: p.coral, ml: p.violet };
  const rows = data.map((d) => ({ ...d, name: trackName[d.track] }));
  const tick = { fontSize: 12, fill: p.muted };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="name" tick={tick} stroke={p.grid} />
        <YAxis domain={[0, 100]} tick={tick} stroke={p.grid} />
        <Tooltip {...tooltipStyle(p)} />
        <Bar dataKey="avgScore" name="Average quiz score" radius={[8, 8, 0, 0]} stroke={p.edge} strokeWidth={2}>
          {rows.map((r) => <Cell key={r.track} fill={color[r.track]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EngagementLine({ data }: { data: Analytics['engagement'] }) {
  const p = usePalette();
  const last = data.history[data.history.length - 1];
  const rows: { week: string; actual?: number; forecast?: number }[] = [
    ...data.history.map((h) => ({ week: h.week, actual: h.value })),
    ...data.forecast.map((f) => ({ week: f.week, forecast: f.value })),
  ];
  if (last && rows.length > data.history.length) rows[data.history.length - 1].forecast = last.value; // join the lines
  const tick = { fontSize: 12, fill: p.muted };
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="week" tick={tick} stroke={p.grid} />
        <YAxis tick={tick} stroke={p.grid} />
        <Tooltip {...tooltipStyle(p)} />
        <Legend wrapperStyle={{ color: p.ink }} />
        <Line type="monotone" dataKey="actual" name="Average minutes per week" stroke={p.blue} strokeWidth={3.5} dot={false} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke={p.orange} strokeWidth={3.5} strokeDasharray="7 5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
