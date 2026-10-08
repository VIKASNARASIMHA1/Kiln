import type { Track } from '../types';

export const trackName: Record<Track, string> = { python: 'Python', web: 'Full stack web', ml: 'Machine learning' };
export const levelName = (d: number) => (d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard');
export const pct = (p: number) => `${Math.round(p * 100)}%`;
