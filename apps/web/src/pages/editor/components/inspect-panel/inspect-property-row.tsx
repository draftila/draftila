import { useCallback, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface InspectPropertyRowProps {
  label: string;
  value: string;
  colorSwatch?: string;
}

export function InspectPropertyRow({ label, value, colorSwatch }: InspectPropertyRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <div
      className="group flex min-h-6 cursor-default items-center justify-between gap-2"
      onClick={handleCopy}
    >
      <span className="text-muted-foreground shrink-0 text-[11px]">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        {colorSwatch && (
          <span
            className="border-border inline-block size-3 shrink-0 border"
            style={{ backgroundColor: colorSwatch }}
          />
        )}
        <span className="truncate font-mono text-[11px]">{value}</span>
        <span className="flex size-3.5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          {copied ? (
            <Check className="text-emerald-500" size={12} />
          ) : (
            <Copy className="text-muted-foreground" size={12} />
          )}
        </span>
      </div>
    </div>
  );
}
