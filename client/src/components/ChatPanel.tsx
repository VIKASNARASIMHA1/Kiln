import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { describeLlm, useLlmInfo } from '../hooks/useLlmInfo';
import { useTutor } from '../hooks/useTutor';

/** "Thinking", plus an explanation if a local model is taking a while (it may be loading into memory). */
function Thinking({ local }: { local: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <span className="dots">
      Thinking…{slow && local && ' The model is loading on your computer. The first answer can take a minute or two, and later ones are faster.'}
    </span>
  );
}

export default function ChatPanel({ lessonId, suggestions = [] }: { lessonId?: string; suggestions?: string[] }) {
  const { messages, busy, connected, ask } = useTutor(lessonId);
  const llm = useLlmInfo();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    ask(text);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section className="chat" aria-label="Tutor chat">
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">
            <p>Ask about anything in the course. Answers are built from the lesson text and cite their sources.</p>
            <div className="chips">
              {suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => ask(s)} disabled={!connected || busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? ' err' : ''}`}>
            <div className="bubble">
              {m.content || (m.streaming ? <Thinking local={!!llm?.local} /> : '')}
              {m.streaming && m.content && <span className="caret" />}
            </div>
            {m.sources && m.sources.length > 0 && !m.error && (
              <ol className="sources">
                {m.sources.map((s, k) => (
                  <li key={k} title={s.snippet}>
                    [{k + 1}] {s.title}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={connected ? 'Ask a question (Enter to send)' : 'Connecting to the tutor…'}
          rows={2}
          maxLength={1000}
          aria-label="Your question"
        />
        <button className="btn" type="submit" disabled={busy || !connected || !text.trim()}>
          {busy ? 'Answering…' : 'Ask'}
        </button>
      </form>
      {llm && <p className="fine llm-note">{describeLlm(llm)}</p>}
    </section>
  );
}
