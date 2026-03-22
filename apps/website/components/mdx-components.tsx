import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';

type CalloutType = 'info' | 'tip' | 'warning' | 'danger';

const calloutConfig: Record<CalloutType, { border: string; bg: string; text: string }> = {
  info: {
    border: 'border-blue-400/40 dark:border-blue-500/30',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-900 dark:text-blue-200',
  },
  tip: {
    border: 'border-emerald-400/40 dark:border-emerald-500/30',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-900 dark:text-emerald-200',
  },
  warning: {
    border: 'border-amber-400/40 dark:border-amber-500/30',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-900 dark:text-amber-200',
  },
  danger: {
    border: 'border-red-400/40 dark:border-red-500/30',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-900 dark:text-red-200',
  },
};

function Callout({ type = 'info', children }: { type?: CalloutType; children: React.ReactNode }) {
  const style = calloutConfig[type];

  return (
    <div
      className={cn(
        'my-5 rounded-lg border px-4 py-3 text-sm leading-relaxed [&>p:not(:last-child)]:mb-2 [&>p]:mt-0',
        style.border,
        style.bg,
        style.text,
      )}
    >
      {children}
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  h1: ({ children, ...props }) => (
    <h1 className="mt-8 scroll-m-20 text-3xl font-bold tracking-tight" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mt-10 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="mt-6 scroll-m-20 text-lg font-semibold tracking-tight" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => {
    const hasBlockChild = React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        (typeof child.type === 'function' ||
          typeof child.type === 'object' ||
          (typeof child.type === 'string' &&
            ['div', 'button', 'figure', 'table', 'ul', 'ol', 'pre'].includes(child.type))),
    );

    if (hasBlockChild) {
      return (
        <div className="leading-7 [&:not(:first-child)]:mt-4" {...props}>
          {children}
        </div>
      );
    }

    return (
      <p className="leading-7 [&:not(:first-child)]:mt-4" {...props}>
        {children}
      </p>
    );
  },
  a: ({ href, children, ...props }) => {
    const isExternal = href?.startsWith('http');
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 underline underline-offset-4"
          {...props}
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        href={href || '#'}
        className="text-primary hover:text-primary/80 underline underline-offset-4"
        {...props}
      >
        {children}
      </Link>
    );
  },
  ul: ({ children, ...props }) => (
    <ul className="my-4 ml-6 list-disc [&>li]:mt-2" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-4 ml-6 list-decimal [&>li]:mt-2" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="text-muted-foreground mt-6 border-l-2 pl-6 italic" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className="w-full" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  tr: ({ children, ...props }) => (
    <tr className="even:bg-muted/50 m-0 border-t p-0" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right"
      {...props}
    >
      {children}
    </td>
  ),
  code: ({ children, ...props }) => {
    const isBlockCode = 'data-language' in props || 'data-theme' in props || 'style' in props;
    if (isBlockCode) {
      return <code {...props}>{children}</code>;
    }
    return (
      <code
        className="border-border/60 bg-muted/70 text-foreground relative rounded-md border px-[0.4rem] py-[0.15rem] font-mono text-[0.8125rem]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => {
    const language = (props as Record<string, unknown>)['data-language'] as string | undefined;
    return (
      <CodeBlock language={language} {...props}>
        {children}
      </CodeBlock>
    );
  },
  img: ({ src, alt, ...props }) => {
    if (!src) return null;
    return <img src={src} alt={alt || ''} className="my-4 rounded-lg border" {...props} />;
  },
  hr: () => <hr className="border-border my-8" />,
  Callout,
};
