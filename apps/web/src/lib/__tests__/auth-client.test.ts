import { authClient, signIn, signUp, signOut, useSession } from '../auth-client';

describe('authClient', () => {
  test('exports authClient instance', () => {
    expect(authClient).toBeDefined();
  });

  test('exports signIn', () => {
    expect(signIn).toBeDefined();
  });

  test('exports signUp', () => {
    expect(signUp).toBeDefined();
  });

  test('exports signOut', () => {
    expect(signOut).toBeDefined();
  });

  test('exports useSession', () => {
    expect(useSession).toBeDefined();
    expect(typeof useSession).toBe('function');
  });
});
