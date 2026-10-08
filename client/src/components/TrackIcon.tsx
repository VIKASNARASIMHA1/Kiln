import { BrainCircuit, Code, Globe } from 'lucide-react';
import type { Track } from '../types';

export default function TrackIcon({ track, size = 22 }: { track: Track; size?: number }) {
  const Icon = track === 'python' ? Code : track === 'web' ? Globe : BrainCircuit;
  return <Icon size={size} aria-hidden />;
}
