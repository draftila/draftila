import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pipette } from 'lucide-react';
import { type Hsv, hexToHsv, hsvToHex, hueToHex } from './color-conversions';
import {
  type ColorMode,
  MODE_LABELS,
  MODES,
  detectAndParseColor,
  formatColorForMode,
  parseColorInput,
} from './color-parsing';

interface ColorPickerProps {
  color: string;
  opacity: number;
  onChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  children: React.ReactNode;
}

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

function useDrag(onDrag: (x: number, y: number) => void): {
  handlePointerDown: (e: React.PointerEvent) => void;
} {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const computePos = (clientX: number, clientY: number) => {
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        return { x, y };
      };
      const pos = computePos(e.clientX, e.clientY);
      onDrag(pos.x, pos.y);

      const onMove = (ev: PointerEvent) => {
        const p = computePos(ev.clientX, ev.clientY);
        onDrag(p.x, p.y);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onDrag],
  );
  return { handlePointerDown };
}

export function ColorPicker({
  color,
  opacity,
  onChange,
  onOpacityChange,
  children,
}: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [colorMode, setColorMode] = useState<ColorMode>('hex');
  const [colorInput, setColorInput] = useState(() => formatColorForMode('hex', color));
  const [opacityInput, setOpacityInput] = useState(String(Math.round(opacity * 100)));
  const externalColorRef = useRef(color);

  useEffect(() => {
    if (color !== externalColorRef.current) {
      externalColorRef.current = color;
      setHsv(hexToHsv(color));
      setColorInput(formatColorForMode(colorMode, color));
    }
  }, [color, colorMode]);

  useEffect(() => {
    setOpacityInput(String(Math.round(opacity * 100)));
  }, [opacity]);

  const commitColor = useCallback(
    (newHsv: Hsv) => {
      setHsv(newHsv);
      const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
      externalColorRef.current = hex;
      setColorInput(formatColorForMode(colorMode, hex));
      onChange(hex);
    },
    [onChange, colorMode],
  );

  const commitHex = useCallback(
    (hex: string) => {
      externalColorRef.current = hex;
      setHsv(hexToHsv(hex));
      setColorInput(formatColorForMode(colorMode, hex));
      onChange(hex);
    },
    [onChange, colorMode],
  );

  const handleSatValDrag = useCallback(
    (x: number, y: number) => {
      commitColor({ h: hsv.h, s: x, v: 1 - y });
    },
    [hsv.h, commitColor],
  );

  const handleHueDrag = useCallback(
    (x: number, _y: number) => {
      commitColor({ h: x, s: hsv.s, v: hsv.v });
    },
    [hsv.s, hsv.v, commitColor],
  );

  const handleOpacityDrag = useCallback(
    (x: number, _y: number) => {
      const newOpacity = Math.round(x * 100) / 100;
      setOpacityInput(String(Math.round(newOpacity * 100)));
      onOpacityChange(newOpacity);
    },
    [onOpacityChange],
  );

  const handleColorInputChange = useCallback(
    (value: string) => {
      setColorInput(value);
      const hex = parseColorInput(colorMode, value);
      if (hex) {
        externalColorRef.current = hex;
        setHsv(hexToHsv(hex));
        onChange(hex);
      }
    },
    [onChange, colorMode],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      const detected = detectAndParseColor(pasted);
      if (detected) {
        e.preventDefault();
        setColorMode(detected.mode);
        externalColorRef.current = detected.hex;
        setHsv(hexToHsv(detected.hex));
        setColorInput(formatColorForMode(detected.mode, detected.hex));
        onChange(detected.hex);
      }
    },
    [onChange],
  );

  const handleOpacityInputChange = useCallback(
    (value: string) => {
      setOpacityInput(value);
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        onOpacityChange(Math.min(100, Math.max(0, num)) / 100);
      }
    },
    [onOpacityChange],
  );

  const handleModeChange = useCallback(
    (mode: ColorMode) => {
      setColorMode(mode);
      const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
      setColorInput(formatColorForMode(mode, currentHex));
    },
    [hsv],
  );

  const handleEyeDropper = useCallback(async () => {
    if (!('EyeDropper' in window)) return;
    try {
      const eyeDropper = new (
        window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }
      ).EyeDropper();
      const result = await eyeDropper.open();
      commitHex(result.sRGBHex.toUpperCase());
    } catch {
      // user cancelled
    }
  }, [commitHex]);

  const satValDrag = useDrag(handleSatValDrag);
  const hueDrag = useDrag(handleHueDrag);
  const opacityDrag = useDrag(handleOpacityDrag);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueHex = hueToHex(hsv.h);
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[232px] p-3" side="left" align="start">
        <div
          className="relative h-[160px] w-full cursor-crosshair rounded-md"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueHex})`,
          }}
          onPointerDown={satValDrag.handlePointerDown}
        >
          <div
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: currentHex,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative flex-shrink-0">
            <div className="h-6 w-6 rounded-full" style={{ background: CHECKERBOARD }}>
              <div
                className="h-full w-full rounded-full"
                style={{ backgroundColor: currentHex, opacity }}
              />
            </div>
            {hasEyeDropper && (
              <button
                type="button"
                onClick={handleEyeDropper}
                className="bg-muted hover:bg-accent absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border"
                title="Pick color from screen"
              >
                <Pipette className="h-2 w-2" />
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <div
              className="relative h-3 w-full cursor-pointer rounded-full"
              style={{
                background:
                  'linear-gradient(to right, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)',
              }}
              onPointerDown={hueDrag.handlePointerDown}
            >
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white"
                style={{
                  left: `${hsv.h * 100}%`,
                  backgroundColor: hueHex,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>

            <div
              className="relative h-3 w-full cursor-pointer rounded-full"
              onPointerDown={opacityDrag.handlePointerDown}
            >
              <div
                className="absolute inset-0 overflow-hidden rounded-full"
                style={{ background: CHECKERBOARD }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to right, transparent, ${currentHex})`,
                  }}
                />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-white"
                style={{
                  left: `${opacity * 100}%`,
                  backgroundColor: currentHex,
                  opacity: opacity,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <Select value={colorMode} onValueChange={(v) => handleModeChange(v as ColorMode)}>
            <SelectTrigger className="h-7 w-[62px] flex-shrink-0 px-2 text-[10px] font-medium [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode} value={mode} className="text-[11px]">
                  {MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="border-input flex h-7 flex-1 items-center rounded-md border px-2">
            <input
              value={colorInput}
              onChange={(e) => handleColorInputChange(e.target.value)}
              onPaste={handlePaste}
              className="w-full bg-transparent font-mono text-[11px] outline-none"
            />
          </div>
          <div className="border-input flex h-7 w-[46px] items-center rounded-md border px-1.5">
            <input
              value={opacityInput}
              onChange={(e) => handleOpacityInputChange(e.target.value)}
              className="w-full bg-transparent text-right font-mono text-[11px] outline-none"
              maxLength={3}
            />
            <span className="text-muted-foreground ml-0.5 text-[10px]">%</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
