import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  CopyIcon,
  CheckIcon,
  KeyIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '@/api/api-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ApiKeysPage() {
  const navigate = useNavigate();
  const { data: keys, isLoading } = useApiKeys();
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">API Keys</h1>
        <div className="ml-auto" />
        <UserMenu />
      </header>
      <div className="flex flex-1 flex-col gap-8 overflow-auto p-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium">API Keys</h2>
              <p className="text-muted-foreground text-sm">
                Manage API keys for MCP and programmatic access.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4" />
              Create Key
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : keys && keys.length > 0 ? (
            <div className="space-y-1">
              {keys.map((key) => (
                <KeyRow key={key.id} apiKey={key} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-12">
              <KeyIcon className="size-8 opacity-50" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs">Create a key to use with MCP or the Draftila API.</p>
            </div>
          )}

          <Separator />

          <McpConnectionGuide />

          <CreateKeyDialog
            open={showCreate}
            onOpenChange={setShowCreate}
            onCreated={setCreatedKey}
          />

          <KeyRevealDialog keyValue={createdKey} onClose={() => setCreatedKey(null)} />
        </div>
      </div>
    </div>
  );
}

function KeyRow({
  apiKey,
}: {
  apiKey: { id: string; name: string; lastUsedAt: string | null; createdAt: string };
}) {
  const deleteKey = useDeleteApiKey();

  function handleDelete() {
    deleteKey.mutate(apiKey.id, {
      onSuccess: () => toast.success('API key revoked'),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2">
      <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
        <KeyIcon className="text-muted-foreground size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{apiKey.name}</p>
        <p className="text-muted-foreground text-xs">
          Created {new Date(apiKey.createdAt).toLocaleDateString()}
          {apiKey.lastUsedAt && (
            <> &middot; Last used {new Date(apiKey.lastUsedAt).toLocaleDateString()}</>
          )}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={deleteKey.isPending}>
            <TrashIcon className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any integrations using &quot;{apiKey.name}&quot; will stop working immediately. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState('');
  const createKey = useCreateApiKey();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createKey.mutate(trimmed, {
      onSuccess: (data) => {
        onCreated(data.key);
        onOpenChange(false);
        setName('');
        toast.success('API key created');
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setName('');
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give your key a name so you can identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Field>
              <FieldLabel htmlFor="key-name">Name</FieldLabel>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Claude Desktop, Cursor"
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createKey.isPending}>
              {createKey.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-muted group relative rounded-md p-3">
      <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{children}</pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleCopy}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Button>
    </div>
  );
}

function McpConnectionGuide() {
  const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;

  const mcpConfig = (extra?: Record<string, unknown>) =>
    JSON.stringify(
      {
        mcpServers: {
          draftila: {
            ...extra,
            url: `${apiUrl}/api/mcp`,
            headers: { Authorization: 'Bearer YOUR_API_KEY' },
          },
        },
      },
      null,
      2,
    );

  const claudeDesktopConfig = mcpConfig();
  const cursorConfig = mcpConfig();
  const claudeCodeConfig = mcpConfig({ type: 'http' });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">Connect to MCP</h2>
        <p className="text-muted-foreground text-sm">
          Use your API key to connect AI tools to Draftila. Replace{' '}
          <code className="bg-muted rounded px-1 text-xs">YOUR_API_KEY</code> with your actual key.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Claude Desktop</p>
          <p className="text-muted-foreground text-xs">
            Add to your Claude Desktop config (Settings &rarr; Developer &rarr; Edit Config):
          </p>
          <CopyBlock>{claudeDesktopConfig}</CopyBlock>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cursor</p>
          <p className="text-muted-foreground text-xs">
            Add to <code className="bg-muted rounded px-1">.cursor/mcp.json</code> in your project:
          </p>
          <CopyBlock>{cursorConfig}</CopyBlock>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Claude Code</p>
          <p className="text-muted-foreground text-xs">
            Add to <code className="bg-muted rounded px-1">.mcp.json</code> in your project root:
          </p>
          <CopyBlock>{claudeCodeConfig}</CopyBlock>
        </div>
      </div>
    </div>
  );
}

function KeyRevealDialog({ keyValue, onClose }: { keyValue: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!keyValue) return;
    navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={!!keyValue} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your API key</DialogTitle>
          <DialogDescription>
            Copy this key now. You won&apos;t be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-muted flex items-center gap-2 rounded-md p-3">
            <code className="flex-1 break-all text-sm">{keyValue}</code>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
