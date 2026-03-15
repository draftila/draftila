import type { TextShape, Shape } from '@draftila/shared';
import {
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';

const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Garamond',
  'Comic Sans MS',
  'Impact',
  'Monaco',
  'Menlo',
  'SF Pro Display',
  'SF Pro Text',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
];

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

  return (
    <section className="space-y-2.5">
      <h4 className="text-muted-foreground text-[11px] font-medium">Typography</h4>

      <Popover>
        <PopoverTrigger asChild>
          <button className="border-input hover:bg-accent flex h-7 w-full items-center rounded-md border px-2 text-left text-[11px]">
            <span className="truncate">{text.fontFamily}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" side="left" align="start">
          <div className="max-h-60 overflow-auto">
            {FONT_FAMILIES.map((font) => (
              <button
                key={font}
                className="hover:bg-accent w-full rounded-sm px-2 py-1 text-left text-[11px] transition-colors"
                style={{ fontFamily: font }}
                onClick={() => onUpdate({ fontFamily: font } as Partial<Shape>)}
              >
                {font}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

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
            {FONT_WEIGHTS.map((w) => (
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
    </section>
  );
}
