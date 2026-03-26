import { useNavigate } from 'react-router-dom';
import { KeyIcon, LogOutIcon } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { clearUserCache } from '@/lib/query-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? 'User';
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function handleSignOut() {
    await signOut();
    clearUserCache();
    navigate('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="User menu">
          <Avatar className="size-7 rounded-none">
            <AvatarFallback className="rounded-none text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate('/settings/api-keys')}>
          <KeyIcon />
          API Keys
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
