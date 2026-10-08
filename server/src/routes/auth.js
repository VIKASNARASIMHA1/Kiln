import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, emailExists, findDemoUser, findUserForLogin, saveUserStats } from '../db/users.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { bad, HttpError } from '../utils/asyncHandler.js';
import { touchActivity, userPublic } from '../utils/stats.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRACKS = ['python', 'web', 'ml'];

export function validateRegistration({ name, email, password, track }) {
  if (typeof name !== 'string' || name.trim().length < 2) return 'Enter your name (at least 2 characters)';
  if (name.trim().length > 80) return 'Your name must be 80 characters or fewer';
  if (typeof email !== 'string' || !EMAIL.test(email)) return 'Enter a valid email address';
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  if (track !== undefined && !TRACKS.includes(track)) return 'Choose python, web or ml as your track';
  return null;
}

router.post('/register', authLimiter, async (req, res) => {
  const problem = validateRegistration(req.body || {});
  if (problem) throw bad(problem);
  const { name, email, password, track = 'python' } = req.body;
  if (await emailExists(email.trim())) throw new HttpError(409, 'An account with this email already exists');
  const user = await createUser({
    name: name.trim(),
    email,
    track,
    role: 'student', // teachers are created by the seed script only
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json({ token: signToken(user), user: userPublic(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') throw bad('Enter your email and password');
  const user = await findUserForLogin(email.trim());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect');
  touchActivity(user);
  await saveUserStats(user);
  res.json({ token: signToken(user), user: userPublic(user) });
});

// One-click demo for recruiters: signs in as the seeded demo student or teacher.
router.post('/guest', authLimiter, async (req, res) => {
  const role = req.body?.role === 'teacher' ? 'teacher' : 'student';
  const user = await findDemoUser(role);
  if (!user) throw new HttpError(503, 'Demo accounts are missing. Run the seed script first.');
  res.json({ token: signToken(user), user: userPublic(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: userPublic(req.user) }));

export default router;
