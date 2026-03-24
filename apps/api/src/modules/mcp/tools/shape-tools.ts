import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendToolRpc } from '../mcp.auth';
import { draftId, draftAndShape, draftAndShapes, defineTool } from './schemas';

export function registerShapeTools(server: McpServer, getUserId: () => string) {
  defineTool(
    server,
    'create_shape',
    'Create a new shape on the active page. For building complex designs (cards, sections, pages), prefer batch_create_shapes — it is faster and supports $0/$1 parent references. Use create_shape for one-off shapes or when you need to verify placement with export_png before continuing. Shapes are always created on the active page — use set_active_page first if needed. IMPORTANT: Shapes render in creation order (last created = on top). Create background shapes first, then foreground elements (e.g. background rectangle before text on top of it). Use move_in_stack to fix z-order after the fact. TIP: For containers that auto-position children (no manual x/y needed), set layoutMode on frames — see props description for details.',
    {
      ...draftId,
      type: z
        .enum([
          'rectangle',
          'ellipse',
          'frame',
          'text',
          'path',
          'line',
          'polygon',
          'star',
          'image',
          'svg',
        ])
        .describe(
          'Shape type. rectangle: box with optional rounded corners. ellipse: circle/oval. frame: container for child shapes (supports auto-layout, clipping). text: text label (use fills for text color). line: line segment using x1,y1,x2,y2 (not x,y,width,height), supports startArrowhead/endArrowhead ("none"|"line_arrow"|"triangle_arrow"|"reversed_triangle"|"circle_arrow"|"diamond_arrow"). polygon: n-sided shape (set sides). star: star shape (set points, innerRadiusRatio). path: freeform vector path. image: image placeholder. svg: embedded SVG content (set svgContent prop to SVG markup string — for complex SVGs, prefer import_svg tool instead which handles parsing/conversion).',
        ),
      childIndex: z
        .number()
        .optional()
        .describe(
          'Insert position among siblings (0 = first child, 1 = second, etc.). Only applies when parentId is set. Omit to append as last child.',
        ),
      props: z
        .record(z.unknown())
        .optional()
        .describe(
          'Shape properties: x, y (relative to parent if parentId is set, otherwise canvas coordinates — e.g. x=20,y=20 inside a frame means 20px from the frame\'s top-left corner), width, height, rotation, name, opacity, parentId (to nest inside a frame). FILLS: fills (array of {color, opacity?, visible?, gradient?}). Solid: [{color: "#6C3CE9"}]. Gradient: [{color: "#000000", gradient: {type: "linear", angle: 90, stops: [{color: "#FF0000", position: 0}, {color: "#0000FF", position: 1}]}}] or {type: "radial", cx: 0.5, cy: 0.5, r: 0.5, stops: [...]}. NOTE: frames default to white fill — pass fills=[] for transparent layout frames. STROKES: strokes (array of {color, width, opacity?, strokeAlign?: "center"|"inside"|"outside"}). EFFECTS: shadows (array of {color, offsetX, offsetY, blur, spread?} — e.g. [{color: "#00000020", offsetX: 0, offsetY: 4, blur: 12, spread: 0}]), blurs (array of {type: "layer"|"background", radius} — e.g. [{type: "layer", radius: 8}]). CORNERS: cornerRadius (uniform), cornerRadiusTL/TR/BL/BR (per-corner overrides), cornerSmoothing (0-1, iOS-style smoothing). LINE SHAPES: use x1,y1,x2,y2 instead of x,y,width,height. startArrowhead/endArrowhead ("none"|"line_arrow"|"triangle_arrow"|"reversed_triangle"|"circle_arrow"|"diamond_arrow"). TEXT SHAPES: text width auto-sizes to fit content by default (textAutoResize defaults to "width"), so you usually only need to set content, fontSize, and position. Use fills to set text color (e.g. fills: [{color: "#ffffff"}] for white text). content (the text string), fontSize (default 16), fontFamily (default Inter), fontWeight (default 400), fontStyle (normal|italic), textAlign (left|center|right), verticalAlign (top|middle|bottom), lineHeight (default 1.2), letterSpacing, textDecoration (none|underline|strikethrough), textTransform (none|uppercase|lowercase|capitalize), textAutoResize ("none"|"width"|"height" — defaults to "width"; "width" auto-sizes horizontally to fit text, "height" wraps text within a fixed width and auto-sizes height, "none" is fully manual). FRAME PROPERTIES: clip (boolean, default true — clips children to frame bounds; set false to allow overflow), layoutMode ("horizontal"|"vertical" — enables auto-layout, a flex-like system that positions children automatically), layoutGap (spacing between children), paddingTop/Right/Bottom/Left, layoutAlign ("start"|"center"|"end"|"stretch" — cross-axis), layoutJustify ("start"|"center"|"end"|"space_between" — main-axis), layoutSizingHorizontal/layoutSizingVertical ("fixed"|"hug"|"fill" — "hug" shrinks frame to fit children). When layoutMode is set, child positions are managed by the layout — you do NOT need to set x/y on children. To make a button: create a frame with layoutMode="horizontal", padding, cornerRadius, fills, and a text child.',
        ),
    },
    async ({ draftId, type, props, childIndex }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'create_shape', {
        type,
        props,
        childIndex,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'get_shape',
    'Get a shape by ID with all its properties. For children inside a frame, x/y are relative to the parent frame.',
    draftAndShape,
    async ({ draftId, shapeId }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'get_shape', { shapeId });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'update_shape',
    'Update shape properties (position, size, fills, strokes, text, etc.)',
    {
      ...draftAndShape,
      props: z
        .record(z.unknown())
        .describe(
          'Properties to update (same format as create_shape props): x, y (relative to parent for child shapes), width, height, rotation, name, opacity, visible, locked, fills (with optional gradient — see create_shape for format), strokes, shadows, blurs, cornerRadius, cornerRadiusTL/TR/BL/BR, cornerSmoothing. Text: content, fontSize, fontFamily, fontWeight, fontStyle, textAlign, verticalAlign, lineHeight, letterSpacing, textDecoration, textTransform, textAutoResize. Frame: clip, layoutMode, layoutGap, paddingTop/Right/Bottom/Left, layoutAlign, layoutJustify, layoutSizingHorizontal, layoutSizingVertical',
        ),
    },
    async ({ draftId, shapeId, props }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'update_shape', {
        shapeId,
        props,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'delete_shapes',
    'Delete one or more shapes',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'delete_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'list_shapes',
    'List all shapes on the active page (or children of a specific parent). Returns full shape objects with all properties (type, x, y, width, height, fills, etc.) — use this to inspect layout and debug positioning. Returns only shapes on the currently active page — use set_active_page to switch pages first if needed. If you get 0 shapes, check which page is active with list_pages.',
    {
      ...draftId,
      parentId: z.string().optional().describe('Filter to children of this parent shape'),
      recursive: z
        .boolean()
        .optional()
        .describe(
          'When true, returns a tree with nested children arrays instead of a flat list. Useful for understanding the full hierarchy in one call.',
        ),
    },
    async ({ draftId, parentId, recursive }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'list_shapes', {
        parentId,
        recursive,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );

  defineTool(
    server,
    'duplicate_shapes',
    'Duplicate shapes in place, returns mapping of old IDs to new IDs',
    draftAndShapes,
    async ({ draftId, shapeIds }) => {
      const result = await sendToolRpc(draftId as string, getUserId(), 'duplicate_shapes', {
        shapeIds,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    },
  );
}
