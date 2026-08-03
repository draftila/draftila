import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const draftId = { draftId: z.string().describe('The draft ID to operate on') };

export const draftAndShape = {
  ...draftId,
  shapeId: z.string().describe('The shape ID'),
};

export const draftAndShapes = {
  ...draftId,
  shapeIds: z.array(z.string()).describe('Array of shape IDs'),
};

export const draftAndPage = {
  ...draftId,
  pageId: z.string().describe('The page ID'),
};

export const SHAPE_TYPES = [
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
] as const;

export const SHAPE_TYPE_DOC =
  'Shape type. rectangle: box with optional rounded corners. ellipse: circle/oval. frame: container for child shapes (supports auto-layout, clipping). text: text label (use fills for text color). line: line segment using x1,y1,x2,y2 (not x,y,width,height), supports startArrowhead/endArrowhead. polygon: n-sided shape (set sides). star: star shape (set points, innerRadiusRatio). path: freeform vector path. image: image placeholder (set src to an HTTP(S) URL). svg: embedded SVG content (set svgContent to SVG markup — for complex SVGs prefer the import_svg tool, which handles parsing/conversion).';

// The prop documentation below is shared by create_shape, update_shape and
// their batch variants. Keep it in one place — when these were four separate
// prose blobs they drifted, and the batch path silently lost props.

const IMAGE_IMPORT_DOC =
  'IMAGE IMPORT: HTTP(S) URLs and data URIs in fills[].imageSrc, and HTTP(S) URLs in an image shape\'s src, are downloaded, validated and saved to draft storage before the operation runs, then rewritten to an app-owned URL. If an import fails validation the whole operation fails rather than writing the external URL into the document. Reusing the same URL within one call imports it once.';

const FILLS_DOC =
  'FILLS: fills (array). Solid: [{color: "#6C3CE9", opacity?, visible?}]. Gradient: [{color: "#000000", gradient: {type: "linear", angle: 90, stops: [{color: "#FF0000", position: 0}, {color: "#0000FF", position: 1}]}}] or {type: "radial", cx: 0.5, cy: 0.5, r: 0.5, stops: [...]}. Image fill (works on any shape, not just image shapes): [{imageSrc: "https://example.com/i.png", imageFit: "fill"}] — imageFit is "fill" (stretch to cover), "fit" (contain), "crop" (cover + center) or "tile" (repeat). GLOBALS: any fill, stroke or gradient stop may set colorVar: "<id from list_variables>" to bind it to a draft global; keep color set too, as it is the fallback if the global is missing. NOTE: frames default to a white fill — pass fills: [] for a transparent layout frame.';

const STROKES_DOC =
  'STROKES: strokes (array of {color, width, opacity?, align?: "center"|"inside"|"outside", colorVar?}).';

const EFFECTS_DOC =
  'EFFECTS: shadows (array of {type?: "drop"|"inner" (default "drop"), color, x, y, blur, spread?} — e.g. [{color: "#00000020", x: 0, y: 4, blur: 12}]), blurs (array of {type: "layer"|"background", radius} — "layer" blurs the shape itself, "background" blurs what is behind it for a frosted-glass effect).';

const CORNERS_DOC =
  'CORNERS: cornerRadius (uniform), cornerRadiusTL/TR/BL/BR (per-corner overrides), cornerSmoothing (0-1, iOS-style squircle smoothing).';

const LINE_DOC =
  'LINE SHAPES: use x1,y1,x2,y2 instead of x,y,width,height. startArrowhead/endArrowhead ("none"|"line_arrow"|"triangle_arrow"|"reversed_triangle"|"circle_arrow"|"diamond_arrow").';

const TEXT_DOC =
  'TEXT SHAPES: text auto-sizes to fit its content by default (textAutoResize defaults to "width"), so you usually only need content, fontSize and a position. Use fills for text color (e.g. fills: [{color: "#ffffff"}]). Props: content (the string), fontSize (default 16), fontFamily (default Inter — ~277 built-in Google families are usable by exact name; call list_fonts for admin-uploaded custom families and the weights they ship), fontWeight (default 400), fontStyle (normal|italic), textAlign (left|center|right), verticalAlign (top|middle|bottom), lineHeight (default 1.2), letterSpacing, textDecoration (none|underline|strikethrough), textTransform (none|uppercase|lowercase|capitalize), textAutoResize ("none"|"width"|"height" — "width" grows horizontally to fit, "height" wraps within a fixed width and grows vertically, "none" is fully manual), textTruncation ("none"|"ending" — "ending" truncates overflow with an ellipsis).';

const FRAME_DOC =
  'FRAME PROPERTIES: clip (boolean, default true — clips children to the frame; set false to allow overflow), layoutMode ("horizontal"|"vertical" — enables auto-layout, a flex-like system that positions children for you), layoutWrap ("nowrap"|"wrap"), layoutGap (main-axis spacing), layoutGapColumn (cross-axis gap between rows when wrapping), paddingTop/Right/Bottom/Left, layoutAlign ("start"|"center"|"end"|"stretch" — cross-axis), layoutJustify ("start"|"center"|"end"|"space_between"|"space_around" — main-axis), layoutSizingHorizontal/layoutSizingVertical ("fixed"|"hug"|"fill" — "hug" shrinks the frame to fit its children). AUTO-LAYOUT CHILD CONSTRAINTS: minWidth, maxWidth, minHeight, maxHeight (constrain a child within an auto-layout frame; prevents clipping on badges and cards). When layoutMode is set you do NOT set x/y on children — the layout owns their positions. To make a button: a frame with layoutMode="horizontal", padding, cornerRadius and fills, containing a text child.';

function geometryDoc(parentIdDoc: string): string {
  return `GEOMETRY: x, y (relative to the parent when parentId is set — x=20,y=20 inside a frame means 20px from the frame's top-left corner; otherwise canvas coordinates), width, height, rotation, name, opacity, visible, locked, ${parentIdDoc}`;
}

const SHARED_PROPS_DOC = [
  FILLS_DOC,
  STROKES_DOC,
  EFFECTS_DOC,
  CORNERS_DOC,
  LINE_DOC,
  TEXT_DOC,
  FRAME_DOC,
].join(' ');

export const CREATE_PROPS_DOC = [
  IMAGE_IMPORT_DOC,
  geometryDoc('parentId (nest inside an existing frame).'),
  SHARED_PROPS_DOC,
].join(' ');

export const BATCH_CREATE_PROPS_DOC = [
  IMAGE_IMPORT_DOC,
  geometryDoc(
    'parentId — use "$0", "$1" etc. to reference shapes created earlier in this same batch, or a real shape ID to nest inside an existing frame.',
  ),
  SHARED_PROPS_DOC,
].join(' ');

export const UPDATE_PROPS_DOC = [
  IMAGE_IMPORT_DOC,
  'ARRAYS ARE REPLACED WHOLESALE: fills, strokes, shadows and blurs overwrite the existing array rather than merging. Re-send colorVar on any item that should stay bound to a global, or use bind_variable/unbind_variable to change a binding without rewriting the array.',
  geometryDoc('parentId (reparent into a frame).'),
  SHARED_PROPS_DOC,
].join(' ');

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: ToolContent[] }>;

interface McpToolRegistrar {
  tool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    cb: ToolHandler,
  ): void;
}

export function defineTool(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  cb: ToolHandler,
) {
  (server as unknown as McpToolRegistrar).tool(name, description, schema, cb);
}
