import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { userFromToken } from '../middleware/auth.js';
import { appendChatMessages, createChatSession, getChatSession } from '../db/activity.js';
import { findUserById, saveUserStats } from '../db/users.js';
import { retrieve } from '../services/ragService.js';
import { isLlmLocal, streamChat } from '../services/llmService.js';
import { buildContext, mockTutorAnswer, TUTOR_SYSTEM } from '../services/agentService.js';
import { createUserLimiter } from '../middleware/rateLimit.js';
import { touchActivity } from '../utils/stats.js';

const allowAsk = createUserLimiter(env.tutorLimitPer10Min);

export function attachSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: env.clientOrigin.split(','), credentials: true } });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await userFromToken(socket.handshake.auth?.token || '');
      next();
    } catch {
      next(new Error('Sign in to use the tutor'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('tutor:ask', async (payload = {}) => {
      const user = socket.data.user;
      const question = typeof payload.question === 'string' ? payload.question.trim() : '';
      if (question.length < 2 || question.length > 1000) {
        return socket.emit('tutor:error', { message: 'Ask a question between 2 and 1000 characters.' });
      }
      if (!allowAsk(user.id)) {
        return socket.emit('tutor:error', { message: 'You have asked a lot of questions recently. Wait a few minutes and try again.' });
      }
      try {
        let session = payload.sessionId ? await getChatSession(payload.sessionId, user.id) : null;
        session ??= { id: await createChatSession(user.id, payload.lessonId || null), messages: [] };

        const local = isLlmLocal(); // small local models are slow, so send less text and ask for shorter answers
        const chunks = await retrieve(question, { lessonId: payload.lessonId || null, k: local ? 2 : 3 });
        const sources = chunks.map((c) => ({ lessonId: c.lessonId, title: c.title, snippet: c.text.slice(0, 140) }));
        const history = session.messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
        const userMsg = `Course excerpts:\n${buildContext(chunks) || '(none found)'}\n\nQuestion: ${question}`;

        socket.emit('tutor:start', { sessionId: session.id, sources });
        const answer = await streamChat({
          system: local ? `${TUTOR_SYSTEM} Keep answers under 120 words.` : TUTOR_SYSTEM,
          maxTokens: local ? 350 : 700,
          messages: [...history, { role: 'user', content: userMsg }],
          onToken: (t) => socket.emit('tutor:token', { text: t }),
          mockText: mockTutorAnswer(chunks),
        });

        const now = new Date().toISOString();
        await appendChatMessages(session.id, [
          { role: 'user', content: question, createdAt: now },
          { role: 'assistant', content: answer || '(no answer)', sources, createdAt: now },
        ]);

        const fresh = await findUserById(user.id);
        fresh.stats.tutorQuestions = (fresh.stats.tutorQuestions || 0) + 1;
        touchActivity(fresh);
        await saveUserStats(fresh);

        socket.emit('tutor:done', { sessionId: session.id });
      } catch (e) {
        console.error('tutor error:', e.userMessage || e.message);
        socket.emit('tutor:error', { message: e.userMessage || 'The tutor could not answer right now. Try again in a moment.' });
      }
    });
  });
  return io;
}
