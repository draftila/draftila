import type { McpCanvasOp, McpTokenScope } from '@draftila/shared';
import type { McpTokenAuthContext } from './mcp-token.service';
import {
  McpError,
  McpForbiddenError,
  McpDraftNotFoundError,
  McpInvalidToolArgumentsError,
  McpNoEditorConnectedError,
  McpRpcTimeoutError,
} from './mcp-errors';
import { getDesignGuidelines } from './mcp-guidelines';
import * as projectsService from '../projects/projects.service';
import * as draftsService from '../drafts/drafts.service';
import * as collaborationService from '../collaboration/collaboration.service';
import * as mcpCanvasService from './mcp-canvas.service';

type ToolResult =
  | { kind: 'text'; value: unknown }
  | { kind: 'image'; base64: string; mimeType: string };

type ToolHandler = (
  auth: McpTokenAuthContext,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpTokenScope;
  handler: ToolHandler;
}

function textResult(value: unknown): ToolResult {
  return { kind: 'text', value };
}

function imageResult(base64: string, mimeType = 'image/png'): ToolResult {
  return { kind: 'image', base64, mimeType };
}

function ensureDraftAccess(auth: McpTokenAuthContext, draft: { id: string; projectId: string }) {
  if (auth.draftIds && !auth.draftIds.has(draft.id)) {
    throw new McpForbiddenError();
  }
  if (auth.projectIds && !auth.projectIds.has(draft.projectId)) {
    throw new McpForbiddenError();
  }
}

function canAccessDraft(auth: McpTokenAuthContext, draft: { id: string; projectId: string }) {
  if (auth.draftIds && !auth.draftIds.has(draft.id)) {
    return false;
  }
  if (auth.projectIds && !auth.projectIds.has(draft.projectId)) {
    return false;
  }
  return true;
}

async function resolveDraft(auth: McpTokenAuthContext, draftId: unknown) {
  if (typeof draftId !== 'string' || !draftId) {
    throw new McpDraftNotFoundError();
  }
  const draft = await draftsService.getByIdForOwner(draftId, auth.ownerId);
  if (!draft) {
    throw new McpDraftNotFoundError();
  }
  ensureDraftAccess(auth, draft);
  return draft;
}

function ensureEditorConnected(draftId: string) {
  if (!collaborationService.hasActiveConnection(draftId)) {
    throw new McpNoEditorConnectedError();
  }
}

function remapRelayError(error: unknown): never {
  if (error instanceof McpError) {
    throw error;
  }
  if (error instanceof Error) {
    if (error.message === 'RPC timeout') {
      throw new McpRpcTimeoutError();
    }
    if (error.message.startsWith('Invalid tool arguments')) {
      throw new McpInvalidToolArgumentsError(error.message.replace('Invalid tool arguments: ', ''));
    }
  }
  throw error;
}

function parseImageDataUri(value: string): { data: string; mimeType: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const [, mimeType, data] = match;
  if (!mimeType || !data) {
    return null;
  }
  return { data, mimeType };
}

function extractImagePayload(result: unknown): { data: string; mimeType: string } | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const raw = result as Record<string, unknown>;

  const directData = typeof raw.data === 'string' ? raw.data : null;
  const directMimeType = typeof raw.mimeType === 'string' ? raw.mimeType : null;
  if (directData) {
    const fromDataUri = parseImageDataUri(directData);
    if (fromDataUri) {
      return fromDataUri;
    }
    return { data: directData, mimeType: directMimeType ?? 'image/png' };
  }

  const base64 = typeof raw.base64 === 'string' ? raw.base64 : null;
  if (base64) {
    return { data: base64, mimeType: directMimeType ?? 'image/png' };
  }

  const nestedImage =
    raw.image && typeof raw.image === 'object' ? (raw.image as Record<string, unknown>) : null;
  if (nestedImage && typeof nestedImage.data === 'string') {
    const nestedMimeType =
      typeof nestedImage.mimeType === 'string' ? nestedImage.mimeType : 'image/png';
    const fromDataUri = parseImageDataUri(nestedImage.data);
    if (fromDataUri) {
      return fromDataUri;
    }
    return { data: nestedImage.data, mimeType: nestedMimeType };
  }

  const content = Array.isArray(raw.content)
    ? raw.content.find((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }
        const typed = item as Record<string, unknown>;
        return typed.type === 'image' && typeof typed.data === 'string';
      })
    : null;

  if (content && typeof content === 'object') {
    const typedContent = content as Record<string, unknown>;
    const contentData = typedContent.data as string;
    const contentMimeType =
      typeof typedContent.mimeType === 'string' ? typedContent.mimeType : 'image/png';
    const fromDataUri = parseImageDataUri(contentData);
    if (fromDataUri) {
      return fromDataUri;
    }
    return { data: contentData, mimeType: contentMimeType };
  }

  return null;
}

async function relayToEditor(
  auth: McpTokenAuthContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const draft = await resolveDraft(auth, args.draftId);

  if (!collaborationService.hasActiveConnection(draft.id)) {
    if (toolName === 'canvas.screenshot') {
      ensureEditorConnected(draft.id);
    }
    const headlessResult = await runHeadlessCanvasTool(toolName, {
      ...args,
      draftId: draft.id,
    });
    if (headlessResult !== null) {
      if (toolName === 'canvas.screenshot') {
        const imagePayload = extractImagePayload(headlessResult);
        if (imagePayload) {
          return imageResult(imagePayload.data, imagePayload.mimeType);
        }
      }
      return textResult(headlessResult);
    }
    ensureEditorConnected(draft.id);
  }

  let result: unknown;
  try {
    result = await collaborationService.sendRpc(draft.id, toolName, args);
  } catch (error) {
    remapRelayError(error);
  }

  if (toolName === 'canvas.screenshot') {
    const imagePayload = extractImagePayload(result);
    if (imagePayload) {
      return imageResult(imagePayload.data, imagePayload.mimeType);
    }
    throw new Error('Screenshot failed');
  }

  return textResult(result);
}

function relayHandler(toolName: string): ToolHandler {
  return (auth, args) => relayToEditor(auth, toolName, args);
}

