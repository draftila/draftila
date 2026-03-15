import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const [hexInput, setHexInput] = useState(color.replace('#', '').toUpperCase());
  const [opacityInput, setOpacityInput] = useState(String(Math.round(opacity * 100)));
  const externalColorRef = useRef(color);

  useEffect(() => {
    if (color !== externalColorRef.current) {
      externalColorRef.current = color;
      setHsv(hexToHsv(color));
      setHexInput(color.replace('#', '').toUpperCase());
    }
  }, [color]);

  useEffect(() => {
    setOpacityInput(String(Math.round(opacity * 100)));
  }, [opacity]);

  const commitColor = useCallback(
    (newHsv: Hsv) => {
      setHsv(newHsv);
      const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
      externalColorRef.current = hex;
      setHexInput(hex.replace('#', '').toUpperCase());
      onChange(hex);
    },
    [onChange],
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

  const handleHexInputChange = useCallback(
    (value: string) => {
      const clean = value.replace('#', '').toUpperCase();
      setHexInput(clean);
      if (/^[0-9A-F]{6}$/.test(clean)) {
        const hex = `#${clean}`;
        externalColorRef.current = hex;
        setHsv(hexToHsv(hex));
        onChange(hex);
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

  const satValDrag = useDrag(handleSatValDrag);
  const hueDrag = useDrag(handleHueDrag);
  const opacityDrag = useDrag(handleOpacityDrag);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueHex = hueToHex(hsv.h);

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

        <div
          className="relative mt-2.5 h-3 w-full cursor-pointer rounded-full"
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
          className="relative mt-2 h-3 w-full cursor-pointer rounded-full"
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

        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="border-input flex h-7 flex-1 items-center rounded-md border px-2">
            <span className="text-muted-foreground mr-1 text-[10px]">Hex</span>
            <input
              value={hexInput}
              onChange={(e) => handleHexInputChange(e.target.value)}
              className="w-full bg-transparent font-mono text-[11px] outline-none"
              maxLength={6}
            />
          </div>
          <div className="border-input flex h-7 w-[52px] items-center rounded-md border px-2">
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
