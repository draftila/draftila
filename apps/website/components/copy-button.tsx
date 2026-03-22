'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyButton({ text, getText }: { text?: string; getText?: () => string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const value = getText ? getText() : text || '';
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="opacity-0 transition-opacity group-hover/code:opacity-100"
      onClick={copy}
      aria-label="Copy to clipboard"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}
