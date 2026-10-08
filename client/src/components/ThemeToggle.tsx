import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ showLabel = true }: { showLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className="theme-toggle" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggle}>
      <span className="tg-track">
        <span className="tg-knob">{dark ? <Moon size={13} aria-hidden /> : <Sun size={13} aria-hidden />}</span>
      </span>
      {showLabel && <span className="tg-label">{dark ? 'Dark mode' : 'Light mode'}</span>}
    </button>
  );
}
