import type { PathCommand } from './path';

export function rectToPathCommands(
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 0,
  ry = 0,
): PathCommand[] {
  const r = Math.min(rx, w / 2);
  const ry2 = Math.min(ry || r, h / 2);

  if (r <= 0 && ry2 <= 0) {
    return [
      { type: 'M', values: [x, y] },
      { type: 'L', values: [x + w, y] },
      { type: 'L', values: [x + w, y + h] },
      { type: 'L', values: [x, y + h] },
      { type: 'Z', values: [] },
    ];
  }

  return [
    { type: 'M', values: [x + r, y] },
    { type: 'L', values: [x + w - r, y] },
    { type: 'A', values: [r, ry2, 0, 0, 1, x + w, y + ry2] },
    { type: 'L', values: [x + w, y + h - ry2] },
    { type: 'A', values: [r, ry2, 0, 0, 1, x + w - r, y + h] },
    { type: 'L', values: [x + r, y + h] },
    { type: 'A', values: [r, ry2, 0, 0, 1, x, y + h - ry2] },
    { type: 'L', values: [x, y + ry2] },
    { type: 'A', values: [r, ry2, 0, 0, 1, x + r, y] },
    { type: 'Z', values: [] },
  ];
}

export function ellipseToPathCommands(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathCommand[] {
  return [
    { type: 'M', values: [cx + rx, cy] },
    { type: 'A', values: [rx, ry, 0, 1, 1, cx - rx, cy] },
    { type: 'A', values: [rx, ry, 0, 1, 1, cx + rx, cy] },
    { type: 'Z', values: [] },
  ];
}

export function lineToPathCommands(x1: number, y1: number, x2: number, y2: number): PathCommand[] {
  return [
    { type: 'M', values: [x1, y1] },
    { type: 'L', values: [x2, y2] },
  ];
}

export function polygonToPathCommands(points: number[]): PathCommand[] {
  const commands: PathCommand[] = [];
  for (let i = 0; i < points.length; i += 2) {
    commands.push({
      type: i === 0 ? 'M' : 'L',
      values: [points[i]!, points[i + 1]!],
    });
  }
  commands.push({ type: 'Z', values: [] });
  return commands;
}

export function polylineToPathCommands(points: number[]): PathCommand[] {
  const commands: PathCommand[] = [];
  for (let i = 0; i < points.length; i += 2) {
    commands.push({
      type: i === 0 ? 'M' : 'L',
      values: [points[i]!, points[i + 1]!],
    });
  }
  return commands;
}
