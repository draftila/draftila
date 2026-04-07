import { describe, test, expect } from 'bun:test';
import type { FrameShape } from '@draftila/shared';
import { computeAutoLayout, type LayoutChild } from '../src/auto-layout';

function makeFrame(overrides: Partial<FrameShape> = {}): FrameShape {
  return {
    id: 'frame',
    type: 'frame',
    name: 'Frame',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    fills: [],
    strokes: [],
    layoutMode: 'horizontal',
    layoutGap: 10,
    paddingTop: 10,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    layoutAlign: 'start',
    layoutJustify: 'start',
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'fixed',
    ...overrides,
  } as FrameShape;
}

function makeChild(overrides: Partial<LayoutChild> & { id: string }): LayoutChild {
  return {
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    layoutSizingHorizontal: 'fixed',
    layoutSizingVertical: 'fixed',
    visible: true,
    ...overrides,
  };
}

describe('computeAutoLayout', () => {
  describe('empty frame', () => {
    test('returns padding-only size for hug frame', () => {
      const frame = makeFrame({ layoutSizingHorizontal: 'hug', layoutSizingVertical: 'hug' });
      const { parentSize } = computeAutoLayout(frame, []);
      expect(parentSize.width).toBe(20);
      expect(parentSize.height).toBe(20);
    });

    test('returns original size for fixed frame', () => {
      const frame = makeFrame();
      const { parentSize } = computeAutoLayout(frame, []);
      expect(parentSize.width).toBe(400);
      expect(parentSize.height).toBe(300);
    });
  });

  describe('horizontal layout with fixed children', () => {
    test('positions children left to right with gap', () => {
      const frame = makeFrame();
      const children = [
        makeChild({ id: 'c1', width: 80, height: 40 }),
        makeChild({ id: 'c2', width: 60, height: 40 }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);

      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;

      expect(c1.x).toBe(10);
      expect(c1.y).toBe(10);
      expect(c2.x).toBe(10 + 80 + 10);
      expect(c2.y).toBe(10);
    });
  });

  describe('vertical layout with fixed children', () => {
    test('positions children top to bottom with gap', () => {
      const frame = makeFrame({ layoutMode: 'vertical' });
      const children = [
        makeChild({ id: 'c1', width: 80, height: 40 }),
        makeChild({ id: 'c2', width: 80, height: 60 }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);

      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;

      expect(c1.x).toBe(10);
      expect(c1.y).toBe(10);
      expect(c2.x).toBe(10);
      expect(c2.y).toBe(10 + 40 + 10);
    });
  });

  describe('fill sizing', () => {
    test('fill children share remaining space equally', () => {
      const frame = makeFrame({ width: 400 });
      const children = [
        makeChild({ id: 'c1', width: 80, layoutSizingHorizontal: 'fill' }),
        makeChild({ id: 'c2', width: 80, layoutSizingHorizontal: 'fill' }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;

      const contentWidth = 400 - 20;
      const fillSpace = contentWidth - 10;
      const expected = fillSpace / 2;

      expect(c1.width).toBe(expected);
      expect(c2.width).toBe(expected);
    });

    test('fill mixed with fixed', () => {
      const frame = makeFrame({ width: 400 });
      const children = [
        makeChild({ id: 'fixed', width: 100 }),
        makeChild({ id: 'fill', layoutSizingHorizontal: 'fill' }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);
      const fill = childLayouts.get('fill')!;

      expect(fill.width).toBe(400 - 20 - 100 - 10);
    });
  });

  describe('hug sizing', () => {
    test('frame width hugs content', () => {
      const frame = makeFrame({ layoutSizingHorizontal: 'hug' });
      const children = [makeChild({ id: 'c1', width: 80 }), makeChild({ id: 'c2', width: 60 })];

      const { parentSize } = computeAutoLayout(frame, children);
      expect(parentSize.width).toBe(10 + 80 + 10 + 60 + 10);
    });

    test('frame height hugs content in vertical', () => {
      const frame = makeFrame({ layoutMode: 'vertical', layoutSizingVertical: 'hug' });
      const children = [makeChild({ id: 'c1', height: 40 }), makeChild({ id: 'c2', height: 60 })];

      const { parentSize } = computeAutoLayout(frame, children);
      expect(parentSize.height).toBe(10 + 40 + 10 + 60 + 10);
    });
  });

  describe('alignment', () => {
    test('center aligns children on cross axis', () => {
      const frame = makeFrame({ layoutAlign: 'center', height: 300 });
      const children = [makeChild({ id: 'c1', height: 40 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;

      const contentHeight = 300 - 20;
      expect(c1.y).toBe(10 + (contentHeight - 40) / 2);
    });

    test('end aligns children on cross axis', () => {
      const frame = makeFrame({ layoutAlign: 'end', height: 300 });
      const children = [makeChild({ id: 'c1', height: 40 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;

      expect(c1.y).toBe(10 + (300 - 20) - 40);
    });

    test('stretch fills cross axis', () => {
      const frame = makeFrame({ layoutAlign: 'stretch', height: 300 });
      const children = [makeChild({ id: 'c1', height: 40 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;

      expect(c1.height).toBe(300 - 20);
    });
  });

  describe('justification', () => {
    test('center justifies children on main axis', () => {
      const frame = makeFrame({ layoutJustify: 'center', width: 400 });
      const children = [makeChild({ id: 'c1', width: 80 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;

      const contentWidth = 400 - 20;
      const freeSpace = contentWidth - 80;
      expect(c1.x).toBe(10 + freeSpace / 2);
    });

    test('end justifies children on main axis', () => {
      const frame = makeFrame({ layoutJustify: 'end', width: 400 });
      const children = [makeChild({ id: 'c1', width: 80 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;

      expect(c1.x).toBe(10 + (400 - 20) - 80);
    });

    test('space-between distributes gap evenly', () => {
      const frame = makeFrame({ layoutJustify: 'space-between', width: 400 });
      const children = [
        makeChild({ id: 'c1', width: 50 }),
        makeChild({ id: 'c2', width: 50 }),
        makeChild({ id: 'c3', width: 50 }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;
      const c3 = childLayouts.get('c3')!;

      expect(c1.x).toBe(10);
      const gap = (380 - 150) / 2;
      expect(c2.x).toBeCloseTo(10 + 50 + gap, 5);
      expect(c3.x).toBeCloseTo(10 + 50 + gap + 50 + gap, 5);
    });

    test('space-around adds spacing around each child', () => {
      const frame = makeFrame({ layoutJustify: 'space-around', width: 400 });
      const children = [makeChild({ id: 'c1', width: 50 }), makeChild({ id: 'c2', width: 50 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;

      const spacing = (380 - 100) / 2;
      expect(c1.x).toBeCloseTo(10 + spacing / 2, 5);
      expect(c2.x).toBeCloseTo(10 + spacing / 2 + 50 + spacing, 5);
    });
  });

  describe('single child edge cases', () => {
    test('space-between with single child starts at beginning', () => {
      const frame = makeFrame({ layoutJustify: 'space-between', width: 400 });
      const children = [makeChild({ id: 'c1', width: 80 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      expect(c1.x).toBe(10);
    });
  });

  describe('min/max constraints', () => {
    test('clamps fill child to minWidth', () => {
      const frame = makeFrame({ width: 100 });
      const children = [makeChild({ id: 'c1', layoutSizingHorizontal: 'fill', minWidth: 200 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      expect(c1.width).toBe(200);
    });

    test('clamps fill child to maxWidth', () => {
      const frame = makeFrame({ width: 500 });
      const children = [makeChild({ id: 'c1', layoutSizingHorizontal: 'fill', maxWidth: 100 })];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      expect(c1.width).toBe(100);
    });
  });

  describe('hidden children', () => {
    test('hidden children are excluded from layout', () => {
      const frame = makeFrame({ layoutMode: 'vertical', layoutSizingVertical: 'hug' });
      const children = [
        makeChild({ id: 'c1', height: 40 }),
        makeChild({ id: 'c2', height: 40, visible: false }),
        makeChild({ id: 'c3', height: 40 }),
      ];

      const { parentSize } = computeAutoLayout(frame, children);
      expect(parentSize.height).toBe(10 + 40 + 10 + 40 + 10);
    });
  });

  describe('zero gap and padding', () => {
    test('works with zero gap and zero padding', () => {
      const frame = makeFrame({
        layoutGap: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        layoutSizingHorizontal: 'hug',
      });
      const children = [makeChild({ id: 'c1', width: 50 }), makeChild({ id: 'c2', width: 30 })];

      const { childLayouts, parentSize } = computeAutoLayout(frame, children);
      expect(parentSize.width).toBe(80);
      expect(childLayouts.get('c1')!.x).toBe(0);
      expect(childLayouts.get('c2')!.x).toBe(50);
    });
  });

  describe('wrap', () => {
    test('wraps children to next line when exceeding width', () => {
      const frame = makeFrame({
        width: 200,
        layoutWrap: 'wrap',
        layoutGap: 10,
        layoutGapColumn: 10,
      } as Partial<FrameShape>);
      const children = [
        makeChild({ id: 'c1', width: 80, height: 40 }),
        makeChild({ id: 'c2', width: 80, height: 40 }),
        makeChild({ id: 'c3', width: 80, height: 40 }),
      ];

      const { childLayouts } = computeAutoLayout(frame, children);
      const c1 = childLayouts.get('c1')!;
      const c2 = childLayouts.get('c2')!;
      const c3 = childLayouts.get('c3')!;

      expect(c1.y).toBe(c2.y);
      expect(c3.y).toBeGreaterThan(c1.y);
    });
  });
});
