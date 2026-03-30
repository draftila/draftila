import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Highlighter } from 'shiki';
import { createHighlighter } from 'shiki';

type SupportedLang = 'css' | 'html' | 'swift' | 'kotlin';

const DARK_THEME = 'github-dark';
const LIGHT_THEME = 'github-light';

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [DARK_THEME, LIGHT_THEME],
      langs: ['css', 'html', 'swift', 'kotlin'],
    }).catch((err) => {
      highlighterPromise = null;
      throw err;
    });
  }
  return highlighterPromise;
}

let darkSnapshot = false;
const darkListeners = new Set<() => void>();

function computeIsDark(): boolean {
  if (document.documentElement.classList.contains('dark')) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function notifyDarkListeners() {
  const next = computeIsDark();
  if (next !== darkSnapshot) {
    darkSnapshot = next;
    for (const cb of darkListeners) cb();
  }
}

if (typeof window !== 'undefined') {
  darkSnapshot = computeIsDark();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', notifyDarkListeners);

  const observer = new MutationObserver(notifyDarkListeners);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

function subscribeToDarkMode(callback: () => void) {
  darkListeners.add(callback);
  return () => {
    darkListeners.delete(callback);
  };
}

function getIsDark() {
  return darkSnapshot;
}

function useIsDark() {
  return useSyncExternalStore(subscribeToDarkMode, getIsDark);
}

interface CodeHighlightProps {
  code: string;
  language: SupportedLang;
  className?: string;
}

export function CodeHighlight({ code, language, className }: CodeHighlightProps) {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    getHighlighter()
      .then(setHighlighter)
      .catch(() => {});
  }, []);

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const highlighted = useMemo(() => {
    if (!highlighter || !code) return null;
    return highlighter.codeToTokens(code, { lang: language, theme });
  }, [highlighter, code, language, theme]);

  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <div className={`overflow-auto ${className ?? ''}`}>
      <pre className="p-3 text-[11px] leading-5">
        <code>
          {highlighted
            ? highlighted.tokens.map((line, i) => (
                <div key={i} className="flex">
                  <span className="text-muted-foreground/50 mr-3 inline-block w-5 shrink-0 select-none text-right">
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-all">
                    {line.map((token, j) => (
                      <span key={j} style={{ color: token.color }}>
                        {token.content}
                      </span>
                    ))}
                  </span>
                </div>
              ))
            : lines.map((line, i) => (
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
  );
}
