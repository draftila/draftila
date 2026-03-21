import { useEffect, useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, KeyIcon } from 'lucide-react';
import {
  useAdminUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminRemoveUser,
  useAdminSetPassword,
} from '@/api/admin';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { UserMenu } from '@/components/user-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/error-state';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string | null | undefined;
  createdAt: Date;
}

export function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { data, isLoading, isError, error } = useAdminUsers();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserRow | null>(null);

  const users: AdminUserRow[] = (data?.users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: new Date(u.createdAt as unknown as string),
  }));

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">Users</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56"
          />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New User
          </Button>
        </div>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <UserMenu />
      </header>
      <div className="flex flex-1 flex-col overflow-auto p-6">
        {isError ? (
          <ErrorState error={error} />
        ) : isLoading ? null : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-muted-foreground text-center">
              <p className="text-lg font-medium">No users found</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role ?? 'user'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditUser(user)}
                          aria-label="Edit user"
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPasswordUser(user)}
                          aria-label="Reset password"
                        >
                          <KeyIcon />
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteUser(user)}
                            aria-label="Delete user"
                          >
                            <TrashIcon />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog
        user={editUser}
        isSelf={editUser?.id === currentUserId}
        onOpenChange={(open) => !open && setEditUser(null)}
      />
      <DeleteUserDialog user={deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)} />
      <ResetPasswordDialog
        user={passwordUser}
        onOpenChange={(open) => !open && setPasswordUser(null)}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const createUser = useAdminCreateUser();

  function reset() {
    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createUser.mutate(
      { name: name.trim(), email: email.trim(), password, role },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset();
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Add a new user to the system.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Field>
              <FieldLabel htmlFor="create-name">Name</FieldLabel>
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-email">Email</FieldLabel>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-password">Password</FieldLabel>
              <Input
                id="create-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || !email.trim() || !password || createUser.isPending}
            >
              {createUser.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  isSelf,
  onOpenChange,
}: {
  user: AdminUserRow | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const updateUser = useAdminUpdateUser();

  useEffect(() => {
    if (user) {
      setName(user.name);
      setRole(user.role ?? 'user');
    }
  }, [user]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    updateUser.mutate(
      { userId: user.id, name: name.trim() || undefined, role: isSelf ? undefined : role },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{user?.email}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select value={role} onValueChange={setRole} disabled={isSelf}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const removeUser = useAdminRemoveUser();

  function handleDelete() {
    if (!user) return;
    removeUser.mutate(user.id, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {user?.name} ({user?.email})? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={removeUser.isPending}>
            {removeUser.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const setPasswordMutation = useAdminSetPassword();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setPasswordMutation.mutate(
      { userId: user.id, newPassword: password },
      {
        onSuccess: () => {
          setPassword('');
          onOpenChange(false);
        },
      },
    );
  }

  function handleOpenChange(value: boolean) {
    if (!value) setPassword('');
    onOpenChange(value);
  }

  return (
    <Dialog open={!!user} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {user?.name} ({user?.email}).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Field>
              <FieldLabel htmlFor="reset-password">New Password</FieldLabel>
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!password || setPasswordMutation.isPending}>
              {setPasswordMutation.isPending ? 'Saving...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
