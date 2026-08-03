import { useEffect, useState } from 'react';
import type { TextShape, Shape, TextAutoResize } from '@draftila/shared';
import {
  getAvailableVariants,
  isCustomFontFamily,
  isCustomFontsReady,
  isFontLoaded,
  isGoogleFontFamily,
  nearestAvailableVariant,
  onFontsLoaded,
} from '@draftila/engine';
import {
  AlertTriangleIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  CaseSensitive,
  CaseUpper,
  CaseLower,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  MoveHorizontal,
  MoveVertical,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';
import { FontPicker } from '../font-picker';
import { SegmentsEditor } from './typography-segments-editor';

const FONT_WEIGHTS = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra Light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi Bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
];

export function TypographySection({ shape, onUpdate }: PropertySectionProps) {
  const text = shape as TextShape;

  // Both readiness and load state change outside React; every settle path notifies here.
  const [, setFontTick] = useState(0);
  useEffect(() => onFontsLoaded(() => setFontTick((t) => t + 1)), []);

  const variants = getAvailableVariants(text.fontFamily); // null => not a custom family
  const italicAvailable = !variants || variants.some((v) => v.style === 'italic');
  const boldAvailable = !variants || variants.some((v) => v.weight >= 700);
  const inSelectedStyle = variants?.filter((v) => v.style === text.fontStyle) ?? [];
  const availableWeights = variants
    ? (inSelectedStyle.length > 0 ? inSelectedStyle : variants).map((v) => v.weight)
    : null;
  const weights = availableWeights
    ? FONT_WEIGHTS.filter((w) => availableWeights.includes(w.value))
    : FONT_WEIGHTS;

  // Suppressed while the registry is unready (no false flash pre-fetch) and for non-curated names
  // the Google path actually loaded.
  const missingFont =
    isCustomFontsReady() &&
    !isCustomFontFamily(text.fontFamily) &&
    !isGoogleFontFamily(text.fontFamily) &&
    !isFontLoaded(text.fontFamily);

  return (
    <section className="space-y-2.5">
      <h4 className="text-muted-foreground text-[11px] font-medium">Typography</h4>

      <FontPicker
        value={text.fontFamily}
        onChange={(family) => {
          const patch: Partial<TextShape> = { fontFamily: family };
          if (getAvailableVariants(family)) {
            // Snap onto a variant the family actually ships, so the canvas doesn't synthesize.
            const snapped = nearestAvailableVariant(family, text.fontWeight, text.fontStyle);
            patch.fontWeight = snapped.weight;
            patch.fontStyle = snapped.style;
          }
          onUpdate(patch as Partial<Shape>);
        }}
      />

      {missingFont && (
        <p className="text-muted-foreground flex items-start gap-1 text-[10px]">
          <AlertTriangleIcon className="mt-px h-3 w-3 shrink-0" />
          <span>
            &ldquo;{text.fontFamily}&rdquo; is not installed on this instance — it renders with a
            fallback font. Ask an admin to upload it under Admin &rsaquo; Fonts.
          </span>
        </p>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button className="border-input hover:bg-accent flex h-7 w-full items-center rounded-md border px-2 text-left text-[11px]">
            <span className="truncate">
              {FONT_WEIGHTS.find((w) => w.value === text.fontWeight)?.label ??
                `Weight ${text.fontWeight}`}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" side="left" align="start">
          <div className="max-h-60 overflow-auto">
            {weights.map((w) => (
              <button
                key={w.value}
                className="hover:bg-accent w-full rounded-sm px-2 py-1 text-left text-[11px] transition-colors"
                style={{ fontWeight: w.value }}
                onClick={() => onUpdate({ fontWeight: w.value } as Partial<Shape>)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Auto Resize</Label>
        <ToggleGroup
          type="single"
          value={(text as TextShape & { textAutoResize?: TextAutoResize }).textAutoResize ?? 'none'}
          onValueChange={(v) => {
            if (v) onUpdate({ textAutoResize: v } as Partial<Shape>);
          }}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="none" className="flex-1">
            <Lock className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="width" className="flex-1">
            <MoveHorizontal className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="height" className="flex-1">
            <MoveVertical className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="Sz"
          value={text.fontSize}
          onChange={(v) => onUpdate({ fontSize: v } as Partial<Shape>)}
          min={1}
        />
        <NumberInput
          label="LH"
          value={text.lineHeight}
          onChange={(v) => onUpdate({ lineHeight: v } as Partial<Shape>)}
          step={0.1}
          min={0.5}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="LS"
          value={text.letterSpacing}
          onChange={(v) => onUpdate({ letterSpacing: v } as Partial<Shape>)}
          step={0.5}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Align</Label>
        <ToggleGroup
          type="single"
          value={text.textAlign}
          onValueChange={(v) => {
            if (v) onUpdate({ textAlign: v } as Partial<Shape>);
          }}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="left" className="flex-1">
            <AlignLeft className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" className="flex-1">
            <AlignCenter className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" className="flex-1">
            <AlignRight className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Vertical Align</Label>
        <ToggleGroup
          type="single"
          value={text.verticalAlign}
          onValueChange={(v) => {
            if (v) onUpdate({ verticalAlign: v } as Partial<Shape>);
          }}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="top" className="flex-1">
            <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="middle" className="flex-1">
            <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" className="flex-1">
            <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Style</Label>
        <div className="flex gap-1">
          <Button
            variant={text.fontWeight >= 700 ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7"
            disabled={!boldAvailable}
            title={boldAvailable ? undefined : 'This family has no bold variant'}
            onClick={() =>
              onUpdate({
                fontWeight: text.fontWeight >= 700 ? 400 : 700,
              } as Partial<Shape>)
            }
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={text.fontStyle === 'italic' ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7"
            disabled={!italicAvailable}
            title={italicAvailable ? undefined : 'This family has no italic variant'}
            onClick={() =>
              onUpdate({
                fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic',
              } as Partial<Shape>)
            }
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={text.textDecoration === 'underline' ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              onUpdate({
                textDecoration: text.textDecoration === 'underline' ? 'none' : 'underline',
              } as Partial<Shape>)
            }
          >
            <Underline className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={text.textDecoration === 'strikethrough' ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              onUpdate({
                textDecoration: text.textDecoration === 'strikethrough' ? 'none' : 'strikethrough',
              } as Partial<Shape>)
            }
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-[11px]">Transform</Label>
        <ToggleGroup
          type="single"
          value={text.textTransform}
          onValueChange={(v) => {
            if (v) onUpdate({ textTransform: v } as Partial<Shape>);
          }}
          className="w-full"
          size="sm"
        >
          <ToggleGroupItem value="none" className="flex-1">
            <CaseSensitive className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="uppercase" className="flex-1">
            <CaseUpper className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="lowercase" className="flex-1">
            <CaseLower className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <h4 className="text-muted-foreground text-[11px] font-medium">Content</h4>
        <textarea
          value={text.content}
          onChange={(e) => onUpdate({ content: e.target.value } as Partial<Shape>)}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[60px] w-full rounded-md border bg-transparent px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-1"
          placeholder="Type text content..."
        />
      </div>

      <Separator />

      <SegmentsEditor shape={text} onUpdate={onUpdate} />
    </section>
  );
}
