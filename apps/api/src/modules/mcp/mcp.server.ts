import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerShapeTools } from './tools/shape-tools';
import { registerPageTools } from './tools/page-tools';
import { registerLayoutTools } from './tools/layout-tools';
import { registerTransformTools } from './tools/transform-tools';
import { registerComponentTools } from './tools/component-tools';
import { registerExportTools } from './tools/export-tools';
import { registerGuideTools } from './tools/guide-tools';
import { registerDraftTools } from './tools/draft-tools';
import { registerBatchTools } from './tools/batch-tools';
import { registerVariableTools } from './tools/variable-tools';
import { registerIconTools } from './tools/icon-tools';
import { registerFontTools } from './tools/font-tools';

const INSTRUCTIONS = `Draftila is a collaborative design tool. These tools drive a LIVE editor session in the user's browser — every call is rendered on their screen as it happens, so the order and pace of your calls is part of the experience.

## Before you start

- Operations execute inside an open editor tab. If a call returns "No editor tab is open for this draft", ask the user to open that draft in their browser rather than retrying.
- Every tool except list_drafts and list_fonts needs a draftId. Get it from list_drafts.
- Shape tools only see the ACTIVE page. list_pages shows which page that is; set_active_page switches. If list_shapes comes back empty, you are usually on the wrong page.
- Each call has a 30 second timeout.

## Recommended workflow

1. list_drafts, then list_pages.
2. list_shapes with compact: true to see what already exists, and follow its conventions instead of inventing parallel ones.
3. list_variables for the draft's globals (its colour tokens), and list_fonts if you need a non-default typeface.
4. Define any missing globals with set_variable BEFORE you start painting, then bind as you go with colorVar. Retrofitting bindings afterwards costs an extra call per shape.
5. Build with create_shape, one shape at a time, so the user watches the design appear.
6. Check your work with list_shapes, or export_png to actually look at the result.

## Building well

- Prefer create_shape over batch_create_shapes. Use a batch only for a small tightly-coupled cluster — a button with an icon and label, a card with three to five elements — never a whole design or section.
- Reach for auto-layout first. Set layoutMode "horizontal" or "vertical" on a frame with layoutGap and padding and its children position themselves; manual x/y should be the exception, for top-level containers and deliberate overlaps.
- Render order is creation order: the newest shape sits on top. Create backgrounds before the things that sit on them, and use move_in_stack to fix mistakes.
- Order INSIDE an auto-layout frame is child order, not z-order. Reorder those with move_by_drop ("before"/"after") — move_in_stack will not do it.
- Frames default to a white fill. Pass fills: [] for a transparent layout wrapper.
- Text auto-sizes to its content by default, so usually just set content and fontSize. For wrapping, set a width and textAutoResize: "height".
- Bind colours that belong to the design system to globals via colorVar (keeping color as the fallback). Editing one global then repaints every shape bound to it, which is what makes a palette change a single call.
- For a repeated pattern, create_component then create_instance. Instances are independent copies with no live link, so settle the design before stamping out many.
- Use insert_icon (Lucide, discoverable via list_icons) instead of hand-drawing vector icons, and import_svg for existing SVG artwork.
- For images, pass an HTTP(S) URL — the server downloads, validates and stores it with the draft.

## Editing existing work

- Read before you write: get_shape for one shape, list_shapes with recursive: true for a subtree. Use compact: true on large pages so you do not pull the whole document into context.
- update_shape merges top-level props but REPLACES the fills, strokes, shadows and blurs arrays wholesale. Re-send colorVar on anything that should stay bound to a global, or use bind_variable/unbind_variable to change a binding without rewriting the array.
- set_variable on an existing id overwrites it across the entire draft and the user cannot undo it. Call list_variables first when you mean to create a new one.

## Handing off

export_svg, export_png, export_css, export_tailwind, export_swiftui and export_compose turn a selection into assets or code. export_png is also the way to see what you have actually built.`;

export function createMcpServer(getUserId: () => string): McpServer {
  const server = new McpServer(
    {
      name: 'draftila',
      version: '0.1.0',
    },
    { instructions: INSTRUCTIONS },
  );

  registerDraftTools(server, getUserId);
  registerShapeTools(server, getUserId);
  registerBatchTools(server, getUserId);
  registerPageTools(server, getUserId);
  registerLayoutTools(server, getUserId);
  registerTransformTools(server, getUserId);
  registerComponentTools(server, getUserId);
  registerExportTools(server, getUserId);
  registerGuideTools(server, getUserId);
  registerVariableTools(server, getUserId);
  registerIconTools(server, getUserId);
  registerFontTools(server, getUserId);

  return server;
}
