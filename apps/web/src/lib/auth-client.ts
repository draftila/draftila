import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? window.location.origin,
});

export const { signIn, signUp, signOut, useSession } = authClient;
