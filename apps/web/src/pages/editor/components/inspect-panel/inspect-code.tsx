import { useCallback, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { Copy, Check } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import { getExpandedShapeIds, getAllShapes } from '@draftila/engine/scene-graph';
import {
  generateCss,
  generateCssAllLayers,
  generateSwiftUI,
  generateCompose,
} from '@draftila/engine/codegen';

type CodeLanguage = 'css' | 'css-all-layers' | 'swiftui' | 'compose';

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  css: 'CSS',
  'css-all-layers': 'CSS (All)',
  swiftui: 'SwiftUI',
  compose: 'Compose',
};

interface InspectCodeProps {
  ydoc: Y.Doc;
  shapes: Shape[];
}

export function InspectCode({ ydoc, shapes }: InspectCodeProps) {
  const [language, setLanguage] = useState<CodeLanguage>('css');
  const [copied, setCopied] = useState(false);

  const expandedShapes = useMemo(() => {
    if (shapes.length === 0) return [];
    const ids = shapes.map((s) => s.id);
    const expandedIds = new Set(getExpandedShapeIds(ydoc, ids));
    return getAllShapes(ydoc).filter((s) => expandedIds.has(s.id));
  }, [ydoc, shapes]);

  const code = useMemo(() => {
    if (expandedShapes.length === 0) return '';
    switch (language) {
      case 'css':
        return generateCss(expandedShapes);
      case 'css-all-layers':
        return generateCssAllLayers(expandedShapes);
      case 'swiftui':
        return generateSwiftUI(expandedShapes);
      case 'compose':
        return generateCompose(expandedShapes);
    }
  }, [expandedShapes, language]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  if (shapes.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-muted-foreground text-[11px]">Select a layer to view code</p>
      </div>
    );
  }

  const lines = code.split('\n');

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
          className="bg-muted rounded px-2 py-0.5 text-[11px]"
        >
          {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="overflow-auto">
        <pre className="p-3 text-[11px] leading-5">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="text-muted-foreground/50 mr-3 inline-block w-5 shrink-0 select-none text-right">
                  {i + 1}
                </span>
                <span className="min-w-0 break-all">{line}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