function parseCanvasOp(input: unknown): McpCanvasOp | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const rawType =
    (typeof raw.type === 'string' ? raw.type : null) ??
    (typeof raw.action === 'string' ? raw.action : null) ??
    (typeof raw.operation === 'string' ? raw.operation : null);
  if (!rawType) {
    return null;
  }

  const normalizedType = (() => {
    if (rawType === 'create' || rawType === 'insert' || rawType === 'create_shape')
      return 'add_shape' as const;
    if (rawType === 'update' || rawType === 'patch_shape') return 'update_shape' as const;
    if (rawType === 'delete' || rawType === 'remove' || rawType === 'delete_shape')
      return 'delete_shapes' as const;
    if (rawType === 'move' || rawType === 'move_shapes') return 'move_stack' as const;
    if (rawType === 'group') return 'group_shapes' as const;
    if (rawType === 'ungroup') return 'ungroup_shapes' as const;
    if (rawType === 'duplicate' || rawType === 'clone' || rawType === 'copy_shapes')
      return 'duplicate_shapes' as const;
    return rawType;
  })();

  const shapeTypeValue =
    (typeof raw.shapeType === 'string' ? raw.shapeType : null) ??
    (typeof raw.kind === 'string' ? raw.kind : null) ??
    (typeof raw.shape === 'string' ? raw.shape : null);
  const propsValue =
    (raw.props && typeof raw.props === 'object' ? raw.props : null) ??
    (raw.properties && typeof raw.properties === 'object' ? raw.properties : null) ??
    (raw.data && typeof raw.data === 'object' ? raw.data : null) ??
    undefined;
  const idValue =
    (typeof raw.id === 'string' ? raw.id : null) ??
    (typeof raw.shapeId === 'string' ? raw.shapeId : null);
  const idsValue = Array.isArray(raw.ids)
    ? raw.ids.filter((item): item is string => typeof item === 'string')
    : undefined;

  const knownOpKeys = new Set([
    'type',
    'action',
    'operation',
    'shapeType',
    'ref',
    'kind',
    'shape',
    'props',
    'properties',
    'data',
    'id',
    'shapeId',
    'ids',
    'offset',
    'refs',
    'direction',
    'draftId',
    'op',
    'ops',
  ]);
  const topLevelProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (knownOpKeys.has(key)) {
      continue;
    }
    topLevelProps[key] = value;
  }
  const mergedProps =
    Object.keys(topLevelProps).length > 0
      ? { ...(propsValue ?? {}), ...topLevelProps }
      : propsValue;

  const candidate: Record<string, unknown> = { type: normalizedType };
  if (normalizedType === 'add_shape') {
    candidate.shapeType = shapeTypeValue;
    if (typeof raw.ref === 'string') candidate.ref = raw.ref;
    if (mergedProps) candidate.props = mergedProps;
  }
  if (normalizedType === 'update_shape') {
    candidate.id = idValue;
    candidate.props = mergedProps;
  }
  if (
    normalizedType === 'delete_shapes' ||
    normalizedType === 'group_shapes' ||
    normalizedType === 'ungroup_shapes'
  ) {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
  }
  if (normalizedType === 'move_stack') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    candidate.direction = raw.direction;
  }
  if (normalizedType === 'duplicate_shapes') {
    if (idsValue && idsValue.length > 0) candidate.ids = idsValue;
    else if (idValue) candidate.ids = [idValue];
    if (raw.offset && typeof raw.offset === 'object') candidate.offset = raw.offset;
    if (Array.isArray(raw.refs)) {
      candidate.refs = raw.refs.filter((item): item is string => typeof item === 'string');
    }
    if (
      Array.isArray(candidate.ids) &&
      Array.isArray(candidate.refs) &&
      candidate.ids.length !== candidate.refs.length
    ) {
      return null;
    }
  }

  if (candidate.type === 'add_shape' && typeof candidate.shapeType === 'string') {
    return candidate as McpCanvasOp;
  }
  if (
    candidate.type === 'update_shape' &&
    typeof candidate.id === 'string' &&
    candidate.props &&
    typeof candidate.props === 'object'
  ) {
    return candidate as McpCanvasOp;
  }
  if (
    (candidate.type === 'delete_shapes' ||
      candidate.type === 'group_shapes' ||
      candidate.type === 'ungroup_shapes') &&
    Array.isArray(candidate.ids) &&
    candidate.ids.length > 0
  ) {
    return candidate as McpCanvasOp;
  }
  if (
    candidate.type === 'move_stack' &&
    Array.isArray(candidate.ids) &&
    candidate.ids.length > 0 &&
    ['forward', 'backward', 'front', 'back'].includes(String(candidate.direction))
  ) {
    return candidate as McpCanvasOp;
  }
  if (
    candidate.type === 'duplicate_shapes' &&
    Array.isArray(candidate.ids) &&
    candidate.ids.length > 0
  ) {
    return candidate as McpCanvasOp;
  }

  return null;
}

function parseOpsFromArgs(args: Record<string, unknown>) {
  const rawOps = Array.isArray(args.ops) ? args.ops : args.op !== undefined ? [args.op] : null;
  if (!rawOps || rawOps.length === 0 || rawOps.length > 200) {
    throw new McpInvalidToolArgumentsError('expected { draftId: string, ops: McpCanvasOp[] }');
  }
  const normalizedOps: McpCanvasOp[] = [];
  for (const rawOp of rawOps) {
    const parsedOp = parseCanvasOp(rawOp);
    if (!parsedOp) {
      throw new McpInvalidToolArgumentsError('expected { draftId: string, ops: McpCanvasOp[] }');
    }
    normalizedOps.push(parsedOp);
  }
  return normalizedOps;
}

function parsePadding(padding: unknown) {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  if (!padding || typeof padding !== 'object') {
    return null;
  }
  const raw = padding as Record<string, unknown>;
  return {
    top: typeof raw.top === 'number' ? raw.top : 0,
    right: typeof raw.right === 'number' ? raw.right : 0,
    bottom: typeof raw.bottom === 'number' ? raw.bottom : 0,
    left: typeof raw.left === 'number' ? raw.left : 0,
  };
}

