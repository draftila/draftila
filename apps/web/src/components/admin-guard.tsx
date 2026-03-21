import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';

export function AdminGuard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session || session.user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
