'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { CopyButton } from './copy-button';
import { cn } from '@/lib/utils';

const languageLabels: Record<string, string> = {
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  shell: 'Shell',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  sql: 'SQL',
  css: 'CSS',
  html: 'HTML',
  xml: 'XML',
  md: 'Markdown',
  dockerfile: 'Dockerfile',
  docker: 'Docker',
  nginx: 'Nginx',
  ini: 'INI',
  toml: 'TOML',
  env: 'ENV',
  dotenv: '.env',
  diff: 'Diff',
  graphql: 'GraphQL',
  vue: 'Vue',
  svelte: 'Svelte',
  swift: 'Swift',
  kotlin: 'Kotlin',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  lua: 'Lua',
};

export function CodeBlock({
  children,
  language,
  ...props
}: {
  children: ReactNode;
  language?: string;
  [key: string]: unknown;
}) {
  const preRef = useRef<HTMLPreElement>(null);

  const label = language ? languageLabels[language] || language.toUpperCase() : null;

  const getCodeText = useCallback(() => {
    if (!preRef.current) return '';
    const code = preRef.current.querySelector('code');
    return code?.textContent || '';
  }, []);

  return (
    <div className="group/code relative my-5">
      <div
        className={cn(
          'flex items-center justify-between rounded-t-lg border border-b-0 px-3 py-1',
          'bg-zinc-50 dark:bg-zinc-900/80',
        )}
      >
        <span className="text-muted-foreground/70 select-none text-xs font-medium">
          {label || 'Code'}
        </span>
        <CopyButton getText={getCodeText} />
      </div>

      <pre
        ref={preRef}
        className={cn(
          'overflow-x-auto rounded-b-lg border px-4 py-4',
          'bg-white dark:bg-zinc-950',
          'text-[0.8125rem] leading-relaxed',
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
