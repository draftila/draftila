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
    });
  }
  return highlighterPromise;
}

const darkQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeToDarkMode(callback: () => void) {
  darkQuery?.addEventListener('change', callback);
  return () => darkQuery?.removeEventListener('change', callback);
}

function getIsDark() {
  if (document.documentElement.classList.contains('dark')) return true;
  return darkQuery?.matches ?? false;
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
    getHighlighter().then(setHighlighter);
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
