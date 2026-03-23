import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as apiKeysService from '../api-keys/api-keys.service';
import * as draftsService from '../drafts/drafts.service';
import * as collaborationService from '../collaboration/collaboration.service';

export async function resolveApiKeyUser(headers: Headers): Promise<{ userId: string } | null> {
  const authHeader = headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const rawKey = authHeader.slice(7);
  return apiKeysService.verifyKey(rawKey);
}

export async function assertDraftAccess(draftId: string, userId: string) {
  const draft = await draftsService.getByIdForUser(draftId, userId);
  if (!draft) {
    throw new McpError(ErrorCode.InvalidRequest, 'Draft not found or access denied');
  }
  return draft;
}

export function requireBrowser(draftId: string) {
  if (!collaborationService.hasActiveConnection(draftId)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No editor tab is open for this draft. Open it in your browser first.',
    );
  }
}

export async function sendToolRpc(
  draftId: string,
  userId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  await assertDraftAccess(draftId, userId);
  requireBrowser(draftId);
  return collaborationService.sendRpc(draftId, tool, args);
}
