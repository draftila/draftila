import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { Copy, Check, Download, ChevronDown, ExternalLink } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import {
  generateCss,
  generateCssAllLayers,
  generateTailwind,
  generateTailwindAllLayers,
  generateSwiftUI,
  generateCompose,
  generateHtmlCss,
  generateHtmlTailwind,
  generateHtmlCssParts,
  assembleHtmlWithCssLink,
  TAILWIND_CDN_URL,
} from '@draftila/engine/codegen';
import { getPageBackgroundColor } from '@draftila/engine/pages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '@/stores/editor-store';
import { CodeHighlight } from './code-highlight';
import { useExpandedShapes } from './use-expanded-shapes';

type CodeLanguage =
  | 'css'
  | 'css-all-layers'
  | 'tailwind'
  | 'tailwind-all-layers'
  | 'swiftui'
  | 'compose'
  | 'html-css'
  | 'html-tailwind';

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  css: 'CSS',
  'css-all-layers': 'CSS (All)',
  tailwind: 'Tailwind',
  'tailwind-all-layers': 'Tailwind (All)',
  swiftui: 'SwiftUI',
  compose: 'Compose',
  'html-css': 'HTML + CSS',
  'html-tailwind': 'HTML + Tailwind',
};

const SHIKI_LANG_MAP: Record<CodeLanguage, 'css' | 'html' | 'swift' | 'kotlin'> = {
  css: 'css',
  'css-all-layers': 'css',
  tailwind: 'css',
  'tailwind-all-layers': 'css',
  swiftui: 'swift',
  compose: 'kotlin',
  'html-css': 'html',
  'html-tailwind': 'html',
};

let tailwindScriptCache: string | null = null;
let tailwindScriptPromise: Promise<string> | null = null;

function fetchTailwindScript(): Promise<string> {
  if (tailwindScriptCache) return Promise.resolve(tailwindScriptCache);
  if (!tailwindScriptPromise) {
    tailwindScriptPromise = fetch(TAILWIND_CDN_URL)
      .then((res) => res.text())
      .then((text) => {
        tailwindScriptCache = text;
        return text;
      })
      .catch((err) => {
        tailwindScriptPromise = null;
        throw err;
      });
  }
  return tailwindScriptPromise;
}

function useTailwindScript(): string | null {
  const [script, setScript] = useState(tailwindScriptCache);

  useEffect(() => {
    if (tailwindScriptCache) {
      setScript(tailwindScriptCache);
      return;
    }
    fetchTailwindScript()
      .then(setScript)
      .catch(() => {});
  }, []);

  return script;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openPreviewInNewTab(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

interface InspectCodeProps {
  ydoc: Y.Doc;
  shapes: Shape[];
}

export function InspectCode({ ydoc, shapes }: InspectCodeProps) {
  const [language, setLanguage] = useState<CodeLanguage>('css');
  const [copied, setCopied] = useState(false);
  const expandedShapes = useExpandedShapes(ydoc, shapes);
  const tailwindScript = useTailwindScript();
  const activePageId = useEditorStore((state) => state.activePageId);
  const pageBackgroundColor = useMemo(() => {
    if (!activePageId) return null;
    return getPageBackgroundColor(ydoc, activePageId);
  }, [ydoc, activePageId]);

  const isHtmlMode = language === 'html-css' || language === 'html-tailwind';

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
      case 'html-css':
        return generateHtmlCss(expandedShapes, pageBackgroundColor);
      case 'html-tailwind':
        return generateHtmlTailwind(
          expandedShapes,
          tailwindScript ?? undefined,
          pageBackgroundColor,
        );
    }
  }, [expandedShapes, language, tailwindScript, pageBackgroundColor]);

  const htmlCssParts = useMemo(() => {
    if (language !== 'html-css' || expandedShapes.length === 0) return null;
    return generateHtmlCssParts(expandedShapes);
  }, [expandedShapes, language]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  const handleOpenPreview = useCallback(() => {
    if (!code) return;
    openPreviewInNewTab(code);
  }, [code]);

  const handleDownloadCombined = useCallback(() => {
    if (!code) return;
    downloadFile(code, 'preview.html', 'text/html');
  }, [code]);

  const handleDownloadHtmlOnly = useCallback(() => {
    if (!htmlCssParts) return;
    const htmlWithLink = assembleHtmlWithCssLink(htmlCssParts.html, 'styles.css');
    downloadFile(htmlWithLink, 'index.html', 'text/html');
  }, [htmlCssParts]);

  const handleDownloadCssOnly = useCallback(() => {
    if (!htmlCssParts) return;
    downloadFile(htmlCssParts.css, 'styles.css', 'text/css');
  }, [htmlCssParts]);

  if (shapes.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-muted-foreground text-[11px]">Select a layer to view code</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <Select value={language} onValueChange={(v) => setLanguage(v as CodeLanguage)}>
          <SelectTrigger className="bg-muted h-7 w-auto gap-1 rounded-none border-none px-2 text-[11px] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-[11px]">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TooltipProvider>
          <div className="flex items-center gap-0.5">
            {isHtmlMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenPreview}
                    className="text-muted-foreground hover:text-foreground flex h-7 items-center px-1.5 transition-colors"
                  >
                    <ExternalLink size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Preview</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground flex h-7 items-center px-1.5 transition-colors"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{copied ? 'Copied' : 'Copy'}</TooltipContent>
            </Tooltip>
            {isHtmlMode && (
              <HtmlDownloadMenu
                language={language}
                onDownloadCombined={handleDownloadCombined}
                onDownloadHtml={handleDownloadHtmlOnly}
                onDownloadCss={handleDownloadCssOnly}
              />
            )}
          </div>
        </TooltipProvider>
      </div>
      <div className="min-h-0 flex-1">
        <CodeHighlight code={code} language={SHIKI_LANG_MAP[language]} className="h-full" />
      </div>
    </div>
  );
}

function HtmlDownloadMenu({
  language,
  onDownloadCombined,
  onDownloadHtml,
  onDownloadCss,
}: {
  language: CodeLanguage;
  onDownloadCombined: () => void;
  onDownloadHtml: () => void;
  onDownloadCss: () => void;
}) {
  if (language === 'html-tailwind') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onDownloadCombined}
            className="text-muted-foreground hover:text-foreground flex h-7 items-center px-1.5 transition-colors"
          >
            <Download size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-0.5 px-1.5 transition-colors">
              <Download size={12} />
              <ChevronDown size={10} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="text-[11px]">
        <DropdownMenuItem onClick={onDownloadCombined}>Combined (.html)</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownloadHtml}>HTML only (.html)</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownloadCss}>CSS only (.css)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
