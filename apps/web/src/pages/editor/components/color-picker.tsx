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

type ColorMode = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'oklch' | 'css';

interface ColorPickerProps {
  color: string;
  opacity: number;
  onChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  children: React.ReactNode;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hueToHex(h: number): string {
  const [r, g, b] = hsvToRgb(h, 1, 1);
  return rgbToHex(r, g, b);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return [
    Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hh) * 255),
    Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  ];
}

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const linearize = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);

  const l_ = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m_ = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s_ = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l3 = Math.cbrt(l_);
  const m3 = Math.cbrt(m_);
  const s3 = Math.cbrt(s_);

  const okL = 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3;
  const okA = 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3;
  const okB = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3;

  const C = Math.sqrt(okA * okA + okB * okB);
  let H = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (H < 0) H += 360;

  return [
    Math.round(okL * 100 * 100) / 100,
    Math.round(C * 1000) / 1000,
    Math.round(H * 100) / 100,
  ];
}

function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const okL = l / 100;
  const hRad = (h * Math.PI) / 180;
  const okA = c * Math.cos(hRad);
  const okB = c * Math.sin(hRad);

  const l3 = okL + 0.3963377774 * okA + 0.2158037573 * okB;
  const m3 = okL - 0.1055613458 * okA - 0.0638541728 * okB;
  const s3 = okL - 0.0894841775 * okA - 1.291485548 * okB;

  const l_ = l3 * l3 * l3;
  const m_ = m3 * m3 * m3;
  const s_ = s3 * s3 * s3;

  const rl = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const gl = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  const delinearize = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.0031308
      ? Math.round(clamped * 12.92 * 255)
      : Math.round((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255);
  };

  return [delinearize(rl), delinearize(gl), delinearize(bl)];
}

function parseCssColor(input: string): string | null {
  const result = detectAndParseColor(input);
  return result ? result.hex : null;
}

function detectAndParseColor(input: string): { hex: string; mode: ColorMode } | null {
  const s = input.trim().toLowerCase();
  const SEP = /[\s,/]+/;

  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1]! + s[1]!;
    const g = s[2]! + s[2]!;
    const b = s[3]! + s[3]!;
    return { hex: `#${r}${g}${b}`.toUpperCase(), mode: 'hex' };
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toUpperCase(), mode: 'hex' };
  if (/^#[0-9a-f]{8}$/i.test(s)) return { hex: s.slice(0, 7).toUpperCase(), mode: 'hex' };

  const inner = s.match(/^(\w+)\(\s*(.+?)\s*\)$/);
  if (inner) {
    const fn = inner[1]!;
    const args = inner[2]!.replace(/%/g, '').split(SEP).filter(Boolean).map(Number);

    if ((fn === 'rgb' || fn === 'rgba') && args.length >= 3 && args.every((n) => !isNaN(n))) {
      return {
        hex: rgbToHex(args[0]!, args[1]!, args[2]!),
        mode: 'rgb',
      };
    }

    if ((fn === 'hsl' || fn === 'hsla') && args.length >= 3 && args.every((n) => !isNaN(n))) {
      const [r, g, b] = hslToRgb(args[0]!, args[1]!, args[2]!);
      return { hex: rgbToHex(r, g, b), mode: 'hsl' };
    }

    if (fn === 'oklch' && args.length >= 3 && args.every((n) => !isNaN(n))) {
      let lVal = args[0]!;
      const hasPercent = inner[2]!.includes('%');
      if (!hasPercent && lVal <= 1) lVal = lVal * 100;
      const [r, g, b] = oklchToRgb(lVal, args[1]!, args[2]!);
      return { hex: rgbToHex(r, g, b), mode: 'oklch' };
    }

    if (fn === 'hsb' && args.length >= 3 && args.every((n) => !isNaN(n))) {
      const [r, g, b] = hsvToRgb(args[0]! / 360, args[1]! / 100, args[2]! / 100);
      return { hex: rgbToHex(r, g, b), mode: 'hsb' };
    }
  }

  return null;
}

function formatColorForMode(mode: ColorMode, hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  switch (mode) {
    case 'hex':
      return hex.replace('#', '').toUpperCase();
    case 'rgb':
      return `${r}, ${g}, ${b}`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `${h}, ${s}%, ${l}%`;
    }
    case 'hsb': {
      const hsv = rgbToHsv(r, g, b);
      return `${Math.round(hsv.h * 360)}, ${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`;
    }
    case 'oklch': {
      const [l, c, h] = rgbToOklch(r, g, b);
      return `${l}% ${c} ${h}`;
    }
    case 'css':
      return hex.toUpperCase();
    default:
      return hex.replace('#', '').toUpperCase();
  }
}

function parseColorInput(mode: ColorMode, value: string): string | null {
  switch (mode) {
    case 'hex': {
      const clean = value.replace('#', '').toUpperCase();
      if (/^[0-9A-F]{6}$/.test(clean)) return `#${clean}`;
      if (/^[0-9A-F]{3}$/.test(clean)) {
        return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
      }
      return null;
    }
    case 'rgb': {
      const parts = value
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
        return rgbToHex(parts[0]!, parts[1]!, parts[2]!);
      }
      return null;
    }
    case 'hsl': {
      const parts = value
        .replace(/%/g, '')
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = hslToRgb(parts[0]!, parts[1]!, parts[2]!);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'hsb': {
      const parts = value
        .replace(/%/g, '')
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = hsvToRgb(parts[0]! / 360, parts[1]! / 100, parts[2]! / 100);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'oklch': {
      const parts = value
        .replace(/%/g, '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        const [r, g, b] = oklchToRgb(parts[0]!, parts[1]!, parts[2]!);
        return rgbToHex(r, g, b);
      }
      return null;
    }
    case 'css':
      return parseCssColor(value);
    default:
      return null;
  }
}

const CHECKERBOARD = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px';

const MODE_LABELS: Record<ColorMode, string> = {
  hex: 'Hex',
  rgb: 'RGB',
  hsl: 'HSL',
  hsb: 'HSB',
  oklch: 'OKLCH',
  css: 'CSS',
};

const MODES: ColorMode[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch', 'css'];

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
