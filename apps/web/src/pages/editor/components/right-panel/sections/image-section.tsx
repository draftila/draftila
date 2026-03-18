import { useCallback, useRef } from 'react';
import { Image, Link, Upload } from 'lucide-react';
import type { ImageShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { NumberInput } from '../number-input';

export function ImageSection({ shape, onUpdate }: PropertySectionProps) {
  const image = shape as ImageShape;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSrcChange = useCallback(
    (src: string) => {
      onUpdate({ src } as Partial<Shape>);
    },
    [onUpdate],
  );

  const handleFitChange = useCallback(
    (fit: string) => {
      if (fit) onUpdate({ fit } as Partial<Shape>);
    },
    [onUpdate],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          handleSrcChange(result);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [handleSrcChange],
  );

  const hasSrc = Boolean(image.src);

  return (
    <section className="space-y-2.5">
      <h4 className="text-muted-foreground text-[11px] font-medium">Image</h4>

      {hasSrc && (
        <div className="border-border relative h-[80px] w-full overflow-hidden rounded border">
          <img
            src={image.src}
            alt=""
            className="h-full w-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Source</Label>
        <div className="flex items-center gap-1.5">
          <div className="border-input flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2">
            <Link className="text-muted-foreground h-3 w-3 shrink-0" />
            <input
              value={image.src}
              onChange={(e) => handleSrcChange(e.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] outline-none"
              placeholder="https://... or data:..."
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border-input hover:bg-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Fit</Label>
        <ToggleGroup
          type="single"
          value={image.fit}
          onValueChange={handleFitChange}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="fill" className="flex-1 text-[10px]">
            Fill
          </ToggleGroupItem>
          <ToggleGroupItem value="fit" className="flex-1 text-[10px]">
            Fit
          </ToggleGroupItem>
          <ToggleGroupItem value="crop" className="flex-1 text-[10px]">
            Crop
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {image.fit === 'crop' && hasSrc && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-[11px]">Crop Position</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput
              label="X"
              value={Math.round(((image as ImageShape & { cropX?: number }).cropX ?? 0.5) * 100)}
              onChange={(v) =>
                onUpdate({ cropX: Math.max(0, Math.min(1, v / 100)) } as Partial<Shape>)
              }
              min={0}
              max={100}
              step={1}
            />
            <NumberInput
              label="Y"
              value={Math.round(((image as ImageShape & { cropY?: number }).cropY ?? 0.5) * 100)}
              onChange={(v) =>
                onUpdate({ cropY: Math.max(0, Math.min(1, v / 100)) } as Partial<Shape>)
              }
              min={0}
              max={100}
              step={1}
            />
          </div>
          <p className="text-muted-foreground text-[10px]">0% = top/left, 100% = bottom/right</p>
        </div>
      )}

      {!hasSrc && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 flex h-[60px] w-full items-center justify-center gap-2 rounded-md border border-dashed transition-colors"
        >
          <Image className="h-4 w-4" />
          <span className="text-[11px]">Choose image</span>
        </button>
      )}
    </section>
  );
}
