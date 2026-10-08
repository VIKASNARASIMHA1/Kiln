export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' }); // malformed uuid
  if (err.code === '23505') return res.status(409).json({ error: 'That value is already in use' }); // unique violation
  if (err.code === '23514') return res.status(400).json({ error: 'That value is not allowed' }); // check constraint
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
}
