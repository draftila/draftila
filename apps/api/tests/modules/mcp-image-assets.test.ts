import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import {
  localizeMcpToolImageSources,
  storeMcpImageAsset,
} from '../../src/modules/mcp/image-assets';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('mcp image assets', () => {
  test('localizes image shapes and image fills before create mutations', async () => {
    const sources: string[] = [];
    const args = await localizeMcpToolImageSources(
      'create_shape',
      {
        type: 'image',
        props: {
          src: 'https://images.example.com/photo.jpg',
          fills: [
            { color: '#ffffff' },
            { imageSrc: 'https://images.example.com/fill.png', imageFit: 'crop' },
            { imageSrc: '/storage/existing.png' },
          ],
        },
      },
      async (source) => {
        sources.push(source);
        return `/storage/imported-${sources.length}.png`;
      },
    );

    expect(sources).toEqual([
      'https://images.example.com/photo.jpg',
      'https://images.example.com/fill.png',
    ]);
    expect(args).toEqual({
      type: 'image',
      props: {
        src: '/storage/imported-1.png',
        fills: [
          { color: '#ffffff' },
          { imageSrc: '/storage/imported-2.png', imageFit: 'crop' },
          { imageSrc: '/storage/existing.png' },
        ],
      },
    });
  });

  test('localizes batch create and update mutations and deduplicates sources per call', async () => {
    let imports = 0;
    const importer = async () => {
      imports++;
      return '/storage/shared.png';
    };
    const source = 'https://images.example.com/shared.png';

    const created = await localizeMcpToolImageSources(
      'batch_create_shapes',
      {
        shapes: [
          { type: 'rectangle', props: { fills: [{ imageSrc: source }] } },
          { type: 'image', props: { src: source } },
        ],
      },
      importer,
    );
    const updated = await localizeMcpToolImageSources(
      'batch_update_shapes',
      {
        updates: [
          { shapeId: 'a', props: { fills: [{ imageSrc: source }] } },
          { shapeId: 'b', props: { src: source } },
        ],
      },
      importer,
    );

    expect(created).toEqual({
      shapes: [
        { type: 'rectangle', props: { fills: [{ imageSrc: '/storage/shared.png' }] } },
        { type: 'image', props: { src: '/storage/shared.png' } },
      ],
    });
    expect(updated).toEqual({
      updates: [
        { shapeId: 'a', props: { fills: [{ imageSrc: '/storage/shared.png' }] } },
        { shapeId: 'b', props: { src: '/storage/shared.png' } },
      ],
    });
    expect(imports).toBe(2);
  });

  test('localizes data URI fills on single updates', async () => {
    const source = `data:image/png;base64,${PNG_BASE64}`;
    const args = await localizeMcpToolImageSources(
      'update_shape',
      { shapeId: 'shape-1', props: { fills: [{ imageSrc: source }] } },
      async () => '/storage/data-image.png',
    );

    expect(args).toEqual({
      shapeId: 'shape-1',
      props: { fills: [{ imageSrc: '/storage/data-image.png' }] },
    });
  });

  test('stores validated images under a content-addressed draft key', async () => {
    const source = `data:image/png;base64,${PNG_BASE64}`;
    const bytes = Buffer.from(PNG_BASE64, 'base64');
    const digest = createHash('sha256').update(bytes).digest('hex');
    let storedKey = '';
    let storedBytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    const url = await storeMcpImageAsset('draft-1', source, {
      async put(key, data) {
        storedKey = key;
        storedBytes = data;
        return `/storage/${key}`;
      },
    });

    expect(storedKey).toBe(`draft-assets/draft-1/${digest}.png`);
    expect(storedBytes).toEqual(bytes);
    expect(url).toBe(`/storage/draft-assets/draft-1/${digest}.png`);
  });

  test('leaves unrelated tools untouched', async () => {
    const args = { shapeIds: ['shape-1'] };
    const localized = await localizeMcpToolImageSources('delete_shapes', args, async () => {
      throw new Error('Importer should not run');
    });

    expect(localized).toBe(args);
  });
});
