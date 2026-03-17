# Feature Parity: MCP vs Editor

This document tracks which features exist in the MCP API, the Editor UI, or both, and whether missing features should be added to achieve consistency.

## Legend

- **MCP**: Available via MCP tools (AI agents)
- **Editor**: Available in the browser editor UI
- **Engine**: Supported by `@draftila/engine` (data layer)
- **Add to MCP?** / **Add to Editor?**: Whether the feature should be ported

---

## 1. Canvas Operations (Tools / Actions)

| #   | Feature                   | MCP                                   | Editor                       | Engine              | Add to MCP? | Add to Editor? | Notes                                                       |
| --- | ------------------------- | ------------------------------------- | ---------------------------- | ------------------- | ----------- | -------------- | ----------------------------------------------------------- |
| 1   | Add shape                 | `canvas.apply_ops` (add_shape)        | Toolbar draw tools           | `addShape`          | -           | -              | Full parity                                                 |
| 2   | Update shape              | `canvas.apply_ops` (update_shape)     | Right panel properties       | `updateShape`       | -           | -              | Full parity                                                 |
| 3   | Delete shapes             | `canvas.apply_ops` (delete_shapes)    | Delete key / context menu    | `deleteShapes`      | -           | -              | Full parity                                                 |
| 4   | Duplicate shapes          | `canvas.apply_ops` (duplicate_shapes) | Cmd+D / context menu         | `duplicateShapes`   | -           | -              | Full parity                                                 |
| 5   | Group shapes              | `canvas.apply_ops` (group_shapes)     | Cmd+G / context menu         | `groupShapes`       | -           | -              | Full parity                                                 |
| 6   | Ungroup shapes            | `canvas.apply_ops` (ungroup_shapes)   | Cmd+Shift+G / context menu   | `ungroupShapes`     | -           | -              | Full parity                                                 |
| 7   | Move in stack (z-order)   | `canvas.apply_ops` (move_stack)       | Cmd+] / Cmd+[ / context menu | `moveShapesInStack` | -           | -              | Full parity                                                 |
| 8   | Align shapes              | `canvas.align`                        | No                           | `alignShapes`       | -           | Yes            | Editor has engine support but no UI button for alignment    |
| 9   | Distribute shapes         | `canvas.distribute`                   | No                           | `distributeShapes`  | -           | Yes            | Editor has engine support but no UI button for distribution |
| 10  | Move to parent (reparent) | `canvas.move_to_parent`               | Layer panel drag-and-drop    | `moveShapesByDrop`  | -           | -              | Full parity (different UX)                                  |
| 11  | Undo                      | `canvas.undo`                         | Cmd+Z                        | `undo`              | -           | -              | Full parity                                                 |
| 12  | Redo                      | `canvas.redo`                         | Cmd+Shift+Z                  | `redo`              | -           | -              | Full parity                                                 |
| 13  | Set image source          | `canvas.set_image`                    | Right panel Image section    | `updateShape`       | -           | -              | Full parity                                                 |
| 14  | Nudge shapes              | No                                    | Arrow keys                   | `nudgeShapes`       | No          | -              | Interactive-only; not useful for MCP                        |

---

## 2. Canvas Read / Query Operations

| #   | Feature                  | MCP                        | Editor                       | Engine         | Add to MCP? | Add to Editor? | Notes                                                          |
| --- | ------------------------ | -------------------------- | ---------------------------- | -------------- | ----------- | -------------- | -------------------------------------------------------------- |
| 15  | Get canvas snapshot      | `canvas.snapshot`          | Renders on canvas            | `getAllShapes` | -           | -              | Different form: MCP returns JSON, editor renders visually      |
| 16  | Find shapes by criteria  | `canvas.find_shapes`       | No                           | No             | -           | No             | MCP-only convenience for AI; editor users use visual selection |
| 17  | Get single shape details | `canvas.get_shape`         | Right panel shows props      | `getShape`     | -           | -              | Different form                                                 |
| 18  | Get layer tree           | `canvas.get_layer_tree`    | Left panel layer list        | `getLayerTree` | -           | -              | Full parity (different form)                                   |
| 19  | Screenshot (PNG export)  | `canvas.screenshot`        | Export section / Copy as PNG | `exportToPng`  | -           | -              | Full parity                                                    |
| 20  | Get layout with problems | `canvas.get_layout`        | No                           | No             | -           | Yes            | Useful for editor: could show layout warnings/diagnostics      |
| 21  | Search unique properties | `canvas.search_properties` | No                           | No             | -           | Yes            | Useful for editor: "design audit" or "used colors" panel       |
| 22  | Find empty space         | `canvas.find_empty_space`  | No                           | No             | -           | No             | AI-agent-only convenience; editor users place visually         |
| 23  | Get design guidelines    | `canvas.get_guidelines`    | No                           | No             | -           | No             | AI-agent-only; humans use external design references           |

---

## 3. Bulk / Batch Operations

| #   | Feature                             | MCP                                | Editor                    | Engine            | Add to MCP? | Add to Editor? | Notes                                                    |
| --- | ----------------------------------- | ---------------------------------- | ------------------------- | ----------------- | ----------- | -------------- | -------------------------------------------------------- |
| 24  | Replace properties (find & replace) | `canvas.replace_properties`        | No                        | No                | -           | Yes            | Useful for editor: bulk color/font replacement UI        |
| 25  | Batch operations (atomic)           | `canvas.apply_ops` (up to 200 ops) | No (one action at a time) | `ydoc.transact()` | -           | No             | MCP batching is for efficiency; editor doesn't need this |
| 26  | Ref system (@ref cross-references)  | `canvas.apply_ops` ref tokens      | No                        | No                | -           | No             | AI-agent-only; enables multi-shape creation in one call  |

---

## 4. Shape Properties

### 4a. Properties Documented in MCP Tool Descriptions

| #   | Property                                               | MCP Documented             | Editor UI                    | Engine | Add to MCP docs? | Add to Editor? | Notes       |
| --- | ------------------------------------------------------ | -------------------------- | ---------------------------- | ------ | ---------------- | -------------- | ----------- |
| 27  | x, y, width, height                                    | Yes                        | Transform section            | Yes    | -                | -              | Full parity |
| 28  | rotation                                               | Yes                        | Transform section            | Yes    | -                | -              | Full parity |
| 29  | opacity                                                | Yes                        | Appearance section           | Yes    | -                | -              | Full parity |
| 30  | visible                                                | Yes                        | Layer panel eye icon         | Yes    | -                | -              | Full parity |
| 31  | locked                                                 | Yes                        | Layer panel lock icon        | Yes    | -                | -              | Full parity |
| 32  | name                                                   | Yes                        | Layer panel inline name      | Yes    | -                | -              | Full parity |
| 33  | parentId                                               | Yes                        | Layer panel hierarchy        | Yes    | -                | -              | Full parity |
| 34  | fills (solid + gradient)                               | Yes                        | Fill section                 | Yes    | -                | -              | Full parity |
| 35  | strokes (all sub-props)                                | Yes                        | Stroke section               | Yes    | -                | -              | Full parity |
| 36  | per-side strokes (sides)                               | Yes                        | Stroke section toggle        | Yes    | -                | -              | Full parity |
| 37  | shadows (drop + inner)                                 | Yes                        | Effects section              | Yes    | -                | -              | Full parity |
| 38  | blurs (layer + background)                             | Yes                        | Effects section              | Yes    | -                | -              | Full parity |
| 39  | cornerRadius (uniform)                                 | Yes                        | Appearance section           | Yes    | -                | -              | Full parity |
| 40  | cornerRadiusTL/TR/BL/BR                                | Yes                        | Appearance expand toggle     | Yes    | -                | -              | Full parity |
| 41  | Auto-layout (layoutMode, gap, padding, align, justify) | Yes                        | Auto Layout section          | Yes    | -                | -              | Full parity |
| 42  | layoutSizingHorizontal/Vertical                        | Yes                        | Auto Layout section          | Yes    | -                | -              | Full parity |
| 43  | text content                                           | Yes                        | Typography section           | Yes    | -                | -              | Full parity |
| 44  | fontSize, fontFamily, fontWeight                       | Yes                        | Typography section           | Yes    | -                | -              | Full parity |
| 45  | fontStyle, textAlign, verticalAlign                    | Yes                        | Typography section           | Yes    | -                | -              | Full parity |
| 46  | lineHeight, letterSpacing                              | Yes                        | Typography section           | Yes    | -                | -              | Full parity |
| 47  | textDecoration, textTransform                          | Yes                        | Typography section           | Yes    | -                | -              | Full parity |
| 48  | Rich text segments                                     | Yes                        | Rich text segments editor    | Yes    | -                | -              | Full parity |
| 49  | svgPathData                                            | Yes                        | Path Data section            | Yes    | -                | -              | Full parity |
| 50  | polygon sides                                          | Yes (via props)            | Sides section                | Yes    | -                | -              | Full parity |
| 51  | star points + innerRadius                              | Yes (via props)            | Star section                 | Yes    | -                | -              | Full parity |
| 52  | arrow startArrowhead/endArrowhead                      | Yes                        | Via props (no dedicated UI?) | Yes    | -                | -              |             |
| 53  | image src + fit                                        | Yes (via canvas.set_image) | Image section                | Yes    | -                | -              | Full parity |
| 54  | frame clip                                             | Yes                        | Via props                    | Yes    | -                | -              | Full parity |

### 4b. Properties NOT Documented in MCP but Exist in Engine/Editor

| #   | Property               | MCP Documented | Editor UI                                | Engine | Add to MCP docs? | Add to Editor? | Notes                                                 |
| --- | ---------------------- | -------------- | ---------------------------------------- | ------ | ---------------- | -------------- | ----------------------------------------------------- |
| 55  | blendMode              | No             | Appearance dropdown (16 modes)           | Yes    | Yes              | -              | Works via `update_shape` but LLMs don't know about it |
| 56  | cornerSmoothing        | No             | Appearance section (iOS squircle)        | Yes    | Yes              | -              | Works via `update_shape` but LLMs don't know about it |
| 57  | guides (layout guides) | No             | Layout Guide section (grid/columns/rows) | Yes    | Yes              | -              | Works via `update_shape` but LLMs don't know about it |
| 58  | stroke dashOffset      | No             | Stroke advanced popover                  | Yes    | Yes              | -              | Works via strokes array but not documented            |
| 59  | stroke miterLimit      | No             | Stroke advanced popover                  | Yes    | Yes              | -              | Works via strokes array but not documented            |

---

## 5. Engine Features Not Exposed in Either MCP or Editor

| #   | Feature                          | MCP | Editor | Engine                                                | Add to MCP?       | Add to Editor? | Notes                                                    |
| --- | -------------------------------- | --- | ------ | ----------------------------------------------------- | ----------------- | -------------- | -------------------------------------------------------- |
| 60  | Components (create/instantiate)  | No  | No     | `createComponent`, `createInstance`, `listComponents` | Yes               | Yes            | Engine has basic component system; needs UI + MCP tools  |
| 61  | Pages (multi-page)               | No  | No     | `initPages`, `addPage`, `removePage`, `renamePage`    | Yes               | Yes            | Engine supports pages; needs UI tabs + MCP tools         |
| 62  | Constraints (responsive)         | No  | No     | `applyConstraints`                                    | No (low priority) | Yes            | Engine has constraints; editor needs UI for setting them |
| 63  | Boolean operations (bounds only) | No  | No     | `computeBooleanBounds` (stub)                         | No                | No             | Only a stub; real path booleans not implemented yet      |

---

## 6. Editor-Only Features (No MCP Equivalent Needed)

These are inherently interactive/visual features that don't need MCP equivalents:

| #   | Feature                                  | Notes                                                   |
| --- | ---------------------------------------- | ------------------------------------------------------- |
| 64  | Camera control (zoom, pan, scroll)       | Interactive viewport; MCP doesn't need viewport control |
| 65  | Interactive drawing tools (drag-to-draw) | MCP uses `add_shape` with explicit coordinates instead  |
| 66  | Snap lines + distance indicators         | Visual feedback during interaction                      |
| 67  | Selection handles (resize, rotate)       | Visual manipulation handles                             |
| 68  | Marquee selection                        | Visual selection tool                                   |
| 69  | Inline text editing (double-click)       | Interactive text editing                                |
| 70  | Keyboard shortcuts                       | UI convenience                                          |
| 71  | Group enter/exit (double-click/Escape)   | Interactive navigation                                  |
| 72  | Number input scrubbing (drag labels)     | UI interaction pattern                                  |
| 73  | Remote cursor overlay                    | Collaboration visual feedback                           |
| 74  | Drag-and-drop layer reordering           | Interactive layer management                            |
| 75  | File drag-and-drop import                | Interactive file handling                               |
| 76  | Figma clipboard paste                    | Cross-tool interop                                      |
| 77  | Export to file download (PNG/SVG/JPG)    | Browser download action; MCP returns data directly      |
| 78  | Copy as SVG/PNG to clipboard             | Browser clipboard action                                |
| 79  | Preview panel (mini canvas)              | Visual preview in right panel                           |

---

## 7. MCP-Only Features (No Editor Equivalent Needed)

These are AI-agent conveniences that don't need editor UI:

| #   | Feature                    | Notes                                                 |
| --- | -------------------------- | ----------------------------------------------------- |
| 80  | `canvas.find_empty_space`  | Algorithmic placement; humans place visually          |
| 81  | `canvas.get_guidelines`    | Design knowledge base for AI agents                   |
| 82  | Ref system in batch ops    | Multi-shape atomic creation for AI efficiency         |
| 83  | Fuzzy op parsing (aliases) | LLM tolerance: "create"/"insert"/"add_shape" all work |
| 84  | MCP token management       | API authentication for external tools                 |

---

## Summary: Action Items for Consistency

### High Priority (should add)

| Action                                                | Target | Description                                                         |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Document `blendMode` in MCP tool descriptions         | MCP    | Add to common properties list so LLMs can use it                    |
| Document `cornerSmoothing` in MCP tool descriptions   | MCP    | Add to rectangle properties so LLMs can use it                      |
| Document `guides` in MCP tool descriptions            | MCP    | Add to frame properties so LLMs can use layout guides               |
| Document `dashOffset`/`miterLimit` in MCP stroke docs | MCP    | Add to stroke sub-properties documentation                          |
| Add align shapes UI                                   | Editor | Toolbar or right-click menu for shape alignment                     |
| Add distribute shapes UI                              | Editor | Toolbar or right-click menu for shape distribution                  |
| Add Components UI + MCP tools                         | Both   | Create component panel in editor + MCP tools for create/instantiate |
| Add Pages UI + MCP tools                              | Both   | Page tabs in editor + MCP tools for page management                 |

### Medium Priority (nice to have)

| Action                                     | Target | Description                                                 |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| Add layout problem detection UI            | Editor | Show warnings when children are clipped or siblings overlap |
| Add "used properties" / design audit panel | Editor | Show unique colors, fonts, sizes used in the design         |
| Add bulk replace properties UI             | Editor | Find-and-replace dialog for colors, fonts, etc.             |
| Add constraints UI                         | Editor | Right panel section for responsive constraints              |

### Low Priority (not urgent)

| Action                                          | Target | Description                                     |
| ----------------------------------------------- | ------ | ----------------------------------------------- |
| Add `canvas.search_properties` equivalent panel | Editor | Could be part of a design system / tokens panel |
| Implement real path boolean operations          | Engine | Currently only bounding box stubs               |
