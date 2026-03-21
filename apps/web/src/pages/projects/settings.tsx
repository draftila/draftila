import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  CrownIcon,
  ImageIcon,
  Loader2Icon,
  TrashIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  useDeleteProject,
  useInviteMember,
  useProject,
  useProjectMembers,
  useRemoveMember,
  useUpdateMemberRole,
  useUpdateProject,
  useUploadProjectLogo,
} from '@/api/projects';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
import { ErrorState } from '@/components/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: project, isLoading, isError, error } = useProject(projectId!);

  if (isLoading) return null;
  if (isError) return <ErrorState error={error} />;
  if (!project) return null;

  const isOwner = project.ownerId === session?.user?.id;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
          <ArrowLeftIcon className="size-4" />
          Projects
        </Button>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">{project.name}</h1>
        <div className="ml-auto" />
        <UserMenu />
      </header>
      <div className="flex flex-1 flex-col gap-8 overflow-auto p-6">
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <ProjectInfoSection
            projectId={project.id}
            name={project.name}
            logo={project.logo}
            isOwner={isOwner}
          />
          <Separator />
          <MembersSection
            projectId={project.id}
            ownerId={project.ownerId}
            currentUserId={session?.user?.id ?? ''}
          />
          {isOwner && !project.isPersonal && (
            <>
              <Separator />
              <DangerSection projectId={project.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectInfoSection({
  projectId,
  name,
  logo,
  isOwner,
}: {
  projectId: string;
  name: string;
  logo: string | null;
  isOwner: boolean;
}) {
  const [editName, setEditName] = useState(name);
  const updateProject = useUpdateProject();
  const uploadLogo = useUploadProjectLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSaveName() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === name) return;
    updateProject.mutate(
      { id: projectId, data: { name: trimmed } },
      { onSuccess: () => toast.success('Project updated') },
    );
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo.mutate({ id: projectId, file }, { onSuccess: () => toast.success('Logo uploaded') });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium">Project Info</h2>
      <Field>
        <FieldLabel htmlFor="project-name">Name</FieldLabel>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => isOwner && fileInputRef.current?.click()}
            disabled={!isOwner}
            className="bg-muted border-border hover:bg-muted/80 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-colors disabled:cursor-default disabled:opacity-50"
          >
            {uploadLogo.isPending ? (
              <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
            ) : logo ? (
              <img src={logo} alt="Logo" className="size-full object-cover" />
            ) : (
              <ImageIcon className="text-muted-foreground size-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <Input
            id="project-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={!isOwner}
            className="flex-1"
          />
          {isOwner && editName.trim() !== name && (
            <Button onClick={handleSaveName} disabled={updateProject.isPending} size="sm">
              Save
            </Button>
          )}
        </div>
      </Field>
    </div>
  );
}

function MembersSection({
  projectId,
  ownerId,
  currentUserId,
}: {
  projectId: string;
  ownerId: string;
  currentUserId: string;
}) {
  const { data: membersResponse } = useProjectMembers(projectId);
  const members = membersResponse?.data ?? [];
  const isOwner = ownerId === currentUserId;
  const currentMember = members.find((m) => m.userId === currentUserId);
  const isAdmin = currentMember?.role === 'admin';
  const canManage = isOwner || isAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Members</h2>
      </div>

      {canManage && <InviteForm projectId={projectId} />}

      <div className="space-y-1">
        <OwnerRow ownerId={ownerId} currentUserId={currentUserId} />
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            projectId={projectId}
            canManage={canManage}
            isOwner={isOwner}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

function OwnerRow({ ownerId, currentUserId }: { ownerId: string; currentUserId: string }) {
  const isCurrentUser = ownerId === currentUserId;

  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2">
      <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
        <CrownIcon className="text-primary size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isCurrentUser ? 'You (owner)' : 'Project Owner'}
        </p>
      </div>
      <Badge variant="secondary">Owner</Badge>
    </div>
  );
}

function MemberRow({
  member,
  projectId,
  canManage,
  isOwner,
  currentUserId,
}: {
  member: {
    id: string;
    userId: string;
    role: string;
    user?: { id: string; name: string; email: string };
  };
  projectId: string;
  canManage: boolean;
  isOwner: boolean;
  currentUserId: string;
}) {
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const isSelf = member.userId === currentUserId;
  const canEditThisMember = canManage && !isSelf && (isOwner || member.role !== 'admin');

  function handleRoleChange(role: string) {
    updateRole.mutate(
      { projectId, memberId: member.id, data: { role: role as 'admin' | 'editor' | 'viewer' } },
      { onSuccess: () => toast.success('Role updated') },
    );
  }

  function handleRemove() {
    removeMember.mutate(
      { projectId, memberId: member.id },
      { onSuccess: () => toast.success('Member removed') },
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2">
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        <span className="text-muted-foreground text-xs font-medium">
          {(member.user?.name ?? 'U').charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.user?.name ?? 'Unknown'}
          {isSelf && ' (you)'}
        </p>
        <p className="text-muted-foreground truncate text-xs">{member.user?.email ?? ''}</p>
      </div>
      {canEditThisMember ? (
        <Select value={member.role} onValueChange={handleRoleChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
      )}
      {canEditThisMember && (
        <Button variant="ghost" size="sm" onClick={handleRemove} disabled={removeMember.isPending}>
          <TrashIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const inviteMember = useInviteMember();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    inviteMember.mutate(
      { projectId, data: { email: trimmed, role } },
      {
        onSuccess: () => {
          setEmail('');
          toast.success('Member invited');
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <FieldLabel htmlFor="invite-email">Invite by email</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          className="flex-1"
        />
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!email.trim() || inviteMember.isPending}>
          <UserPlusIcon className="size-4" />
          Invite
        </Button>
      </div>
    </form>
  );
}

function DangerSection({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const deleteProject = useDeleteProject();

  function handleDelete() {
    deleteProject.mutate(projectId, {
      onSuccess: () => {
        toast.success('Project deleted');
        navigate('/projects');
      },
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-destructive text-base font-medium">Danger Zone</h2>
      <div className="border-destructive/20 flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Delete this project</p>
          <p className="text-muted-foreground text-xs">
            This will permanently delete the project and all its drafts.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Delete Project
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. All drafts in this project will be permanently
                deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
