import { app } from '../src/app';
import { db } from '../src/db';
import { user, session, account, verification, project } from '../src/db/schema';

/**
 * Delete all rows from application tables (respects FK order).
 */
export async function cleanDatabase() {
  await db.delete(project);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);
}

interface TestUserResponse {
  user: { id: string; email: string; name: string };
  token: string;
}

/**
 * Create a user via the HTTP sign-up endpoint and return the parsed response body.
 */
export async function createTestUser(
  data = {
    email: 'test@draftila.com',
    password: 'password123',
    name: 'Test User',
  },
): Promise<TestUserResponse> {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  return res.json() as Promise<TestUserResponse>;
}

/**
 * Sign in via the HTTP endpoint and return a Headers object
 * with the session cookie set, ready to use with `app.request()`.
 */
export async function getAuthHeaders(email: string, password: string): Promise<Headers> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  // Extract the Set-Cookie header that better-auth returns
  const setCookie = res.headers.getSetCookie();
  const sessionCookie = setCookie.find((c) => c.startsWith('better-auth.session_token='));

  if (!sessionCookie) {
    throw new Error('Sign-in did not return a session cookie');
  }

  // Parse just the cookie key=value part (strip attributes like Path, HttpOnly, etc.)
  const cookieValue = sessionCookie.split(';')[0]!;

  const headers = new Headers();
  headers.set('Cookie', cookieValue);
  return headers;
}
