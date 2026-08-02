# Custom fonts — manual end-to-end QA checklist

No automated test compares the three renderers (browser canvas, client export, server skia), so this
checklist is run manually before a release; it is the only coverage of client↔server glyph agreement.

1. Drag a realistic full family — 18 files (9 weights × normal/italic) — onto the admin dropzone →
   all rows complete with NO manual intervention (any 429 shows "waiting Ns" and auto-resumes via
   `Retry-After`); re-drag one file → 409 row showing the metadata-collision message.
2. Pick the family in the editor; type text incl. an italic segment; canvas AND text-edit overlay
   render it.
3. Reload → geometry unchanged (no reflow = measurement agreement).
4. Client PNG export matches a canvas screenshot glyph-for-glyph.
5. MCP `export_png` of the same draft matches the client PNG (weights, italics, line breaks).
6. Draft-card thumbnail shows the font.
7. Download SVG → open from `file://` → font renders (embedded).
8. Force URL mode (temporarily set `maxEmbedBytes` low) → still renders from `file://` (CORS).
9. Download HTML → renders from `file://`; the split HTML+CSS download also carries the font.
10. MCP `export_svg` with an oversized family → comment, not base64.
11. Delete the family → editor falls back + missing-font warning; exports still succeed.
