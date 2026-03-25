import { useCallback, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { FrameShape, RectangleShape, Shape } from '@draftila/shared';
import type { PropertySectionProps } from '../types';
import { NumberInput } from '../number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BlendModeIcon,
  CornerBLIcon,
  CornerBRIcon,
  CornerExpandIcon,
  CornerRadiusIcon,
  CornerSmoothingIcon,
  CornerTLIcon,
  CornerTRIcon,
  OpacityIcon,
} from './appearance-icons';

const BLEND_MODES = [
  'normal',
  'pass through',
  'darken',
  'multiply',
  'color burn',
  'lighten',
  'screen',
  'color dodge',
  'overlay',
  'soft light',
  'hard light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

function blendModeLabel(mode: string) {
  return mode
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function hasCornerRadius(shape: Shape): shape is RectangleShape | FrameShape {
  return shape.type === 'rectangle' || shape.type === 'frame';
}

export function AppearanceSection({ shape, onUpdate }: PropertySectionProps) {
  const [cornersExpanded, setCornersExpanded] = useState(false);
  const [smoothingOpen, setSmoothingOpen] = useState(false);

  const opacityPercent = Math.round(shape.opacity * 100);

  const handleOpacityChange = useCallback(
    (percent: number) => {
      onUpdate({ opacity: Math.min(100, Math.max(0, percent)) / 100 } as Partial<Shape>);
    },
    [onUpdate],
  );

  const handleOpacitySlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ opacity: parseInt(e.target.value, 10) / 100 } as Partial<Shape>);
    },
    [onUpdate],
  );

  const handleVisibilityToggle = useCallback(() => {
    onUpdate({ visible: !shape.visible } as Partial<Shape>);
  }, [shape.visible, onUpdate]);

  const handleBlendModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdate({ blendMode: e.target.value } as Partial<Shape>);
    },
    [onUpdate],
  );

  const isFrame = shape.type === 'frame';

  const handleClipToggle = useCallback(() => {
    if (shape.type !== 'frame') {
      return;
    }

    onUpdate({ clip: !shape.clip } as Partial<Shape>);
  }, [shape, onUpdate]);

  const rect = hasCornerRadius(shape) ? shape : null;

  const hasMixedCorners =
    rect?.cornerRadiusTL !== undefined ||
    rect?.cornerRadiusTR !== undefined ||
    rect?.cornerRadiusBL !== undefined ||
    rect?.cornerRadiusBR !== undefined;

  const cornerTL = rect ? (rect.cornerRadiusTL ?? rect.cornerRadius) : 0;
  const cornerTR = rect ? (rect.cornerRadiusTR ?? rect.cornerRadius) : 0;
  const cornerBL = rect ? (rect.cornerRadiusBL ?? rect.cornerRadius) : 0;
  const cornerBR = rect ? (rect.cornerRadiusBR ?? rect.cornerRadius) : 0;

  const allCornersEqual = cornerTL === cornerTR && cornerTR === cornerBL && cornerBL === cornerBR;
  const uniformRadius = allCornersEqual ? cornerTL : 0;

  const handleUniformCornerChange = useCallback(
    (v: number) => {
      onUpdate({
        cornerRadius: v,
        cornerRadiusTL: undefined,
        cornerRadiusTR: undefined,
        cornerRadiusBL: undefined,
        cornerRadiusBR: undefined,
      } as unknown as Partial<Shape>);
    },
    [onUpdate],
  );

  const handleCornerChange = useCallback(
    (
      corner: 'cornerRadiusTL' | 'cornerRadiusTR' | 'cornerRadiusBL' | 'cornerRadiusBR',
      v: number,
    ) => {
      onUpdate({ [corner]: v } as unknown as Partial<Shape>);
    },
    [onUpdate],
  );

  const smoothingPercent = rect ? Math.round((rect.cornerSmoothing ?? 0) * 100) : 0;

  const handleSmoothingSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({
        cornerSmoothing: parseInt(e.target.value, 10) / 100,
      } as unknown as Partial<Shape>);
    },
    [onUpdate],
  );

  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-[11px] font-medium">Appearance</h4>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-20 shrink-0">
            <NumberInput
              label=""
              icon={<OpacityIcon className="h-3.5 w-3.5" />}
              value={opacityPercent}
              onChange={handleOpacityChange}
              min={0}
              max={100}
              suffix="%"
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={opacityPercent}
            onChange={handleOpacitySlider}
            className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
          />
          <button
            onClick={handleVisibilityToggle}
            className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 transition-colors"
          >
            {shape.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>

        {rect && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                {hasMixedCorners && !allCornersEqual ? (
                  <div className="border-input flex h-6 items-center gap-1.5 rounded-md border pl-1.5 pr-2">
                    <CornerRadiusIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <span className="text-muted-foreground text-[11px]">Mixed</span>
                  </div>
                ) : (
                  <NumberInput
                    label=""
                    icon={<CornerRadiusIcon className="h-3.5 w-3.5" />}
                    value={uniformRadius}
                    onChange={handleUniformCornerChange}
                    min={0}
                    dragSensitivity={0.5}
                  />
                )}
              </div>
              <button
                onClick={() => setCornersExpanded(!cornersExpanded)}
                className={`shrink-0 rounded p-0.5 transition-colors ${
                  cornersExpanded
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CornerExpandIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {cornersExpanded && (
              <div className="flex items-start gap-1.5">
                <div className="grid flex-1 grid-cols-2 gap-1">
                  <NumberInput
                    label=""
                    icon={<CornerTLIcon className="h-2.5 w-2.5" />}
                    value={cornerTL}
                    onChange={(v) => handleCornerChange('cornerRadiusTL', v)}
                    min={0}
                    dragSensitivity={0.5}
                  />
                  <NumberInput
                    label=""
                    icon={<CornerTRIcon className="h-2.5 w-2.5" />}
                    value={cornerTR}
                    onChange={(v) => handleCornerChange('cornerRadiusTR', v)}
                    min={0}
                    dragSensitivity={0.5}
                  />
                  <NumberInput
                    label=""
                    icon={<CornerBLIcon className="h-2.5 w-2.5" />}
                    value={cornerBL}
                    onChange={(v) => handleCornerChange('cornerRadiusBL', v)}
                    min={0}
                    dragSensitivity={0.5}
                  />
                  <NumberInput
                    label=""
                    icon={<CornerBRIcon className="h-2.5 w-2.5" />}
                    value={cornerBR}
                    onChange={(v) => handleCornerChange('cornerRadiusBR', v)}
                    min={0}
                    dragSensitivity={0.5}
                  />
                </div>
                <Popover open={smoothingOpen} onOpenChange={setSmoothingOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={`mt-0.5 shrink-0 rounded p-1 transition-colors ${
                        smoothingOpen
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <CornerSmoothingIcon className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="left" align="start" className="w-56">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Corner smoothing</span>
                      <button
                        onClick={() => setSmoothingOpen(false)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={smoothingPercent}
                        onChange={handleSmoothingSlider}
                        className="appearance-slider h-1.5 min-w-0 flex-1 cursor-pointer"
                      />
                      <span className="text-muted-foreground w-10 text-right font-mono text-[11px]">
                        {smoothingPercent}%
                      </span>
                    </div>
                    {smoothingPercent >= 60 && (
                      <span className="text-muted-foreground mt-1 text-center text-[10px]">
                        iOS
                      </span>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-1.5">
          <div className="border-input flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border pl-1.5">
            <BlendModeIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <select
              value={shape.blendMode}
              onChange={handleBlendModeChange}
              className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-1.5 text-[11px] outline-none"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {blendModeLabel(mode)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[18px] shrink-0" />
        </div>

        {isFrame && (
          <div className="flex items-center gap-1.5">
            <div className="border-input flex h-6 min-w-0 flex-1 items-center justify-between rounded-md border pl-2 pr-1">
              <span className="text-[11px]">Clip content</span>
              <button
                type="button"
                onClick={handleClipToggle}
                className={`h-4.5 rounded px-1.5 text-[10px] leading-none transition-colors ${
                  shape.clip
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {shape.clip ? 'On' : 'Off'}
              </button>
            </div>
            <div className="w-[18px] shrink-0" />
          </div>
        )}
      </div>
    </section>
  );
}
