import express, { type ErrorRequestHandler } from 'express';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request too large' });
      return;
    }
  }
  res.status(500).json({ error: 'Internal server error' });
};
app.use(handleError);
