import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { socketUrl, tokenStore } from '../api/client';
import type { ChatMessage, Source } from '../types';

/** Streams tutor answers over Socket.io. One live assistant message at a time. */
export function useTutor(lessonId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<string | null>(null);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));

  useEffect(() => {
    const socket = io(socketUrl ?? undefined, { auth: { token: tokenStore.get() } });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('tutor:start', (d: { sessionId: string; sources: Source[] }) => {
      sessionRef.current = d.sessionId;
      patchLast((m) => ({ ...m, sources: d.sources }));
    });
    socket.on('tutor:token', (d: { text: string }) => patchLast((m) => ({ ...m, content: m.content + d.text })));
    socket.on('tutor:done', () => {
      patchLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
    });
    socket.on('tutor:error', (d: { message: string }) => {
      patchLast((m) => ({ ...m, content: d.message, streaming: false, error: true }));
      setBusy(false);
    });
    return () => {
      socket.close();
    };
  }, []);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || busy || !socketRef.current?.connected) return;
      setBusy(true);
      setMessages((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '', streaming: true }]);
      socketRef.current.emit('tutor:ask', { question: q, lessonId, sessionId: sessionRef.current });
    },
    [busy, lessonId]
  );

  return { messages, busy, connected, ask };
}
