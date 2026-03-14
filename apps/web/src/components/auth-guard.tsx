import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';

/**
 * Protects routes that require authentication.
 * Redirects to /login if no active session.
 */
export function AuthGuard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

/**
 * Protects guest-only routes (e.g. /login).
 * Redirects to / if already authenticated.
 */
export function GuestGuard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
