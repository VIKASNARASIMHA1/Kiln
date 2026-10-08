import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();
  // Render (and most hosts) sit behind a proxy; this makes rate limits see the real client address.
  app.set('trust proxy', 1);
  app.use(cors({ origin: env.clientOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', routes);
  app.use('/api', notFoundHandler);

  // In production one service serves the React app as well, so the site and the API share a URL.
  const index = path.join(env.clientDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.sendFile(index);
    });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
