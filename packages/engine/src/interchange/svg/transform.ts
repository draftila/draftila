export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_MATRIX: TransformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyMatrices(m1: TransformMatrix, m2: TransformMatrix): TransformMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function parseTranslate(args: number[]): TransformMatrix {
  const tx = args[0] ?? 0;
  const ty = args[1] ?? 0;
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function parseScale(args: number[]): TransformMatrix {
  const sx = args[0] ?? 1;
  const sy = args[1] ?? sx;
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

function parseRotate(args: number[]): TransformMatrix {
  const angleDeg = args[0] ?? 0;
  const cx = args[1] ?? 0;
  const cy = args[2] ?? 0;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  if (cx === 0 && cy === 0) {
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  }

  const t1 = parseTranslate([cx, cy]);
  const r = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const t2 = parseTranslate([-cx, -cy]);
  return multiplyMatrices(multiplyMatrices(t1, r), t2);
}

function parseSkewX(args: number[]): TransformMatrix {
  const rad = ((args[0] ?? 0) * Math.PI) / 180;
  return { a: 1, b: 0, c: Math.tan(rad), d: 1, e: 0, f: 0 };
}

function parseSkewY(args: number[]): TransformMatrix {
  const rad = ((args[0] ?? 0) * Math.PI) / 180;
  return { a: 1, b: Math.tan(rad), c: 0, d: 1, e: 0, f: 0 };
}

function parseMatrixArgs(args: number[]): TransformMatrix {
  return {
    a: args[0] ?? 1,
    b: args[1] ?? 0,
    c: args[2] ?? 0,
    d: args[3] ?? 1,
    e: args[4] ?? 0,
    f: args[5] ?? 0,
  };
}

const TRANSFORM_REGEX = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

export function parseTransform(transformStr: string | null): TransformMatrix {
  if (!transformStr) return IDENTITY_MATRIX;

  let result = IDENTITY_MATRIX;
  let match: RegExpExecArray | null;
  TRANSFORM_REGEX.lastIndex = 0;

  while ((match = TRANSFORM_REGEX.exec(transformStr)) !== null) {
    const fn = match[1]!;
    const args = match[2]!
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n));

    let m: TransformMatrix;
    switch (fn) {
      case 'translate':
        m = parseTranslate(args);
        break;
      case 'scale':
        m = parseScale(args);
        break;
      case 'rotate':
        m = parseRotate(args);
        break;
      case 'skewX':
        m = parseSkewX(args);
        break;
      case 'skewY':
        m = parseSkewY(args);
        break;
      case 'matrix':
        m = parseMatrixArgs(args);
        break;
      default:
        continue;
    }
    result = multiplyMatrices(result, m);
  }

  return result;
}

export function decomposeTransform(m: TransformMatrix): {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const translateX = m.e;
  const translateY = m.f;
  const det = m.a * m.d - m.b * m.c;
  const scaleXMag = Math.sqrt(m.a * m.a + m.b * m.b);
  const scaleYMag = Math.sqrt(m.c * m.c + m.d * m.d);
  const scaleX = det < 0 ? -scaleXMag : scaleXMag;
  const scaleY = scaleYMag;
  const rotation = Math.atan2(m.b, m.a);
  return { translateX, translateY, rotation, scaleX, scaleY };
}
