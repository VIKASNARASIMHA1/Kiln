import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findUserById } from '../db/users.js';
import { HttpError } from '../utils/asyncHandler.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: '7d' });

export async function userFromToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  const user = await findUserById(payload.sub);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  return user;
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sign in to continue');
  try {
    req.user = await userFromToken(token);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'Your session expired. Sign in again.');
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have access to this page');
  next();
};
