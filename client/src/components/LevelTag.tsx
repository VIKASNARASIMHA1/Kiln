import { levelName } from '../utils/format';

export default function LevelTag({ level }: { level: number }) {
  return <span className={`tag lvl-${level}`}>{levelName(level)}</span>;
}
