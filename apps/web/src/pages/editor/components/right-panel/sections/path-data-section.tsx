import { useCallback } from 'react';
import { Code } from 'lucide-react';
import type { PathShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';

export function PathDataSection({ shape, onUpdate }: PropertySectionProps) {
  const path = shape as PathShape;

  const handleChange = useCallback(
    (svgPathData: string) => {
      onUpdate({ svgPathData: svgPathData || undefined } as Partial<Shape>);
    },
    [onUpdate],
  );

  return (
    <section className="space-y-1.5">
      <h4 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
        <Code className="h-3 w-3" />
        SVG Path
      </h4>
      <textarea
        value={path.svgPathData ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[48px] w-full rounded-md border bg-transparent px-2 py-1.5 font-mono text-[10px] focus-visible:outline-none focus-visible:ring-1"
        placeholder="M10 10 L20 20 Z"
        spellCheck={false}
      />
      {path.svgPathData && (
        <p className="text-muted-foreground text-[10px]">SVG path data overrides freehand points</p>
      )}
    </section>
  );
}
