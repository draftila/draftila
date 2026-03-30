import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { Copy, Check, Download, ChevronDown } from 'lucide-react';
import type { Shape } from '@draftila/shared';
import {
  generateHtmlCss,
  generateHtmlTailwind,
  generateHtmlCssParts,
  assembleHtmlWithCssLink,
  TAILWIND_CDN_URL,
} from '@draftila/engine/codegen';
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
import { CodeHighlight } from './code-highlight';
import { useExpandedShapes } from './use-expanded-shapes';

type PreviewMode = 'css' | 'tailwind';
type PreviewView = 'preview' | 'code';

const MODE_LABELS: Record<PreviewMode, string> = {
  css: 'HTML + CSS',
  tailwind: 'HTML + Tailwind',
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

interface InspectPreviewProps {
  ydoc: Y.Doc;
  shapes: Shape[];
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

export function InspectPreview({ ydoc, shapes }: InspectPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('css');
  const [view, setView] = useState<PreviewView>('preview');
  const [copied, setCopied] = useState(false);
  const expandedShapes = useExpandedShapes(ydoc, shapes);
  const tailwindScript = useTailwindScript();

  const html = useMemo(() => {
    if (expandedShapes.length === 0) return '';
    if (mode === 'css') return generateHtmlCss(expandedShapes);
    return generateHtmlTailwind(expandedShapes, tailwindScript ?? undefined);
  }, [expandedShapes, mode, tailwindScript]);

  const parts = useMemo(() => {
    if (mode !== 'css' || expandedShapes.length === 0) return null;
    return generateHtmlCssParts(expandedShapes);
  }, [expandedShapes, mode]);

  const handleCopy = useCallback(async () => {
    if (!html) return;
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [html]);

  const handleDownloadCombined = useCallback(() => {
    if (!html) return;
    downloadFile(html, 'preview.html', 'text/html');
  }, [html]);

  const handleDownloadHtmlOnly = useCallback(() => {
    if (!parts) return;
    const htmlWithLink = assembleHtmlWithCssLink(parts.html, 'styles.css');
    downloadFile(htmlWithLink, 'index.html', 'text/html');
  }, [parts]);

  const handleDownloadCssOnly = useCallback(() => {
    if (!parts) return;
    downloadFile(parts.css, 'styles.css', 'text/css');
  }, [parts]);

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
        <div className="flex items-center gap-1">
          <Select value={mode} onValueChange={(v) => setMode(v as PreviewMode)}>
            <SelectTrigger className="bg-muted h-7 w-auto gap-1 rounded-none border-none px-2 text-[11px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MODE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-[11px]">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ViewToggle view={view} onChange={setView} />
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 px-1.5 text-[11px] transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <DownloadMenu
            mode={mode}
            onDownloadCombined={handleDownloadCombined}
            onDownloadHtml={handleDownloadHtmlOnly}
            onDownloadCss={handleDownloadCssOnly}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === 'preview' ? (
          <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            className="h-full w-full border-0 bg-white"
            title="Live Preview"
          />
        ) : (
          <CodeView html={html} />
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: PreviewView;
  onChange: (view: PreviewView) => void;
}) {
  return (
    <div className="border-border flex h-7 border">
      <button
        onClick={() => onChange('preview')}
        className={`px-2 text-[11px] font-medium transition-colors ${
          view === 'preview'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Preview
      </button>
      <button
        onClick={() => onChange('code')}
        className={`border-border border-l px-2 text-[11px] font-medium transition-colors ${
          view === 'code'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Code
      </button>
    </div>
  );
}

function CodeView({ html }: { html: string }) {
  return <CodeHighlight code={html} language="html" className="h-full" />;
}

function DownloadMenu({
  mode,
  onDownloadCombined,
  onDownloadHtml,
  onDownloadCss,
}: {
  mode: PreviewMode;
  onDownloadCombined: () => void;
  onDownloadHtml: () => void;
  onDownloadCss: () => void;
}) {
  if (mode === 'tailwind') {
    return (
      <button
        onClick={onDownloadCombined}
        className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 px-1.5 text-[11px] transition-colors"
      >
        <Download size={12} />
        <span>Download</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-1 px-1.5 text-[11px] transition-colors">
          <Download size={12} />
          <span>Download</span>
          <ChevronDown size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-[11px]">
        <DropdownMenuItem onClick={onDownloadCombined}>Combined (.html)</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownloadHtml}>HTML only (.html)</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownloadCss}>CSS only (.css)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
