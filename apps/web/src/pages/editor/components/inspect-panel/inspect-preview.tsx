import { useCallback, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { Copy, Check, Download } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import { getExpandedShapeIds, getAllShapes } from '@draftila/engine/scene-graph';
import { generateHtmlCss, generateHtmlTailwind } from '@draftila/engine/codegen';

type PreviewMode = 'css' | 'tailwind';

const MODE_LABELS: Record<PreviewMode, string> = {
  css: 'HTML + CSS',
  tailwind: 'HTML + Tailwind',
};

interface InspectPreviewProps {
  ydoc: Y.Doc;
  shapes: Shape[];
}

export function InspectPreview({ ydoc, shapes }: InspectPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('css');
  const [copied, setCopied] = useState(false);

  const expandedShapes = useMemo(() => {
    if (shapes.length === 0) return [];
    const ids = shapes.map((s) => s.id);
    const expandedIds = new Set(getExpandedShapeIds(ydoc, ids));
    return getAllShapes(ydoc).filter((s) => expandedIds.has(s.id));
  }, [ydoc, shapes]);

  const html = useMemo(() => {
    if (expandedShapes.length === 0) return '';
    return mode === 'css' ? generateHtmlCss(expandedShapes) : generateHtmlTailwind(expandedShapes);
  }, [expandedShapes, mode]);

  const handleCopy = useCallback(async () => {
    if (!html) return;
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [html]);

  const handleDownload = useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preview.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [html]);

  if (shapes.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-muted-foreground text-[11px]">Select a layer to preview</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as PreviewMode)}
          className="bg-muted rounded px-2 py-0.5 text-[11px]"
        >
          {Object.entries(MODE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
          >
            <Download size={12} />
            <span>Download</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          srcDoc={html}
          sandbox="allow-scripts"
          className="h-full w-full border-0 bg-white"
          title="Live Preview"
        />
      </div>
    </div>
  );
}
