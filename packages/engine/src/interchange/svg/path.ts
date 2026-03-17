import type { TransformMatrix } from './transform';

export interface PathCommand {
  type: string;
  values: number[];
}

const NUM_REGEX = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

function tokenizeNumbers(str: string): number[] {
  const result: number[] = [];
  let m: RegExpExecArray | null;
  NUM_REGEX.lastIndex = 0;
  while ((m = NUM_REGEX.exec(str)) !== null) {
    result.push(Number(m[0]));
  }
  return result;
}

const PARAM_COUNTS: Record<string, number> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
  Z: 0,
  z: 0,
};

const IMPLICIT_COMMAND: Record<string, string> = { M: 'L', m: 'l' };

export function parseSvgPathData(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const cmdRegex = /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = cmdRegex.exec(d)) !== null) {
    const type = match[1]!;
    const valStr = match[2]!.trim();
    const values = valStr.length > 0 ? tokenizeNumbers(valStr) : [];
    const paramCount = PARAM_COUNTS[type] ?? 0;

    if (paramCount === 0 || values.length <= paramCount) {
      commands.push({ type, values });
    } else {
      commands.push({ type, values: values.slice(0, paramCount) });
      const implicitType = IMPLICIT_COMMAND[type] ?? type;
      for (let i = paramCount; i < values.length; i += paramCount) {
        commands.push({ type: implicitType, values: values.slice(i, i + paramCount) });
      }
    }
  }

  return commands;
}

export function normalizePathToAbsolute(commands: PathCommand[]): PathCommand[] {
  const result: PathCommand[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCpX = 0;
  let lastCpY = 0;
  let lastType = '';

  for (const cmd of commands) {
    const { type, values } = cmd;

    switch (type) {
      case 'M':
        cx = values[0]!;
        cy = values[1]!;
        startX = cx;
        startY = cy;
        result.push({ type: 'M', values: [cx, cy] });
        break;
      case 'm':
        cx += values[0]!;
        cy += values[1]!;
        startX = cx;
        startY = cy;
        result.push({ type: 'M', values: [cx, cy] });
        break;
      case 'L':
        cx = values[0]!;
        cy = values[1]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'l':
        cx += values[0]!;
        cy += values[1]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'H':
        cx = values[0]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'h':
        cx += values[0]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'V':
        cy = values[0]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'v':
        cy += values[0]!;
        result.push({ type: 'L', values: [cx, cy] });
        break;
      case 'C':
        lastCpX = values[2]!;
        lastCpY = values[3]!;
        cx = values[4]!;
        cy = values[5]!;
        result.push({ type: 'C', values: [...values] });
        lastType = 'C';
        continue;
      case 'c': {
        const x1 = cx + values[0]!;
        const y1 = cy + values[1]!;
        const x2 = cx + values[2]!;
        const y2 = cy + values[3]!;
        const x = cx + values[4]!;
        const y = cy + values[5]!;
        lastCpX = x2;
        lastCpY = y2;
        cx = x;
        cy = y;
        result.push({ type: 'C', values: [x1, y1, x2, y2, x, y] });
        lastType = 'C';
        continue;
      }
      case 'S': {
        let cpx = cx;
        let cpy = cy;
        if (lastType === 'C' || lastType === 'S') {
          cpx = 2 * cx - lastCpX;
          cpy = 2 * cy - lastCpY;
        }
        lastCpX = values[0]!;
        lastCpY = values[1]!;
        cx = values[2]!;
        cy = values[3]!;
        result.push({ type: 'C', values: [cpx, cpy, lastCpX, lastCpY, cx, cy] });
        lastType = 'S';
        continue;
      }
      case 's': {
        let cpx = cx;
        let cpy = cy;
        if (lastType === 'C' || lastType === 'S') {
          cpx = 2 * cx - lastCpX;
          cpy = 2 * cy - lastCpY;
        }
        lastCpX = cx + values[0]!;
        lastCpY = cy + values[1]!;
        cx += values[2]!;
        cy += values[3]!;
        result.push({ type: 'C', values: [cpx, cpy, lastCpX, lastCpY, cx, cy] });
        lastType = 'S';
        continue;
      }
      case 'Q':
        lastCpX = values[0]!;
        lastCpY = values[1]!;
        cx = values[2]!;
        cy = values[3]!;
        result.push({ type: 'Q', values: [...values] });
        lastType = 'Q';
        continue;
      case 'q': {
        const qx1 = cx + values[0]!;
        const qy1 = cy + values[1]!;
        const qx = cx + values[2]!;
        const qy = cy + values[3]!;
        lastCpX = qx1;
        lastCpY = qy1;
        cx = qx;
        cy = qy;
        result.push({ type: 'Q', values: [qx1, qy1, qx, qy] });
        lastType = 'Q';
        continue;
      }
      case 'T': {
        let cpx = cx;
        let cpy = cy;
        if (lastType === 'Q' || lastType === 'T') {
          cpx = 2 * cx - lastCpX;
          cpy = 2 * cy - lastCpY;
        }
        lastCpX = cpx;
        lastCpY = cpy;
        cx = values[0]!;
        cy = values[1]!;
        result.push({ type: 'Q', values: [lastCpX, lastCpY, cx, cy] });
        lastType = 'T';
        continue;
      }
      case 't': {
        let cpx = cx;
        let cpy = cy;
        if (lastType === 'Q' || lastType === 'T') {
          cpx = 2 * cx - lastCpX;
          cpy = 2 * cy - lastCpY;
        }
        lastCpX = cpx;
        lastCpY = cpy;
        cx += values[0]!;
        cy += values[1]!;
        result.push({ type: 'Q', values: [lastCpX, lastCpY, cx, cy] });
        lastType = 'T';
        continue;
      }
      case 'A':
        cx = values[5]!;
        cy = values[6]!;
        result.push({ type: 'A', values: [...values] });
        break;
      case 'a':
        cx += values[5]!;
        cy += values[6]!;
        result.push({
          type: 'A',
          values: [values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, cx, cy],
        });
        break;
      case 'Z':
      case 'z':
        cx = startX;
        cy = startY;
        result.push({ type: 'Z', values: [] });
        break;
      default:
        result.push(cmd);
        break;
    }

    lastType = type.toUpperCase();
    if (type !== 'C' && type !== 'c' && type !== 'S' && type !== 's') {
      lastCpX = cx;
      lastCpY = cy;
    }
  }

  return result;
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -3 * p0 + 9 * p1 - 9 * p2 + 3 * p3;
  const b = 6 * p0 - 12 * p1 + 6 * p2;
  const c = 3 * p1 - 3 * p0;
  const extrema: number[] = [];

  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) extrema.push(t);
    }
    return extrema;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return extrema;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b + sqrtD) / (2 * a);
  const t2 = (-b - sqrtD) / (2 * a);
  if (t1 > 0 && t1 < 1) extrema.push(t1);
  if (t2 > 0 && t2 < 1) extrema.push(t2);
  return extrema;
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function quadraticExtrema(p0: number, p1: number, p2: number): number[] {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < 1e-12) return [];
  const t = (p0 - p1) / denom;
  if (t > 0 && t < 1) return [t];
  return [];
}

function quadraticAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function arcBounds(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
  theta1: number,
  dtheta: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const theta2 = theta1 + dtheta;
  const start = Math.min(theta1, theta2);
  const end = Math.max(theta1, theta2);

  function evalX(t: number): number {
    return cx + rx * Math.cos(phi) * Math.cos(t) - ry * Math.sin(phi) * Math.sin(t);
  }
  function evalY(t: number): number {
    return cy + rx * Math.sin(phi) * Math.cos(t) + ry * Math.cos(phi) * Math.sin(t);
  }

  let minX = Math.min(evalX(theta1), evalX(theta2));
  let maxX = Math.max(evalX(theta1), evalX(theta2));
  let minY = Math.min(evalY(theta1), evalY(theta2));
  let maxY = Math.max(evalY(theta1), evalY(theta2));

  const critAnglesX = [Math.atan2(-ry * Math.sin(phi), rx * Math.cos(phi))];
  critAnglesX.push(critAnglesX[0]! + Math.PI);
  const critAnglesY = [Math.atan2(ry * Math.cos(phi), rx * Math.sin(phi))];
  critAnglesY.push(critAnglesY[0]! + Math.PI);

  for (const base of [...critAnglesX, ...critAnglesY]) {
    for (let k = -4; k <= 4; k++) {
      const angle = base + k * 2 * Math.PI;
      if (angle >= start - 1e-9 && angle <= end + 1e-9) {
        const x = evalX(angle);
        const y = evalY(angle);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

function endpointToCenter(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phi: number,
  fA: number,
  fS: number,
  x2: number,
  y2: number,
): { cx: number; cy: number; theta1: number; dtheta: number; rx: number; ry: number } {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
  if (sq < 0) sq = 0;
  let root = Math.sqrt(sq);
  if (fA === fS) root = -root;

  const cxp = (root * rx * y1p) / ry;
  const cyp = -(root * ry * x1p) / rx;

  const centerX = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const centerY = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dtheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - theta1;

  if (fS === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
  if (fS === 1 && dtheta < 0) dtheta += 2 * Math.PI;

  return { cx: centerX, cy: centerY, theta1, dtheta, rx, ry };
}

export function pathCommandsToBounds(commands: PathCommand[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  function expand(x: number, y: number): void {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (const cmd of commands) {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
        cx = values[0]!;
        cy = values[1]!;
        startX = cx;
        startY = cy;
        expand(cx, cy);
        break;
      case 'm':
        cx += values[0]!;
        cy += values[1]!;
        startX = cx;
        startY = cy;
        expand(cx, cy);
        break;
      case 'L':
      case 'T':
        for (let i = 0; i < values.length; i += 2) {
          cx = values[i]!;
          cy = values[i + 1]!;
          expand(cx, cy);
        }
        break;
      case 'l':
      case 't':
        for (let i = 0; i < values.length; i += 2) {
          cx += values[i]!;
          cy += values[i + 1]!;
          expand(cx, cy);
        }
        break;
      case 'H':
        for (const v of values) {
          cx = v;
          expand(cx, cy);
        }
        break;
      case 'h':
        for (const v of values) {
          cx += v;
          expand(cx, cy);
        }
        break;
      case 'V':
        for (const v of values) {
          cy = v;
          expand(cx, cy);
        }
        break;
      case 'v':
        for (const v of values) {
          cy += v;
          expand(cx, cy);
        }
        break;
      case 'C':
        for (let i = 0; i < values.length; i += 6) {
          const x0 = cx;
          const y0 = cy;
          const x1 = values[i]!;
          const y1 = values[i + 1]!;
          const x2 = values[i + 2]!;
          const y2 = values[i + 3]!;
          const x3 = values[i + 4]!;
          const y3 = values[i + 5]!;

          expand(x3, y3);

          for (const t of cubicExtrema(x0, x1, x2, x3)) {
            expand(cubicAt(x0, x1, x2, x3, t), cy);
          }
          for (const t of cubicExtrema(y0, y1, y2, y3)) {
            expand(cx, cubicAt(y0, y1, y2, y3, t));
          }

          cx = x3;
          cy = y3;
        }
        break;
      case 'c':
        for (let i = 0; i < values.length; i += 6) {
          const x0 = cx;
          const y0 = cy;
          const x1 = cx + values[i]!;
          const y1 = cy + values[i + 1]!;
          const x2 = cx + values[i + 2]!;
          const y2 = cy + values[i + 3]!;
          const x3 = cx + values[i + 4]!;
          const y3 = cy + values[i + 5]!;

          expand(x3, y3);

          for (const t of cubicExtrema(x0, x1, x2, x3)) {
            expand(cubicAt(x0, x1, x2, x3, t), cy);
          }
          for (const t of cubicExtrema(y0, y1, y2, y3)) {
            expand(cx, cubicAt(y0, y1, y2, y3, t));
          }

          cx = x3;
          cy = y3;
        }
        break;
      case 'Q':
        for (let i = 0; i < values.length; i += 4) {
          const qx0 = cx;
          const qy0 = cy;
          const qx1 = values[i]!;
          const qy1 = values[i + 1]!;
          const qx2 = values[i + 2]!;
          const qy2 = values[i + 3]!;

          expand(qx2, qy2);

          for (const t of quadraticExtrema(qx0, qx1, qx2)) {
            expand(quadraticAt(qx0, qx1, qx2, t), cy);
          }
          for (const t of quadraticExtrema(qy0, qy1, qy2)) {
            expand(cx, quadraticAt(qy0, qy1, qy2, t));
          }

          cx = qx2;
          cy = qy2;
        }
        break;
      case 'q':
        for (let i = 0; i < values.length; i += 4) {
          const qx0 = cx;
          const qy0 = cy;
          const qx1 = cx + values[i]!;
          const qy1 = cy + values[i + 1]!;
          const qx2 = cx + values[i + 2]!;
          const qy2 = cy + values[i + 3]!;

          expand(qx2, qy2);

          for (const t of quadraticExtrema(qx0, qx1, qx2)) {
            expand(quadraticAt(qx0, qx1, qx2, t), cy);
          }
          for (const t of quadraticExtrema(qy0, qy1, qy2)) {
            expand(cx, quadraticAt(qy0, qy1, qy2, t));
          }

          cx = qx2;
          cy = qy2;
        }
        break;
      case 'S':
        for (let i = 0; i < values.length; i += 4) {
          expand(values[i]!, values[i + 1]!);
          cx = values[i + 2]!;
          cy = values[i + 3]!;
          expand(cx, cy);
        }
        break;
      case 's':
        for (let i = 0; i < values.length; i += 4) {
          expand(cx + values[i]!, cy + values[i + 1]!);
          cx += values[i + 2]!;
          cy += values[i + 3]!;
          expand(cx, cy);
        }
        break;
      case 'A':
        for (let i = 0; i < values.length; i += 7) {
          const arcRx = values[i]!;
          const arcRy = values[i + 1]!;
          const rotation = (values[i + 2]! * Math.PI) / 180;
          const fA = values[i + 3]!;
          const fS = values[i + 4]!;
          const ex = values[i + 5]!;
          const ey = values[i + 6]!;

          if (arcRx === 0 || arcRy === 0) {
            expand(ex, ey);
            cx = ex;
            cy = ey;
            break;
          }

          const center = endpointToCenter(
            cx,
            cy,
            Math.abs(arcRx),
            Math.abs(arcRy),
            rotation,
            fA,
            fS,
            ex,
            ey,
          );
          const ab = arcBounds(
            center.cx,
            center.cy,
            center.rx,
            center.ry,
            rotation,
            center.theta1,
            center.dtheta,
          );
          expand(ab.minX, ab.minY);
          expand(ab.maxX, ab.maxY);

          cx = ex;
          cy = ey;
        }
        break;
      case 'a':
        for (let i = 0; i < values.length; i += 7) {
          const arcRx = values[i]!;
          const arcRy = values[i + 1]!;
          const rotation = (values[i + 2]! * Math.PI) / 180;
          const fA = values[i + 3]!;
          const fS = values[i + 4]!;
          const ex = cx + values[i + 5]!;
          const ey = cy + values[i + 6]!;

          if (arcRx === 0 || arcRy === 0) {
            expand(ex, ey);
            cx = ex;
            cy = ey;
            break;
          }

          const center = endpointToCenter(
            cx,
            cy,
            Math.abs(arcRx),
            Math.abs(arcRy),
            rotation,
            fA,
            fS,
            ex,
            ey,
          );
          const ab = arcBounds(
            center.cx,
            center.cy,
            center.rx,
            center.ry,
            rotation,
            center.theta1,
            center.dtheta,
          );
          expand(ab.minX, ab.minY);
          expand(ab.maxX, ab.maxY);

          cx = ex;
          cy = ey;
        }
        break;
      case 'Z':
      case 'z':
        cx = startX;
        cy = startY;
        break;
    }
  }

  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function translateSvgPathData(commands: PathCommand[], dx: number, dy: number): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
      case 'L':
      case 'T': {
        const translated: number[] = [];
        for (let i = 0; i < values.length; i += 2) {
          translated.push(values[i]! + dx, values[i + 1]! + dy);
        }
        parts.push(type + translated.join(' '));
        break;
      }
      case 'H': {
        const translated = values.map((v) => v + dx);
        parts.push(type + translated.join(' '));
        break;
      }
      case 'V': {
        const translated = values.map((v) => v + dy);
        parts.push(type + translated.join(' '));
        break;
      }
      case 'C': {
        const translated: number[] = [];
        for (let i = 0; i < values.length; i += 6) {
          translated.push(
            values[i]! + dx,
            values[i + 1]! + dy,
            values[i + 2]! + dx,
            values[i + 3]! + dy,
            values[i + 4]! + dx,
            values[i + 5]! + dy,
          );
        }
        parts.push(type + translated.join(' '));
        break;
      }
      case 'S':
      case 'Q': {
        const translated: number[] = [];
        for (let i = 0; i < values.length; i += 4) {
          translated.push(
            values[i]! + dx,
            values[i + 1]! + dy,
            values[i + 2]! + dx,
            values[i + 3]! + dy,
          );
        }
        parts.push(type + translated.join(' '));
        break;
      }
      case 'A': {
        const translated: number[] = [];
        for (let i = 0; i < values.length; i += 7) {
          translated.push(
            values[i]!,
            values[i + 1]!,
            values[i + 2]!,
            values[i + 3]!,
            values[i + 4]!,
            values[i + 5]! + dx,
            values[i + 6]! + dy,
          );
        }
        parts.push(type + translated.join(' '));
        break;
      }
      case 'm':
      case 'l':
      case 't':
      case 'h':
      case 'v':
      case 'c':
      case 's':
      case 'q':
      case 'a':
        parts.push(type + values.join(' '));
        break;
      case 'Z':
      case 'z':
        parts.push(type);
        break;
      default:
        parts.push(type + values.join(' '));
        break;
    }
  }
  return parts.join('');
}

export function scaleSvgPathData(commands: PathCommand[], sx: number, sy: number): PathCommand[] {
  return commands.map((cmd) => {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
      case 'L':
      case 'T':
      case 'm':
      case 'l':
      case 't': {
        const scaled: number[] = [];
        for (let i = 0; i < values.length; i += 2) {
          scaled.push(values[i]! * sx, values[i + 1]! * sy);
        }
        return { type, values: scaled };
      }
      case 'H':
      case 'h':
        return { type, values: values.map((v) => v * sx) };
      case 'V':
      case 'v':
        return { type, values: values.map((v) => v * sy) };
      case 'C':
      case 'c': {
        const scaled: number[] = [];
        for (let i = 0; i < values.length; i += 6) {
          scaled.push(
            values[i]! * sx,
            values[i + 1]! * sy,
            values[i + 2]! * sx,
            values[i + 3]! * sy,
            values[i + 4]! * sx,
            values[i + 5]! * sy,
          );
        }
        return { type, values: scaled };
      }
      case 'S':
      case 'Q':
      case 's':
      case 'q': {
        const scaled: number[] = [];
        for (let i = 0; i < values.length; i += 4) {
          scaled.push(
            values[i]! * sx,
            values[i + 1]! * sy,
            values[i + 2]! * sx,
            values[i + 3]! * sy,
          );
        }
        return { type, values: scaled };
      }
      case 'A':
      case 'a': {
        const scaled: number[] = [];
        for (let i = 0; i < values.length; i += 7) {
          scaled.push(
            values[i]! * sx,
            values[i + 1]! * sy,
            values[i + 2]!,
            values[i + 3]!,
            values[i + 4]!,
            values[i + 5]! * sx,
            values[i + 6]! * sy,
          );
        }
        return { type, values: scaled };
      }
      case 'Z':
      case 'z':
        return cmd;
      default:
        return cmd;
    }
  });
}

export function transformPathCommands(
  commands: PathCommand[],
  matrix: TransformMatrix,
): PathCommand[] {
  function transformPoint(x: number, y: number): [number, number] {
    return [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f];
  }

  return commands.map((cmd) => {
    const { type, values } = cmd;
    switch (type) {
      case 'M':
      case 'L': {
        const [tx, ty] = transformPoint(values[0]!, values[1]!);
        return { type, values: [tx, ty] };
      }
      case 'C': {
        const [x1, y1] = transformPoint(values[0]!, values[1]!);
        const [x2, y2] = transformPoint(values[2]!, values[3]!);
        const [x, y] = transformPoint(values[4]!, values[5]!);
        return { type, values: [x1, y1, x2, y2, x, y] };
      }
      case 'Q': {
        const [x1, y1] = transformPoint(values[0]!, values[1]!);
        const [x, y] = transformPoint(values[2]!, values[3]!);
        return { type, values: [x1, y1, x, y] };
      }
      case 'A': {
        const rx = values[0]!;
        const ry = values[1]!;
        const rotation = values[2]!;
        const fA = values[3]!;
        const fS = values[4]!;
        const [ex, ey] = transformPoint(values[5]!, values[6]!);

        const det = matrix.a * matrix.d - matrix.b * matrix.c;
        const sxMag = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
        const syMag = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);

        const newRx = rx * sxMag;
        const newRy = ry * syMag;
        const matRotation = Math.atan2(matrix.b, matrix.a);
        const newRotation = rotation + (matRotation * 180) / Math.PI;
        const newFS = det < 0 ? (fS === 0 ? 1 : 0) : fS;

        return { type: 'A', values: [newRx, newRy, newRotation, fA, newFS, ex, ey] };
      }
      case 'Z':
        return { type: 'Z', values: [] };
      default:
        return cmd;
    }
  });
}

export function pathCommandsToString(commands: PathCommand[]): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    if (cmd.type === 'Z') {
      parts.push('Z');
    } else {
      parts.push(cmd.type + cmd.values.join(' '));
    }
  }
  return parts.join('');
}
