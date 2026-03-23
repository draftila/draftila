export function parseTransformMatrix(transform: string | null): DOMMatrix | null {
  if (!transform || transform.trim() === '') return null;

  const matrix = new DOMMatrix();
  const fns = [...transform.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\(([^)]+)\)/gi)];

  if (fns.length === 0) return null;

  for (const fn of fns) {
    const name = fn[1]!.toLowerCase();
    const args = fn[2]!
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    switch (name) {
      case 'matrix': {
        if (args.length >= 6) {
          const m = new DOMMatrix([args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!]);
          matrix.multiplySelf(m);
        }
        break;
      }
      case 'translate': {
        matrix.translateSelf(args[0] ?? 0, args[1] ?? 0);
        break;
      }
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args[1] ?? sx;
        matrix.scaleSelf(sx, sy);
        break;
      }
      case 'rotate': {
        const angle = args[0] ?? 0;
        const cx = args[1] ?? 0;
        const cy = args[2] ?? 0;
        if (cx !== 0 || cy !== 0) {
          matrix.translateSelf(cx, cy);
          matrix.rotateSelf(angle);
          matrix.translateSelf(-cx, -cy);
        } else {
          matrix.rotateSelf(angle);
        }
        break;
      }
      case 'skewx': {
        matrix.skewXSelf(args[0] ?? 0);
        break;
      }
      case 'skewy': {
        matrix.skewYSelf(args[0] ?? 0);
        break;
      }
    }
  }

  return matrix;
}

export function isIdentityMatrix(m: DOMMatrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

export function decomposeTransform(m: DOMMatrix): {
  tx: number;
  ty: number;
  rotation: number;
  sx: number;
  sy: number;
} {
  const tx = m.e;
  const ty = m.f;
  const sx = Math.sqrt(m.a * m.a + m.b * m.b);
  const sy = Math.sqrt(m.c * m.c + m.d * m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return { tx, ty, rotation, sx, sy };
}

export function isRectilinearTransform(m: DOMMatrix): boolean {
  const dot = m.a * m.c + m.b * m.d;
  return Math.abs(dot) < 0.0001;
}
