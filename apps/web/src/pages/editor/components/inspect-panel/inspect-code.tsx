import { useCallback, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { Copy, Check } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import { getExpandedShapeIds, getAllShapes } from '@draftila/engine/scene-graph';
import {
  generateCss,
  generateCssAllLayers,
  generateTailwind,
  generateTailwindAllLayers,
  generateSwiftUI,
  generateCompose,
} from '@draftila/engine/codegen';
import { CodeHighlight } from './code-highlight';

type CodeLanguage =
  | 'css'
  | 'css-all-layers'
  | 'tailwind'
  | 'tailwind-all-layers'
  | 'swiftui'
  | 'compose';

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  css: 'CSS',
  'css-all-layers': 'CSS (All)',
  tailwind: 'Tailwind',
  'tailwind-all-layers': 'Tailwind (All)',
  swiftui: 'SwiftUI',
  compose: 'Compose',
};

const SHIKI_LANG_MAP: Record<CodeLanguage, 'css' | 'html' | 'swift' | 'kotlin'> = {
  css: 'css',
  'css-all-layers': 'css',
  tailwind: 'css',
  'tailwind-all-layers': 'css',
  swiftui: 'swift',
  compose: 'kotlin',
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
      case 'tailwind':
        return generateTailwind(expandedShapes);
      case 'tailwind-all-layers':
        return generateTailwindAllLayers(expandedShapes);
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

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
          className="bg-muted h-7 px-2 text-[11px]"
        >
          {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 px-1.5 text-[11px] transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <CodeHighlight code={code} language={SHIKI_LANG_MAP[language]} />
    </div>
  );
}
