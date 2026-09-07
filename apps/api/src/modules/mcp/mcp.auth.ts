import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import * as apiKeysService from '../api-keys/api-keys.service';
import * as draftsService from '../drafts/drafts.service';
import { getDraftAccess } from '../drafts/drafts.access';
import * as collaborationService from '../collaboration/collaboration.service';
import { localizeMcpToolImageSources, storeMcpImageAsset } from './image-assets';

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

const READ_ONLY_TOOLS = new Set([
  'get_shape',
  'list_shapes',
  'find_shapes',
  'list_pages',
  'list_components',
  'list_guides',
  'list_variables',
  'list_icons',
  'export_svg',
  'export_png',
  'export_html',
  'export_css',
  'export_css_all_layers',
  'export_tailwind_all_layers',
  'export_tailwind',
  'export_swiftui',
  'export_compose',
]);

export async function sendToolRpc(
  draftId: string,
  userId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const access = await getDraftAccess(draftId, userId);
  if (!access) {
    throw new McpError(ErrorCode.InvalidRequest, 'Draft not found or access denied');
  }
  if (!READ_ONLY_TOOLS.has(tool) && !access.canEdit) {
    throw new McpError(ErrorCode.InvalidRequest, 'Editing this draft is not permitted');
  }
  requireBrowser(draftId);
  const localizedArgs = await localizeMcpToolImageSources(tool, args, (source) =>
    storeMcpImageAsset(draftId, source),
  );
  return collaborationService.sendRpc(draftId, tool, localizedArgs);
}
