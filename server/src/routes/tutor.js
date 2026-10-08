import { Router } from 'express';
import { getChatSession, listChatSessions } from '../db/activity.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../utils/asyncHandler.js';

// Live answers stream over Socket.io (see sockets/index.js). REST is only for history.
const router = Router();
router.use(requireAuth);

router.get('/sessions', async (req, res) => {
  const sessions = await listChatSessions(req.user.id, 20);
  res.json({
    sessions: sessions.map((s) => ({ id: s.id, lessonId: s.lesson ?? null, updatedAt: s.updatedAt, preview: s.preview })),
  });
});

router.get('/sessions/:id', async (req, res) => {
  const s = await getChatSession(req.params.id, req.user.id);
  if (!s) throw notFound('Conversation not found');
  res.json({ id: s.id, messages: s.messages });
});

export default router;
