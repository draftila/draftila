import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import type { FrameShape, ImageShape, Shape, TextShape } from '@draftila/shared';
import { initDocument, getShape, getChildShapes } from '../../../src/scene-graph';
import { ensureDefaultPage } from '../../../src/pages';
import { parseHtml } from '../../../src/interchange/html/html-parser';
import { importHtmlShapes } from '../../../src/shape-import';

const CARD_HTML = `
  <div class="flex flex-col gap-3 p-6 rounded-xl bg-white shadow-md w-80">
    <h2 class="text-xl font-bold text-slate-900">Card title</h2>
    <p class="text-sm text-slate-500">A short <strong>description</strong> here.</p>
    <img src="https://example.com/photo.png" alt="photo" class="w-16 h-16 rounded-full object-cover" />
    <button class="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 rounded-lg">
      <svg viewBox="0 0 24 24" class="size-4"><path d="M5 12h14" /></svg>
      <span class="text-white text-sm font-medium">Action</span>
    </button>
  </div>
`;

function createDoc() {
  const ydoc = new Y.Doc();
  initDocument(ydoc);
  ensureDefaultPage(ydoc);
  return ydoc;
}

describe('parseHtml', () => {
  test('builds the interchange tree for a tailwind card', () => {
    const { doc, warnings } = parseHtml(CARD_HTML);
    expect(warnings).toEqual([]);
    expect(doc.nodes).toHaveLength(1);

    const card = doc.nodes[0]!;
    expect(card.type).toBe('frame');
    expect(card.layoutMode).toBe('vertical');
    expect(card.layoutGap).toBe(12);
    expect(card.paddingTop).toBe(24);
    expect(card.cornerRadius).toBe(12);
    expect(card.width).toBe(320);
    expect(card.layoutSizingHorizontal).toBe('fixed');
    expect(card.layoutSizingVertical).toBe('hug');
    expect(card.fills).toEqual([{ color: '#ffffff', opacity: 1, visible: true }]);
    expect(card.shadows).toHaveLength(2);
    expect(card.children).toHaveLength(4);

    const [title, description, image, button] = card.children;
    expect(title!.type).toBe('text');
    expect(title!.content).toBe('Card title');
    expect(title!.fontSize).toBe(20);
    expect(title!.fontWeight).toBe(700);
    expect(title!.fills[0]!.color).toBe('#0f172a');
    expect(title!.layoutSizingHorizontal).toBe('fill');
    expect(title!.textAutoResize).toBe('height');

    expect(description!.type).toBe('text');
    expect(description!.content).toBe('A short description here.');
    expect(description!.segments).toBeDefined();
    expect(description!.segments!.some((s) => s.fontWeight === 700)).toBe(true);

    expect(image!.type).toBe('image');
    expect(image!.src).toBe('https://example.com/photo.png');
    expect(image!.width).toBe(64);
    expect(image!.fit).toBe('crop');

    expect(button!.type).toBe('frame');
    expect(button!.layoutMode).toBe('horizontal');
    expect(button!.layoutAlign).toBe('center');
    expect(button!.layoutJustify).toBe('center');
    expect(button!.layoutGap).toBe(8);
    expect(button!.paddingLeft).toBe(16);
    expect(button!.paddingTop).toBe(8);
    expect(button!.fills[0]!.color).toBe('#2563eb');
    expect(button!.children).toHaveLength(2);
    expect(button!.children[0]!.type).toBe('svg');
    expect(button!.children[0]!.width).toBe(16);
    expect(button!.children[1]!.type).toBe('text');
    expect(button!.children[1]!.content).toBe('Action');
    expect(button!.children[1]!.fills[0]!.color).toBe('#ffffff');
  });

  test('wraps multiple roots in a synthetic frame', () => {
    const { doc } = parseHtml('<p>One</p><p>Two</p>');
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.type).toBe('frame');
    expect(doc.nodes[0]!.children).toHaveLength(2);
  });

  test('inherits text styles from ancestor containers', () => {
    const { doc } = parseHtml(
      '<div class="text-red-500 text-lg"><div><p>Inherited</p></div></div>',
    );
    let node = doc.nodes[0]!;
    while (node.type !== 'text') node = node.children[0]!;
    expect(node.fills[0]!.color).toBe('#ef4444');
    expect(node.fontSize).toBe(18);
  });

  test('throws on markup without importable elements', () => {
    expect(() => parseHtml('<script>alert(1)</script>')).toThrow();
  });
});

describe('importHtmlShapes', () => {
  test('imports the card into a ydoc and solves the layout', () => {
    const ydoc = createDoc();
    const { rootIds, allIds, warnings } = importHtmlShapes(ydoc, CARD_HTML);

    expect(warnings).toEqual([]);
    expect(rootIds).toHaveLength(1);
    expect(allIds).toHaveLength(7);

    const card = getShape(ydoc, rootIds[0]!) as FrameShape;
    expect(card.type).toBe('frame');
    expect(card.width).toBe(320);
    expect(card.layoutMode).toBe('vertical');

    const children = getChildShapes(ydoc, card.id);
    expect(children).toHaveLength(4);

    const image = children.find((child): child is ImageShape => child.type === 'image')!;
    expect(image.width).toBe(64);
    expect(image.x).toBe(card.x + 24);

    const button = children.find((child): child is FrameShape => child.type === 'frame')!;
    expect(button.width).toBe(272);
    const buttonChildren = getChildShapes(ydoc, button.id);
    expect(buttonChildren).toHaveLength(2);
    const label = buttonChildren.find((child): child is TextShape => child.type === 'text')!;
    expect(label.content).toBe('Action');
  });

  test('emits a single yjs update for the whole import', () => {
    const ydoc = createDoc();
    let updates = 0;
    ydoc.on('update', () => {
      updates += 1;
    });
    importHtmlShapes(ydoc, CARD_HTML);
    expect(updates).toBe(1);
  });

  test('imports into a target parent frame', () => {
    const ydoc = createDoc();
    const { rootIds: parentIds } = importHtmlShapes(
      ydoc,
      '<div class="flex flex-col w-[600px] h-[400px]"></div>',
    );
    const parentId = parentIds[0]!;
    const { rootIds } = importHtmlShapes(ydoc, '<p>Nested</p>', { targetParentId: parentId });
    const nested = getShape(ydoc, rootIds[0]!) as Shape;
    expect(nested.parentId).toBe(parentId);
  });
});
