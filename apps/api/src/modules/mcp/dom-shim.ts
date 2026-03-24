import { parseHTML } from 'linkedom';

const { document, DOMParser } = parseHTML('<!DOCTYPE html><html><body></body></html>');

globalThis.document = document as unknown as typeof globalThis.document;
globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;

globalThis.CSS = {
  escape: (s: string) => s.replace(/([^\w-])/g, '\\$1'),
  supports: () => false,
} as unknown as typeof globalThis.CSS;

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[]) {
    if (init && init.length >= 6) {
      this.a = init[0]!;
      this.b = init[1]!;
      this.c = init[2]!;
      this.d = init[3]!;
      this.e = init[4]!;
      this.f = init[5]!;
    }
  }

  multiplySelf(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    const a = this.a * other.a + this.c * other.b;
    const b = this.b * other.a + this.d * other.b;
    const c = this.a * other.c + this.c * other.d;
    const d = this.b * other.c + this.d * other.d;
    const e = this.a * other.e + this.c * other.f + this.e;
    const f = this.b * other.e + this.d * other.f + this.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  translateSelf(tx: number, ty: number): DOMMatrixPolyfill {
    this.e += this.a * tx + this.c * ty;
    this.f += this.b * tx + this.d * ty;
    return this;
  }

  scaleSelf(sx: number, sy?: number): DOMMatrixPolyfill {
    const scaleY = sy ?? sx;
    this.a *= sx;
    this.b *= sx;
    this.c *= scaleY;
    this.d *= scaleY;
    return this;
  }

  rotateSelf(angle: number): DOMMatrixPolyfill {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const a = this.a * cos + this.c * sin;
    const b = this.b * cos + this.d * sin;
    const c = this.a * -sin + this.c * cos;
    const d = this.b * -sin + this.d * cos;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return this;
  }

  skewXSelf(angle: number): DOMMatrixPolyfill {
    const tan = Math.tan((angle * Math.PI) / 180);
    const c = this.a * tan + this.c;
    const d = this.b * tan + this.d;
    this.c = c;
    this.d = d;
    return this;
  }

  skewYSelf(angle: number): DOMMatrixPolyfill {
    const tan = Math.tan((angle * Math.PI) / 180);
    const a = this.a + this.c * tan;
    const b = this.b + this.d * tan;
    this.a = a;
    this.b = b;
    return this;
  }

  transformPoint(pt: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.a * pt.x + this.c * pt.y + this.e,
      y: this.b * pt.x + this.d * pt.y + this.f,
    };
  }
}

if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof globalThis.DOMMatrix;
}
