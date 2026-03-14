import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors';

describe('error classes', () => {
  test('AppError sets statusCode and message', () => {
    const err = new AppError(418, 'I am a teapot');
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe('I am a teapot');
    expect(err).toBeInstanceOf(Error);
  });

  test('NotFoundError sets 404 status with resource name', () => {
    const err = new NotFoundError('Widget');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Widget not found');
  });

  test('ForbiddenError sets 403 status', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  test('UnauthorizedError sets 401 status', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });

  test('ValidationError sets 400 status with fieldErrors', () => {
    const fieldErrors = { name: ['Required'] };
    const err = new ValidationError(fieldErrors);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Validation failed');
    expect(err.fieldErrors).toEqual({ name: ['Required'] });
  });
});

function createTestApp() {
  const testApp = new Hono();

  testApp.get('/throw-validation', () => {
    throw new ValidationError({ email: ['Invalid email'] });
  });

  testApp.get('/throw-forbidden', () => {
    throw new ForbiddenError();
  });

  testApp.get('/throw-unhandled', () => {
    throw new Error('something broke');
  });

  testApp.onError((err, c) => {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message, fieldErrors: err.fieldErrors }, 400);
    }
    if (err instanceof AppError) {
      return c.json({ error: err.message }, err.statusCode as ContentfulStatusCode);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return testApp;
}

describe('global error handler', () => {
  const testApp = createTestApp();

  test('catches ValidationError and returns 400 with fieldErrors', async () => {
    const res = await testApp.request('/throw-validation');
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; fieldErrors: Record<string, string[]> };
    expect(body.error).toBe('Validation failed');
    expect(body.fieldErrors).toEqual({ email: ['Invalid email'] });
  });

  test('catches AppError subclasses and returns correct status', async () => {
    const res = await testApp.request('/throw-forbidden');
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string; fieldErrors?: unknown };
    expect(body.error).toBe('Forbidden');
    expect(body.fieldErrors).toBeUndefined();
  });

  test('catches unhandled errors and returns 500', async () => {
    const res = await testApp.request('/throw-unhandled');
    expect(res.status).toBe(500);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Internal server error');
  });
});
