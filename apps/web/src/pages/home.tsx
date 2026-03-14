import { useNavigate } from 'react-router-dom';
import { useSession, signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function HomePage() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold">Draftila</h1>
      <p className="text-muted-foreground text-lg">
        Welcome back, <span className="text-foreground font-medium">{session?.user?.name}</span>
      </p>
      <Button variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </div>
  );
}
