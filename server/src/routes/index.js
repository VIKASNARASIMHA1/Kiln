import { Router } from 'express';
import auth from './auth.js';
import courses from './courses.js';
import quiz from './quiz.js';
import recommend from './recommend.js';
import analytics from './analytics.js';
import tutor from './tutor.js';
import exercises from './exercises.js';
import { llmInfo, llmStatus } from '../services/llmService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.get('/health', (_req, res) => res.json({ status: 'ok', ...llmInfo() }));
// Asks the model service whether it is reachable and the model is installed (useful for Ollama).
router.get('/llm/status', requireAuth, async (_req, res) => res.json(await llmStatus()));
router.use('/auth', auth);
router.use('/quiz', quiz);
router.use('/recommend', recommend);
router.use('/analytics', analytics);
router.use('/tutor', tutor);
router.use('/exercises', exercises);
router.use('/', courses);

export default router;
