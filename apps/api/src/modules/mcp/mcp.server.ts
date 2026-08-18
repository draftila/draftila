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

const INSTRUCTIONS = `Draftila is a collaborative design tool. Tools execute on the server against the draft's live document; anyone with the draft open in a browser sees your changes in real time. No open editor tab is required.

## Before you start

- Every tool except list_drafts and list_fonts needs a draftId. Get it from list_drafts.
- Shape tools only see the ACTIVE page. list_pages shows which page that is; set_active_page switches. If list_shapes comes back empty, you are usually on the wrong page.
- The endpoint is rate limited to 60 requests per minute — build with the bulk tools (import_html, batch_create_shapes) rather than long chains of single-shape calls.

## Recommended workflow

1. list_drafts, then list_pages.
2. list_shapes with compact: true to see what already exists, and follow its conventions instead of inventing parallel ones. Use find_shapes to locate specific shapes by name, type, or text without dumping the page.
3. list_variables for the draft's globals (its colour tokens), and list_fonts if you need a non-default typeface.
4. Define any missing globals with set_variable BEFORE you start painting, then bind as you go with colorVar. Retrofitting bindings afterwards costs an extra call per shape.
5. Build at the right granularity: import_html for a whole screen or section (write Tailwind HTML, get a native shape tree in one call), batch_create_shapes with nested children for a component or card, create_shape for individual tweaks.
6. Check your work with export_png — it returns the rendered image so you can actually look at the result. Read the warnings array that import and create tools return.

## Building well

- import_html is the fastest path for new designs: flex/gap/padding classes become native auto-layout, headings and paragraphs become text shapes, and the warnings list tells you what was approximated. Verify with export_png afterwards.
- batch_create_shapes creates a whole tree in one transaction with one layout pass. Express hierarchy with nested children arrays; shapeIds come back in depth-first order.
- Reach for auto-layout first. Set layoutMode "horizontal" or "vertical" on a frame with layoutGap and padding and its children position themselves; manual x/y should be the exception, for top-level containers and deliberate overlaps.
- Render order is creation order: the newest shape sits on top. Create backgrounds before the things that sit on them, and use move_in_stack to fix mistakes.
- Inside an auto-layout frame, sibling order drives the layout. Reorder with move_by_drop ("before"/"after"), which repositions the children immediately. move_in_stack writes the same underlying order but does not trigger a relayout, so its effect appears only at the next change to that frame — avoid it on auto-layout children.
- Frames default to a white fill. Pass fills: [] for a transparent layout wrapper.
- Text auto-sizes to its content by default, so usually just set content and fontSize. For wrapping, set a width and textAutoResize: "height". Mixed styling within one text shape uses segments (see the props docs).
- Bind colours that belong to the design system to globals via colorVar (keeping color as the fallback). Editing one global then repaints every shape bound to it, which is what makes a palette change a single call.
- For a repeated pattern, create_component then create_instance. Instances are independent copies with no live link, so settle the design before stamping out many.
- Use insert_icon (Lucide, discoverable via list_icons) instead of hand-drawing vector icons, and import_svg for existing SVG artwork.
- For images, pass an HTTP(S) URL — the server downloads, validates and stores it with the draft.

## Editing existing work

- Read before you write: find_shapes to locate shapes, get_shape for one shape, list_shapes with recursive: true for a subtree. Use compact: true on large pages so you do not pull the whole document into context.
- update_shape merges top-level props but REPLACES the fills, strokes, shadows and blurs arrays wholesale. Re-send colorVar on anything that should stay bound to a global, or use bind_variable/unbind_variable to change a binding without rewriting the array.
- batch_update_shapes applies many updates at once and reports per-item results — bad shape IDs are skipped, not fatal.
- Create and update tools return a warnings array when props contain unknown keys (typos persist silently otherwise) — read it.
- set_variable on an existing id overwrites it across the entire draft and the user cannot undo it. Call list_variables first when you mean to create a new one.

## Handing off

export_svg, export_png, export_html, export_css, export_tailwind, export_swiftui and export_compose turn a selection into assets or code. export_png supports region capture (x/y/width/height) and is also the way to see what you have actually built.`;

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