function buildChartOps(args: Record<string, unknown>): McpCanvasOp[] {
  const chartType = args.type === 'line' ? 'line' : args.type === 'bar' ? 'bar' : null;
  const data = Array.isArray(args.data)
    ? args.data
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const raw = item as Record<string, unknown>;
          if (typeof raw.label !== 'string' || typeof raw.value !== 'number') {
            return null;
          }
          return { label: raw.label, value: raw.value };
        })
        .filter((item): item is { label: string; value: number } => item !== null)
    : [];

  if (!chartType || data.length === 0) {
    throw new McpInvalidToolArgumentsError(
      'expected { type: "bar"|"line", data: [{label, value}] }',
    );
  }

  const x = typeof args.x === 'number' ? args.x : 0;
  const y = typeof args.y === 'number' ? args.y : 0;
  const width = typeof args.width === 'number' ? args.width : 640;
  const height = typeof args.height === 'number' ? args.height : 360;
  const parentId = typeof args.parentId === 'string' ? args.parentId : null;
  const color = typeof args.color === 'string' ? args.color : '#3B82F6';
  const axisColor = typeof args.axisColor === 'string' ? args.axisColor : '#475569';
  const title = typeof args.title === 'string' ? args.title : null;
  const showGridlines = args.gridlines !== false;
  const smooth = args.smooth === true;
  const gridlineCount = typeof args.gridlineCount === 'number' ? args.gridlineCount : 4;

  const chartPadding = { top: 44, right: 28, bottom: 48, left: 56 };
  const plotWidth = Math.max(width - chartPadding.left - chartPadding.right, 120);
  const plotHeight = Math.max(height - chartPadding.top - chartPadding.bottom, 80);
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartX = (value: number) => x + value;
  const chartY = (value: number) => y + value;

  const ops: McpCanvasOp[] = [
    {
      type: 'add_shape',
      shapeType: 'frame',
      ref: 'chart_frame',
      props: {
        x,
        y,
        width,
        height,
        parentId,
        name: 'Chart',
        fills: [{ color: '#FFFFFF', opacity: 1, visible: true }],
        strokes: [{ color: '#E2E8F0', width: 1, opacity: 1, visible: true }],
        clip: true,
      },
    },
  ];

  if (showGridlines) {
    const step = maxValue / gridlineCount;
    for (let i = 0; i <= gridlineCount; i++) {
      const lineValue = step * i;
      const lineY = chartPadding.top + (1 - lineValue / maxValue) * plotHeight;
      ops.push({
        type: 'add_shape',
        shapeType: 'line',
        props: {
          parentId: '@chart_frame',
          x: chartX(chartPadding.left),
          y: chartY(lineY),
          x1: 0,
          y1: 0,
          x2: plotWidth,
          y2: 0,
          strokes: [{ color: '#E2E8F0', width: 1, opacity: 0.6, visible: true }],
          name: `Gridline ${i}`,
        },
      });
      const labelValue = Number.isInteger(lineValue) ? String(lineValue) : lineValue.toFixed(1);
      ops.push({
        type: 'add_shape',
        shapeType: 'text',
        props: {
          parentId: '@chart_frame',
          x: chartX(4),
          y: chartY(lineY - 8),
          width: chartPadding.left - 8,
          height: 16,
          content: labelValue,
          fontSize: 11,
          textAlign: 'right',
          fills: [{ color: axisColor, opacity: 0.8, visible: true }],
          name: `Y Label ${labelValue}`,
        },
      });
    }
  }

  ops.push(
    {
      type: 'add_shape',
      shapeType: 'line',
      props: {
        parentId: '@chart_frame',
        x: chartX(chartPadding.left),
        y: chartY(chartPadding.top),
        x1: 0,
        y1: plotHeight,
        x2: plotWidth,
        y2: plotHeight,
        strokes: [{ color: axisColor, width: 1, opacity: 1, visible: true }],
        name: 'X Axis',
      },
    },
    {
      type: 'add_shape',
      shapeType: 'line',
      props: {
        parentId: '@chart_frame',
        x: chartX(chartPadding.left),
        y: chartY(chartPadding.top),
        x1: 0,
        y1: 0,
        x2: 0,
        y2: plotHeight,
        strokes: [{ color: axisColor, width: 1, opacity: 1, visible: true }],
        name: 'Y Axis',
      },
    },
  );

  if (title) {
    ops.push({
      type: 'add_shape',
      shapeType: 'text',
      props: {
        parentId: '@chart_frame',
        x: chartX(chartPadding.left),
        y: chartY(12),
        width: plotWidth,
        height: 24,
        content: title,
        fontSize: 16,
        fontWeight: 600,
        fills: [{ color: '#0F172A', opacity: 1, visible: true }],
        name: 'Chart Title',
      },
    });
  }

  if (chartType === 'bar') {
    const slotWidth = plotWidth / data.length;
    const barWidth = Math.max(slotWidth * 0.56, 8);
    data.forEach((point, index) => {
      const barHeight = Math.max((point.value / maxValue) * plotHeight, 2);
      const barX = chartPadding.left + slotWidth * index + (slotWidth - barWidth) / 2;
      const barY = chartPadding.top + (plotHeight - barHeight);
      ops.push({
        type: 'add_shape',
        shapeType: 'rectangle',
        props: {
          parentId: '@chart_frame',
          x: chartX(barX),
          y: chartY(barY),
          width: barWidth,
          height: barHeight,
          fills: [{ color, opacity: 1, visible: true }],
          cornerRadius: 6,
          name: `Bar ${point.label}`,
        },
      });
      ops.push({
        type: 'add_shape',
        shapeType: 'text',
        props: {
          parentId: '@chart_frame',
          x: chartX(chartPadding.left + slotWidth * index),
          y: chartY(chartPadding.top + plotHeight + 8),
          width: slotWidth,
          height: 18,
          content: point.label,
          fontSize: 12,
          textAlign: 'center',
          fills: [{ color: '#475569', opacity: 1, visible: true }],
          name: `Label ${point.label}`,
        },
      });
    });
  }

  if (chartType === 'line') {
    const stepX = data.length === 1 ? 0 : plotWidth / (data.length - 1);
    const points = data.map((point, index) => {
      const px = chartPadding.left + stepX * index;
      const py = chartPadding.top + (1 - point.value / maxValue) * plotHeight;
      return { ...point, px, py };
    });

    let pathData: string;
    if (smooth && points.length >= 3) {
      const segments = [`M ${points[0]!.px} ${points[0]!.py}`];
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)]!;
        const p1 = points[i]!;
        const p2 = points[i + 1]!;
        const p3 = points[Math.min(i + 2, points.length - 1)]!;
        const tension = 0.3;
        const cp1x = p1.px + (p2.px - p0.px) * tension;
        const cp1y = p1.py + (p2.py - p0.py) * tension;
        const cp2x = p2.px - (p3.px - p1.px) * tension;
        const cp2y = p2.py - (p3.py - p1.py) * tension;
        segments.push(
          `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.px.toFixed(1)} ${p2.py.toFixed(1)}`,
        );
      }
      pathData = segments.join(' ');
    } else {
      pathData = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.px} ${point.py}`)
        .join(' ');
    }

    ops.push({
      type: 'add_shape',
      shapeType: 'path',
      props: {
        parentId: '@chart_frame',
        x,
        y,
        width,
        height,
        svgPathData: pathData,
        fills: [{ color, opacity: 0, visible: false }],
        strokes: [{ color, width: 3, opacity: 1, visible: true }],
        name: 'Line Series',
      },
    });

    points.forEach((point) => {
      ops.push({
        type: 'add_shape',
        shapeType: 'ellipse',
        props: {
          parentId: '@chart_frame',
          x: chartX(point.px - 4),
          y: chartY(point.py - 4),
          width: 8,
          height: 8,
          fills: [{ color, opacity: 1, visible: true }],
          strokes: [{ color: '#FFFFFF', width: 1, opacity: 1, visible: true }],
          name: `Point ${point.label}`,
        },
      });
      ops.push({
        type: 'add_shape',
        shapeType: 'text',
        props: {
          parentId: '@chart_frame',
          x: chartX(point.px - 30),
          y: chartY(chartPadding.top + plotHeight + 8),
          width: 60,
          height: 18,
          content: point.label,
          fontSize: 12,
          textAlign: 'center',
          fills: [{ color: '#475569', opacity: 1, visible: true }],
          name: `Label ${point.label}`,
        },
      });
    });
  }

  return ops;
}

async function runHeadlessCanvasTool(toolName: string, args: Record<string, unknown>) {
  const draftId = typeof args.draftId === 'string' ? args.draftId : null;
  if (!draftId) {
    throw new McpInvalidToolArgumentsError('draftId is required');
  }

  if (toolName === 'canvas.snapshot') {
    const parentId = typeof args.parentId === 'string' ? args.parentId : undefined;
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : undefined;
    return mcpCanvasService.getCanvasSnapshot(draftId, parentId, maxDepth);
  }
  if (toolName === 'canvas.find_shapes') {
    return mcpCanvasService.findShapes(draftId, {
      nameContains: typeof args.nameContains === 'string' ? args.nameContains : undefined,
      type: typeof args.type === 'string' ? (args.type as never) : undefined,
      parentId: args.parentId !== undefined ? (args.parentId as string | null) : undefined,
      limit: typeof args.limit === 'number' ? args.limit : 50,
    });
  }
  if (toolName === 'canvas.get_shape') {
    const shapeId = typeof args.shapeId === 'string' ? args.shapeId : null;
    if (!shapeId) {
      throw new McpInvalidToolArgumentsError('shapeId is required');
    }
    return mcpCanvasService.getShapeById(draftId, shapeId);
  }
  if (toolName === 'canvas.apply_ops' || toolName === 'canvas.apply_op') {
    return mcpCanvasService.applyCanvasOps(draftId, parseOpsFromArgs(args));
  }
  if (toolName === 'canvas.set_image') {
    const shapeId = typeof args.shapeId === 'string' ? args.shapeId : null;
    const src = typeof args.src === 'string' ? args.src : null;
    const fit =
      args.fit === 'fill' || args.fit === 'fit' || args.fit === 'crop' ? args.fit : undefined;
    if (!shapeId || !src) {
      throw new McpInvalidToolArgumentsError('shapeId and src are required');
    }
    return mcpCanvasService.applyCanvasOps(draftId, [
      {
        type: 'update_shape',
        id: shapeId,
        props: {
          src,
          ...(fit ? { fit } : {}),
        },
      },
    ]);
  }
  if (toolName === 'canvas.get_layout') {
    const parentId = typeof args.parentId === 'string' ? args.parentId : null;
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 1;
    const problemsOnly = args.problemsOnly === true;
    return mcpCanvasService.getLayout(draftId, parentId, maxDepth, problemsOnly);
  }
  if (toolName === 'canvas.move_to_parent') {
    const ids = Array.isArray(args.ids)
      ? args.ids.filter((id): id is string => typeof id === 'string')
      : [];
    const parentId =
      typeof args.parentId === 'string' || args.parentId === null
        ? (args.parentId as string | null)
        : null;
    const index = typeof args.index === 'number' ? args.index : undefined;
    return mcpCanvasService.moveToParent(draftId, ids, parentId, index);
  }
  if (toolName === 'canvas.replace_properties') {
    const parentIds = Array.isArray(args.parentIds)
      ? args.parentIds.filter((id): id is string => typeof id === 'string')
      : [];
    const replacements = (args.replacements ?? {}) as Record<
      string,
      Array<{ from: unknown; to: unknown }>
    >;
    return mcpCanvasService.replaceProperties(draftId, parentIds, replacements);
  }
  if (toolName === 'canvas.search_properties') {
    const parentIds = Array.isArray(args.parentIds)
      ? args.parentIds.filter((id): id is string => typeof id === 'string')
      : [];
    const properties = Array.isArray(args.properties)
      ? args.properties.filter((property): property is string => typeof property === 'string')
      : [];
    return mcpCanvasService.searchProperties(draftId, parentIds, properties);
  }
  if (toolName === 'canvas.find_empty_space') {
    const width = typeof args.width === 'number' ? args.width : 100;
    const height = typeof args.height === 'number' ? args.height : 100;
    const direction =
      args.direction === 'right' ||
      args.direction === 'bottom' ||
      args.direction === 'left' ||
      args.direction === 'top'
        ? args.direction
        : 'right';
    const padding = typeof args.padding === 'number' ? args.padding : 100;
    const nearShapeId = typeof args.nearShapeId === 'string' ? args.nearShapeId : null;
    return mcpCanvasService.findEmptySpace(draftId, width, height, direction, padding, nearShapeId);
  }
  if (toolName === 'canvas.get_layer_tree') {
    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : Infinity;
    return mcpCanvasService.getLayerTree(draftId, maxDepth);
  }
  if (toolName === 'canvas.stack_layout') {
    const parentId = typeof args.parentId === 'string' ? args.parentId : null;
    if (!parentId) {
      throw new McpInvalidToolArgumentsError('parentId is required');
    }
    const direction = args.direction === 'horizontal' ? 'horizontal' : 'vertical';
    const gap = typeof args.gap === 'number' ? args.gap : 16;
    const align =
      args.align === 'center' || args.align === 'end' || args.align === 'stretch'
        ? args.align
        : 'start';
    const justify =
      args.justify === 'center' ||
      args.justify === 'end' ||
      args.justify === 'space_between' ||
      args.justify === 'space_around'
        ? args.justify
        : 'start';
    const padding = parsePadding(args.padding);
    return mcpCanvasService.applyCanvasOps(draftId, [
      {
        type: 'update_shape',
        id: parentId,
        props: {
          layoutMode: direction,
          layoutGap: gap,
          layoutAlign: align,
          layoutJustify: justify,
          ...(padding
            ? {
                paddingTop: padding.top,
                paddingRight: padding.right,
                paddingBottom: padding.bottom,
                paddingLeft: padding.left,
              }
            : {}),
        },
      },
    ]);
  }
  if (toolName === 'canvas.create_chart') {
    return mcpCanvasService.applyCanvasOps(draftId, buildChartOps(args));
  }
  if (toolName === 'canvas.screenshot') {
    const shapeIds = Array.isArray(args.shapeIds)
      ? args.shapeIds.filter((id): id is string => typeof id === 'string')
      : null;
    const scale = typeof args.scale === 'number' ? args.scale : 2;
    return mcpCanvasService.takeScreenshot(draftId, shapeIds, scale);
  }
  if (toolName === 'canvas.align') {
    const ids = Array.isArray(args.ids)
      ? args.ids.filter((id): id is string => typeof id === 'string')
      : [];
    const axis = typeof args.axis === 'string' ? args.axis : 'left';
    return mcpCanvasService.alignShapes(draftId, ids, axis);
  }
  if (toolName === 'canvas.distribute') {
    const ids = Array.isArray(args.ids)
      ? args.ids.filter((id): id is string => typeof id === 'string')
      : [];
    const axis = typeof args.axis === 'string' ? args.axis : 'horizontal';
    const gap = typeof args.gap === 'number' ? args.gap : undefined;
    return mcpCanvasService.distributeShapes(draftId, ids, axis, gap);
  }
  if (toolName === 'canvas.measure_text') {
    const content = typeof args.content === 'string' ? args.content : '';
    const fontSize = typeof args.fontSize === 'number' ? args.fontSize : 16;
    const fontFamily = typeof args.fontFamily === 'string' ? args.fontFamily : 'Inter';
    const fontWeight = typeof args.fontWeight === 'number' ? args.fontWeight : 400;
    const maxWidth = typeof args.maxWidth === 'number' ? args.maxWidth : undefined;
    return mcpCanvasService.measureText(
      draftId,
      content,
      fontSize,
      fontFamily,
      fontWeight,
      maxWidth,
    );
  }
  if (toolName === 'canvas.create_frame') {
    const frameProps = (args.props && typeof args.props === 'object' ? args.props : {}) as Record<
      string,
      unknown
    >;
    const layout = (args.layout && typeof args.layout === 'object' ? args.layout : null) as Record<
      string,
      unknown
    > | null;
    const children = Array.isArray(args.children) ? args.children : [];
    const ref = typeof args.ref === 'string' ? args.ref : undefined;

    const ops: McpCanvasOp[] = [];

    const layoutProps: Record<string, unknown> = {};
    if (layout) {
      if (layout.direction) layoutProps.layoutMode = layout.direction;
      if (typeof layout.gap === 'number') layoutProps.layoutGap = layout.gap;
      if (layout.align) layoutProps.layoutAlign = layout.align;
      if (layout.justify) layoutProps.layoutJustify = layout.justify;
      const pad = parsePadding(layout.padding);
      if (pad) {
        layoutProps.paddingTop = pad.top;
        layoutProps.paddingRight = pad.right;
        layoutProps.paddingBottom = pad.bottom;
        layoutProps.paddingLeft = pad.left;
      }
    }

    const frameRef = ref ?? '_frame';
    ops.push({
      type: 'add_shape',
      shapeType: 'frame',
      ref: frameRef,
      props: { ...frameProps, ...layoutProps },
    } as McpCanvasOp);

    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const childRaw = child as Record<string, unknown>;
      const shapeType = typeof childRaw.shapeType === 'string' ? childRaw.shapeType : null;
      if (!shapeType) continue;
      const childProps = (
        childRaw.props && typeof childRaw.props === 'object' ? childRaw.props : {}
      ) as Record<string, unknown>;
      const childRef = typeof childRaw.ref === 'string' ? childRaw.ref : undefined;
      ops.push({
        type: 'add_shape',
        shapeType,
        ...(childRef ? { ref: childRef } : {}),
        props: { ...childProps, parentId: `@${frameRef}` },
      } as McpCanvasOp);
    }

    return mcpCanvasService.applyCanvasOps(draftId, ops);
  }

  return null;
}

const canvasOpJsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'add_shape' },
        shapeType: {
          type: 'string',
          enum: [
            'rectangle',
            'ellipse',
            'frame',
            'text',
            'path',
            'group',
            'line',
            'arrow',
            'star',
            'polygon',
            'image',
            'svg',
          ],
        },
        ref: {
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
          minLength: 1,
          maxLength: 64,
        },
        props: { type: 'object', additionalProperties: true },
      },
      required: ['type', 'shapeType'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'update_shape' },
        id: { type: 'string' },
        props: { type: 'object', additionalProperties: true },
      },
      required: ['type', 'id', 'props'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'delete_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'move_stack' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        direction: { type: 'string', enum: ['forward', 'backward', 'front', 'back'] },
      },
      required: ['type', 'ids', 'direction'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'group_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 2 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'ungroup_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'duplicate_shapes' },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 },
        offset: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['x', 'y'],
          additionalProperties: false,
        },
        refs: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]+$',
            minLength: 1,
            maxLength: 64,
          },
          minItems: 1,
          maxItems: 100,
        },
      },
      required: ['type', 'ids'],
      additionalProperties: false,
    },
  ],
} as const;

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'projects.list',
    description: 'List projects for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        sort: {
          type: 'string',
          enum: ['last_edited', 'last_created', 'alphabetical'],
        },
      },
      additionalProperties: false,
    },
    requiredScope: 'mcp:projects:read',
    handler: async (auth, args) => {
      const { paginationSchema, sortSchema } = await import('@draftila/shared');
      const parsedPagination = paginationSchema.safeParse({
        cursor: args.cursor,
        limit: args.limit,
      });
      const parsedSort = sortSchema.safeParse(args.sort ?? 'last_edited');
      if (!parsedPagination.success || !parsedSort.success) {
        throw new McpInvalidToolArgumentsError('expected valid pagination and sort arguments');
      }
      const result = await projectsService.listByOwner(
        auth.ownerId,
        parsedPagination.data.cursor,
        parsedPagination.data.limit,
        parsedSort.data,
      );
      const filtered = result.data.filter((project) => {
        if (auth.projectIds && !auth.projectIds.has(project.id)) {
          return false;
        }
        return true;
      });
      return textResult({
        data: filtered,
        nextCursor: result.nextCursor,
      });
    },
  },
  {
    name: 'drafts.list',
    description: 'List drafts for the authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        sort: {
          type: 'string',
          enum: ['last_edited', 'last_created', 'alphabetical'],
        },
      },
      additionalProperties: false,
    },
    requiredScope: 'mcp:drafts:read',
    handler: async (auth, args) => {
      const { paginationSchema, sortSchema } = await import('@draftila/shared');
      const parsedPagination = paginationSchema.safeParse({
        cursor: args.cursor,
        limit: args.limit,
      });
      const parsedSort = sortSchema.safeParse(args.sort ?? 'last_edited');
      if (!parsedPagination.success || !parsedSort.success) {
        throw new McpInvalidToolArgumentsError('expected valid pagination and sort arguments');
      }
      const result = await draftsService.listByOwner(
        auth.ownerId,
        parsedPagination.data.cursor,
        parsedPagination.data.limit,
        parsedSort.data,
      );
      const filtered = result.data.filter((draft) => canAccessDraft(auth, draft));
      return textResult({
        data: filtered,
        nextCursor: result.nextCursor,
      });
    },
  },
  {
    name: 'drafts.get',
    description: 'Get a draft metadata object by id',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:drafts:read',
    handler: async (auth, args) => {
      const draft = await resolveDraft(auth, args.draftId);
      return textResult({ draft });
    },
  },
  {
    name: 'canvas.snapshot',
    description:
      'Get the current canvas shape snapshot for a draft. Returns all shapes with their key properties including type, position, dimensions, fills, strokes, text content, font settings, layout mode, and more. Use canvas.get_shape for the complete properties of a specific shape. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentId: {
          type: 'string',
          description: 'Optional: only return shapes within this parent frame/group.',
        },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Maximum depth to descend into children. If omitted, returns all shapes.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.snapshot'),
  },
  {
    name: 'canvas.find_shapes',
    description:
      'Find shapes by name/type/parent to discover shape ids. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        nameContains: { type: 'string' },
        type: {
          type: 'string',
          enum: [
            'rectangle',
            'ellipse',
            'frame',
            'text',
            'path',
            'group',
            'line',
            'arrow',
            'star',
            'polygon',
            'image',
            'svg',
          ],
        },
        parentId: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        limit: { type: 'number', minimum: 1, maximum: 200 },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.find_shapes'),
  },
  {
    name: 'canvas.get_shape',
    description:
      'Get the full properties of a specific shape by id. Returns all properties including fills, strokes, text content, font settings, etc. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeId: { type: 'string' },
      },
      required: ['draftId', 'shapeId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_shape'),
  },
  {
    name: 'canvas.apply_ops',
    description:
      'Apply shape operations to a draft canvas. Works without an active editor session.\n\nShape types and their key properties:\n- rectangle: fills, strokes, cornerRadius (or cornerRadiusTL/TR/BL/BR), shadows, blurs\n- ellipse: fills, strokes, shadows, blurs\n- frame: fills, strokes, clip (default true), shadows, blurs, layoutMode, layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify\n- text: content (the text string), fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, fills (controls text color), segments (rich text)\n- path: points, svgPathData, fills, strokes\n- line: x1, y1, x2, y2, strokes\n- arrow: x1, y1, x2, y2, strokes, startArrowhead, endArrowhead\n- polygon: sides, fills, strokes\n- star: points (number of points), innerRadius, fills, strokes\n- image: use canvas.set_image after creation to set the source\n- svg: svgContent (raw SVG markup string), preserveAspectRatio\n- group: container for grouping shapes\n\nCommon properties (all shapes): x, y, width, height, rotation, opacity, visible, locked, name, parentId\n\nText shapes: set "content" for the displayed text. Text color is controlled by "fills" (e.g. fills:[{color:"#FFFFFF"}]). Text shapes without explicit width/height are auto-sized to fit content.\n\nAvailable fonts (built-in): Inter, Arial, Helvetica, Times New Roman, Georgia, Courier New, system-ui, sans-serif, serif, monospace. Any Google Font name is also supported and will be loaded automatically.\n\nFills: each fill can have color, opacity (0-1, default 1), visible (default true), and optional gradient. Partial fill objects are fine \u2014 missing fields get defaults.\n\nGradient fills: any fill can include a "gradient" object. Linear: {type:"linear", angle:90, stops:[{color:"#FF0000",position:0},{color:"#0000FF",position:1}]}. Radial: {type:"radial", cx:0.5, cy:0.5, r:0.5, stops:[...]}.\n\nStrokes: color, width, opacity, visible, cap (butt/round/square), join (miter/round/bevel), align (center/inside/outside), dashPattern (solid/dash/dot/dash-dot). Per-side: "sides":{top:true, right:false, bottom:true, left:false} (rectangles/frames only).\n\nShadows: [{type:"drop"|"inner", x:0, y:4, blur:8, spread:0, color:"#00000040"}]\n\nBlurs: [{type:"background", radius:10}] for glassmorphism. [{type:"layer", radius:4}] for layer blur.\n\nAuto-layout: set layoutMode to "horizontal"/"vertical" with layoutGap, paddingTop/Right/Bottom/Left, layoutAlign (start/center/end/stretch), layoutJustify (start/center/end/space_between/space_around). Children can set layoutSizingHorizontal/layoutSizingVertical to "fill" to stretch.\n\nRich text: text shapes support "segments" array for inline styling: [{text:"Hello ", color:"#FFFFFF"}, {text:"world", color:"#8B5CF6", fontWeight:700}]. Each segment can override: color, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, letterSpacing, gradient.\n\nSVG paths/icons: path shapes support "svgPathData" (SVG path d attribute string) for vector icons.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ops: {
          type: 'array',
          items: canvasOpJsonSchema,
          minItems: 1,
          maxItems: 200,
        },
      },
      required: ['draftId', 'ops'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.apply_ops'),
  },
  {
    name: 'canvas.apply_op',
    description:
      'Apply a single shape operation to a draft canvas. Works without an active editor session. See canvas.apply_ops for full documentation on shape types, properties, fonts, fills, strokes, gradients, shadows, blurs, auto-layout, rich text, SVG shapes, and SVG paths.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        op: canvasOpJsonSchema,
      },
      required: ['draftId', 'op'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.apply_op'),
  },
  {
    name: 'canvas.stack_layout',
    description:
      'Apply auto-layout settings to a frame so children can be arranged responsively instead of manual x/y placement. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentId: {
          type: 'string',
          description: 'Frame id that should become an auto-layout stack.',
        },
        direction: { type: 'string', enum: ['horizontal', 'vertical'] },
        gap: { type: 'number', minimum: 0, description: 'Spacing between children.' },
        align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
        justify: {
          type: 'string',
          enum: ['start', 'center', 'end', 'space_between', 'space_around'],
        },
        padding: {
          oneOf: [
            { type: 'number', minimum: 0 },
            {
              type: 'object',
              properties: {
                top: { type: 'number', minimum: 0 },
                right: { type: 'number', minimum: 0 },
                bottom: { type: 'number', minimum: 0 },
                left: { type: 'number', minimum: 0 },
              },
              additionalProperties: false,
            },
          ],
        },
      },
      required: ['draftId', 'parentId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.stack_layout'),
  },
  {
    name: 'canvas.create_frame',
    description:
      'Create a frame with optional children and auto-layout in a single call. Combines frame creation, child insertion, and layout configuration to reduce round-trips. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        props: {
          type: 'object',
          additionalProperties: true,
          description:
            'Frame properties (x, y, width, height, fills, strokes, cornerRadius, name, parentId, etc.)',
        },
        layout: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['horizontal', 'vertical'] },
            gap: { type: 'number', minimum: 0 },
            align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
            justify: {
              type: 'string',
              enum: ['start', 'center', 'end', 'space_between', 'space_around'],
            },
            padding: {
              oneOf: [
                { type: 'number', minimum: 0 },
                {
                  type: 'object',
                  properties: {
                    top: { type: 'number', minimum: 0 },
                    right: { type: 'number', minimum: 0 },
                    bottom: { type: 'number', minimum: 0 },
                    left: { type: 'number', minimum: 0 },
                  },
                },
              ],
            },
          },
          description:
            'Optional auto-layout configuration. If provided, the frame becomes an auto-layout container.',
        },
        children: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              shapeType: {
                type: 'string',
                enum: [
                  'rectangle',
                  'ellipse',
                  'frame',
                  'text',
                  'path',
                  'group',
                  'line',
                  'arrow',
                  'star',
                  'polygon',
                  'image',
                  'svg',
                ],
              },
              ref: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', minLength: 1, maxLength: 64 },
              props: { type: 'object', additionalProperties: true },
            },
            required: ['shapeType'],
          },
          description: 'Optional child shapes to create inside the frame.',
        },
        ref: {
          type: 'string',
          pattern: '^[a-zA-Z0-9_-]+$',
          minLength: 1,
          maxLength: 64,
          description: 'Optional ref name for the frame, returned in createdRefs.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.create_frame'),
  },
  {
    name: 'canvas.create_chart',
    description:
      'Create a data-driven bar or line chart from label/value pairs. Produces editable native shapes (frame, path/rectangles, text, axes). Supports gridlines with Y-axis value labels and smooth curve interpolation for line charts. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        type: { type: 'string', enum: ['bar', 'line'] },
        data: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
            },
            required: ['label', 'value'],
            additionalProperties: false,
          },
        },
        title: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number', minimum: 120 },
        height: { type: 'number', minimum: 120 },
        parentId: { type: 'string' },
        color: { type: 'string' },
        axisColor: { type: 'string' },
        gridlines: {
          type: 'boolean',
          description: 'Show horizontal gridlines with Y-axis value labels. Defaults to true.',
        },
        gridlineCount: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          description: 'Number of gridline intervals. Defaults to 4.',
        },
        smooth: {
          type: 'boolean',
          description:
            'Use smooth curve interpolation for line charts (Catmull-Rom spline). Defaults to false.',
        },
      },
      required: ['draftId', 'type', 'data'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.create_chart'),
  },
  {
    name: 'canvas.set_image',
    description:
      'Set the image source for an image shape. Accepts a URL or base64 data URI. Create an image shape first with canvas.apply_op, then use this tool to set its source. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeId: { type: 'string', description: 'The id of the image shape to set the source for' },
        src: {
          type: 'string',
          description:
            'Image source: a URL (https://...) or a base64 data URI (data:image/png;base64,...)',
        },
        fit: {
          type: 'string',
          enum: ['fill', 'fit', 'crop'],
          description: 'How the image fits in the frame. Defaults to fill.',
        },
      },
      required: ['draftId', 'shapeId', 'src'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.set_image'),
  },
  {
    name: 'canvas.screenshot',
    description:
      'Take a screenshot of the canvas or specific shapes. Returns a PNG image. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description:
            'Optional list of shape IDs to screenshot. If omitted, screenshots the entire canvas.',
        },
        scale: {
          type: 'number',
          minimum: 0.5,
          maximum: 4,
          description: 'Scale factor for the screenshot. Defaults to 2.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.screenshot'),
  },
  {
    name: 'canvas.undo',
    description: 'Undo the last canvas operation. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.undo'),
  },
  {
    name: 'canvas.redo',
    description:
      'Redo the last undone canvas operation. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.redo'),
  },
  {
    name: 'canvas.align',
    description:
      'Align shapes relative to each other. Aligns to the bounding box of the selected shapes. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
        axis: {
          type: 'string',
          enum: ['left', 'center_horizontal', 'right', 'top', 'center_vertical', 'bottom'],
        },
      },
      required: ['draftId', 'ids', 'axis'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.align'),
  },
  {
    name: 'canvas.distribute',
    description:
      'Distribute shapes evenly along an axis. Requires at least 3 shapes. If gap is omitted, distributes evenly within the current bounding box. If gap is specified, spaces shapes with that exact gap. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
        },
        axis: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
        },
        gap: {
          type: 'number',
          description: 'Fixed gap between shapes. If omitted, distributes evenly.',
        },
      },
      required: ['draftId', 'ids', 'axis'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.distribute'),
  },
  {
    name: 'canvas.get_layout',
    description:
      'Inspect the layout structure of the canvas or a subtree. Returns bounding boxes and detects layout problems (overlapping siblings, children clipped by parent frame bounds). Use this to verify designs look correct and identify layout issues. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentId: {
          type: 'string',
          description:
            'Optional parent shape ID to inspect. If omitted, inspects all root-level shapes.',
        },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 10,
          description:
            'How deep to descend into the tree. 0 = only the specified level. Defaults to 1.',
        },
        problemsOnly: {
          type: 'boolean',
          description:
            'If true, only returns shapes that have layout problems (overlapping, clipped). Defaults to false.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_layout'),
  },
  {
    name: 'canvas.move_to_parent',
    description:
      'Move shapes to a different parent (reparent). Moves shapes into a frame or group, or to the root canvas. Use this to build nested layouts by moving shapes into frames. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: 'Shape IDs to move.',
        },
        parentId: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description:
            'Target parent shape ID (must be a frame or group). Use null to move to root canvas.',
        },
        index: {
          type: 'number',
          minimum: 0,
          description:
            'Position among siblings in the target parent. 0 = first. If omitted, appends at the end.',
        },
      },
      required: ['draftId', 'ids', 'parentId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.move_to_parent'),
  },
  {
    name: 'canvas.replace_properties',
    description:
      'Bulk find-and-replace for visual properties across a subtree. Replace colors, fonts, font sizes, font weights, stroke widths, corner radii, and more. Useful for theming, restyling, and design system updates. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description:
            'Parent shape IDs whose subtrees to search. Use root shape IDs for the whole canvas.',
        },
        replacements: {
          type: 'object',
          description:
            'Property replacements to apply. Each key is a property type with an array of {from, to} pairs.',
          properties: {
            fillColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace fill colors (hex). E.g. [{from:"#D9D9D9", to:"#3B82F6"}]',
            },
            textColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace text fill colors (hex).',
            },
            strokeColor: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace stroke colors (hex).',
            },
            fontFamily: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
              },
              description: 'Replace font families. E.g. [{from:"Inter", to:"Roboto"}]',
            },
            fontSize: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace font sizes.',
            },
            fontWeight: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace font weights.',
            },
            cornerRadius: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace corner radii.',
            },
            strokeWidth: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'number' }, to: { type: 'number' } },
                required: ['from', 'to'],
              },
              description: 'Replace stroke widths.',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['draftId', 'parentIds', 'replacements'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:write',
    handler: relayHandler('canvas.replace_properties'),
  },
  {
    name: 'canvas.search_properties',
    description:
      'Find all unique visual property values used across a subtree. Returns unique fill colors, text colors, stroke colors, font families, font sizes, font weights, corner radii, and stroke widths. Useful for design audits, understanding the color palette, and preparing bulk replacements. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        parentIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description: 'Parent shape IDs whose subtrees to search.',
        },
        properties: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'fillColor',
              'textColor',
              'strokeColor',
              'fontFamily',
              'fontSize',
              'fontWeight',
              'cornerRadius',
              'strokeWidth',
            ],
          },
          minItems: 1,
          description: 'Which properties to search for.',
        },
      },
      required: ['draftId', 'parentIds', 'properties'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.search_properties'),
  },
  {
    name: 'canvas.find_empty_space',
    description:
      'Find empty space on the canvas for placing new content. Searches in a given direction from existing content or a specific shape to find an unoccupied area of the requested size. Useful for adding new screens or components without overlapping existing designs. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        width: { type: 'number', minimum: 1, description: 'Required width of the empty space.' },
        height: { type: 'number', minimum: 1, description: 'Required height of the empty space.' },
        direction: {
          type: 'string',
          enum: ['right', 'bottom', 'left', 'top'],
          description: 'Direction to search for empty space. Defaults to "right".',
        },
        padding: {
          type: 'number',
          minimum: 0,
          description: 'Minimum padding from existing shapes. Defaults to 100.',
        },
        nearShapeId: {
          type: 'string',
          description:
            'Optional shape ID to search near. If omitted, searches relative to all canvas content.',
        },
      },
      required: ['draftId', 'width', 'height'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.find_empty_space'),
  },
  {
    name: 'canvas.get_layer_tree',
    description:
      'Get the hierarchical layer tree of the canvas. Returns shapes organized by parent-child relationships as a nested tree structure, making it easy to understand the document hierarchy. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Maximum depth to return. If omitted, returns the full tree.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.get_layer_tree'),
  },
  {
    name: 'canvas.get_guidelines',
    description:
      'Get contextual design guidelines and best practices for a specific design task type. Returns layout rules, spacing recommendations, typography guidance, and composition tips relevant to the task.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: [
            'landing-page',
            'mobile-app',
            'web-app',
            'dashboard',
            'design-system',
            'slides',
            'typography',
            'color',
            'layout',
          ],
          description: 'The type of design task to get guidelines for.',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: async (_auth, args) => {
      return textResult(getDesignGuidelines(args.topic as string));
    },
  },
  {
    name: 'canvas.measure_text',
    description:
      'Estimate the rendered dimensions of a text string given font parameters. Returns approximate width, height, and line count. Useful for pre-calculating layout sizes before creating text shapes. Works without an active editor session.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        content: {
          type: 'string',
          description: 'The text content to measure.',
        },
        fontSize: {
          type: 'number',
          minimum: 1,
          description: 'Font size in pixels. Defaults to 16.',
        },
        fontFamily: {
          type: 'string',
          description: 'Font family name. Defaults to "Inter".',
        },
        fontWeight: {
          type: 'number',
          description: 'Font weight (100-900). Defaults to 400.',
        },
        maxWidth: {
          type: 'number',
          minimum: 1,
          description:
            'Maximum width constraint for text wrapping. If omitted, measures single-line width.',
        },
      },
      required: ['draftId', 'content'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.measure_text'),
  },
  {
    name: 'canvas.focus_view',
    description:
      'Pan and zoom the editor viewport to focus on specific shapes or a canvas region. Requires the draft to be open in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        shapeIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: 'Shape IDs to focus on. The viewport will fit all specified shapes.',
        },
        bounds: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
          },
          required: ['x', 'y', 'width', 'height'],
          description: 'Explicit viewport bounds to focus on. Ignored if shapeIds is provided.',
        },
        padding: {
          type: 'number',
          minimum: 0,
          description: 'Extra padding around the focused area in pixels. Defaults to 50.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    requiredScope: 'mcp:canvas:read',
    handler: relayHandler('canvas.focus_view'),
  },
];

const toolsByName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

export { MCP_TOOLS, toolsByName };
export type { McpToolDefinition, ToolResult };
