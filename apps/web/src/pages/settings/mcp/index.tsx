import { useMemo, useState } from 'react';
import type { McpTokenScope } from '@draftila/shared';
import { PlusIcon, CopyIcon, LinkIcon } from 'lucide-react';
import { useCreateMcpToken, useMcpTokens, useRevokeMcpToken } from '@/api/mcp';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { UserMenu } from '@/components/user-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ALL_SCOPES: McpTokenScope[] = [
  'mcp:projects:read',
  'mcp:drafts:read',
  'mcp:canvas:read',
  'mcp:canvas:write',
];

function formatDate(value: Date | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function scopeLabel(scope: McpTokenScope) {
  if (scope === 'mcp:projects:read') return 'Projects Read';
  if (scope === 'mcp:drafts:read') return 'Drafts Read';
  if (scope === 'mcp:canvas:read') return 'Canvas Read';
  return 'Canvas Write';
}

export function McpSettingsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('My MCP Token');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [selectedScopes, setSelectedScopes] = useState<McpTokenScope[]>([
    'mcp:projects:read',
    'mcp:drafts:read',
    'mcp:canvas:read',
  ]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const tokensQuery = useMcpTokens();
  const createToken = useCreateMcpToken();
  const revokeToken = useRevokeMcpToken();

  const hasWriteScope = selectedScopes.includes('mcp:canvas:write');
  const tokenCount = tokensQuery.data?.data.length ?? 0;

  const defaultConfig = useMemo(() => {
    return `{
  "mcpServers": {
    "draftila": {
      "url": "${window.location.origin}/api/mcp",
      "headers": {
        "Authorization": "Bearer ${createdSecret ?? 'dtk_...'}"
      }
    }
  }
}`;
  }, [createdSecret]);

  function toggleScope(scope: McpTokenScope) {
    setSelectedScopes((current) => {
      if (current.includes(scope)) {
        if (current.length === 1) return current;
        return current.filter((entry) => entry !== scope);
      }
      return [...current, scope];
    });
  }

  async function handleCreateToken() {
    const parsedDays = Number(expiresInDays);
    const result = await createToken.mutateAsync({
      name,
      scopes: selectedScopes,
      expiresInDays: Number.isFinite(parsedDays) ? parsedDays : 90,
    });
    setCreatedSecret(result.secret);
    setCreateOpen(false);
  }

  async function handleCopySecret() {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
  }

  async function handleCopyConfig() {
    await navigator.clipboard.writeText(defaultConfig);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <h1 className="text-sm font-medium">MCP Access</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New Token
          </Button>
        </div>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-full" />
        <UserMenu />
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <LinkIcon className="size-4" />
            Connect Coding Agent
          </div>
          <p className="text-muted-foreground mb-3 text-sm">
            Create a token and configure your agent with this MCP endpoint.
          </p>
          <div className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            <pre>{defaultConfig}</pre>
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={handleCopyConfig}>
              <CopyIcon />
              Copy Config
            </Button>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 text-sm font-medium">Tokens ({tokenCount})</div>
          <div className="divide-y">
            {(tokensQuery.data?.data ?? []).map((token) => (
              <div
                key={token.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{token.name}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {token.scopes.map(scopeLabel).join(', ')}
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    Expires: {formatDate(token.expiresAt)} | Last used:{' '}
                    {formatDate(token.lastUsedAt)}
                  </div>
                </div>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Boolean(token.revokedAt) || revokeToken.isPending}
                    onClick={() => revokeToken.mutate(token.id)}
                  >
                    {token.revokedAt ? 'Revoked' : 'Revoke'}
                  </Button>
                </div>
              </div>
            ))}
            {tokensQuery.isSuccess && (tokensQuery.data?.data.length ?? 0) === 0 ? (
              <div className="text-muted-foreground px-4 py-6 text-sm">
                No MCP tokens created yet.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create MCP Token</DialogTitle>
            <DialogDescription>
              New tokens expire in 90 days by default. Canvas write is off by default.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="token-expiry">Expires In Days</Label>
              <Input
                id="token-expiry"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map((scope) => {
                  const selected = selectedScopes.includes(scope);
                  return (
                    <Button
                      key={scope}
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleScope(scope)}
                    >
                      {scopeLabel(scope)}
                    </Button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                {hasWriteScope
                  ? 'Canvas write access enabled.'
                  : 'Canvas write access is currently disabled.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateToken}
              disabled={createToken.isPending || selectedScopes.length === 0}
            >
              Create Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createdSecret)}
        onOpenChange={(open) => setCreatedSecret(open ? createdSecret : null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Token Created</DialogTitle>
            <DialogDescription>
              Copy this secret now. You will not be able to view it again.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            <pre>{createdSecret}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCopySecret}>
              <CopyIcon />
              Copy Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
