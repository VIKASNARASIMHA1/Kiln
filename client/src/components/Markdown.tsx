import { ReactNode } from 'react';

const inline = (text: string): ReactNode[] =>
  text.split(/(`[^`]+`)/g).map((p, i) =>
    p.length > 2 && p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>
  );

/** Minimal markdown: headings, fenced code, bullet lists, paragraphs, inline code. No raw HTML is ever rendered. */
export default function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let skippedTitle = false;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={out.length}>
          <code>{code.join('\n')}</code>
        </pre>
      );
    } else if (/^#{1,3} /.test(line)) {
      if (!skippedTitle && line.startsWith('# ')) skippedTitle = true; // page already shows the lesson title
      else out.push(<h3 key={out.length}>{line.replace(/^#{1,3} /, '')}</h3>);
      i++;
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      out.push(
        <ul key={out.length}>
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </ul>
      );
    } else if (line.trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```') && !/^#{1,3} /.test(lines[i]) && !lines[i].startsWith('- ')) para.push(lines[i++]);
      out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
    }
  }
  return <div className="prose">{out}</div>;
}
