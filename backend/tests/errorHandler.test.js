import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler, notFound } from '../middleware/errorHandler';

const app = express();

// Dummy route to test success
app.get('/api/test', (req, res) => {
  res.status(200).json({ success: true });
});

// Dummy route to test generic error
app.get('/api/error', (req, res, next) => {
  next(new Error('Test generic error'));
});

// Dummy route to test Postgres conflict error
app.get('/api/conflict', (req, res, next) => {
  const err = new Error('Duplicate key value');
  err.code = '23505';
  next(err);
});

// Apply error handlers
app.use(notFound);
app.use(errorHandler);

describe('Error Handler Middleware', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Route GET /api/unknown not found');
  });

  it('should format generic errors as 500', async () => {
    const res = await request(app).get('/api/error');
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Test generic error');
  });

  it('should intercept Postgres 23505 duplicate code as 409 Conflict', async () => {
    const res = await request(app).get('/api/conflict');
    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Resource already exists');
  });

  it('should allow normal requests to pass', async () => {
    const res = await request(app).get('/api/test');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
