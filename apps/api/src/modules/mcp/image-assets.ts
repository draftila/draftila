import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { getStorage } from '../../common/lib/storage';
import { loadServerImageAsset } from './image-loader';

export type ImageSourceImporter = (source: string) => Promise<string>;

export interface ImageAssetStorage {
  put(key: string, data: Buffer): Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldImportImageSource(source: string): boolean {
  return (
    source.startsWith('data:') || source.startsWith('http://') || source.startsWith('https://')
  );
}

async function localizeSource(source: unknown, importer: ImageSourceImporter): Promise<unknown> {
  if (typeof source !== 'string' || !shouldImportImageSource(source)) return source;
  return importer(source);
}

async function localizeShapeProps(value: unknown, importer: ImageSourceImporter): Promise<unknown> {
  if (!isRecord(value)) return value;

  const props = { ...value };
  if ('src' in props) {
    props['src'] = await localizeSource(props['src'], importer);
  }

  if (Array.isArray(props['fills'])) {
    props['fills'] = await Promise.all(
      props['fills'].map(async (fill) => {
        if (!isRecord(fill) || !('imageSrc' in fill)) return fill;
        return {
          ...fill,
          imageSrc: await localizeSource(fill['imageSrc'], importer),
        };
      }),
    );
  }

  return props;
}

async function localizeCreateArgs(
  args: Record<string, unknown>,
  importer: ImageSourceImporter,
): Promise<Record<string, unknown>> {
  return { ...args, props: await localizeShapeProps(args['props'], importer) };
}

async function localizeBatchCreateEntry(
  entry: unknown,
  importer: ImageSourceImporter,
): Promise<unknown> {
  if (!isRecord(entry)) return entry;
  const localized: Record<string, unknown> = {
    ...entry,
    props: await localizeShapeProps(entry['props'], importer),
  };
  if (Array.isArray(entry['children'])) {
    localized['children'] = await Promise.all(
      entry['children'].map((child) => localizeBatchCreateEntry(child, importer)),
    );
  }
  return localized;
}

async function localizeBatchCreateArgs(
  args: Record<string, unknown>,
  importer: ImageSourceImporter,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(args['shapes'])) return args;
  const shapes = await Promise.all(
    args['shapes'].map((shape) => localizeBatchCreateEntry(shape, importer)),
  );
  return { ...args, shapes };
}

async function localizeBatchUpdateArgs(
  args: Record<string, unknown>,
  importer: ImageSourceImporter,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(args['updates'])) return args;
  const updates = await Promise.all(
    args['updates'].map(async (update) => {
      if (!isRecord(update)) return update;
      return { ...update, props: await localizeShapeProps(update['props'], importer) };
    }),
  );
  return { ...args, updates };
}

async function localizeImportHtmlArgs(
  args: Record<string, unknown>,
  importer: ImageSourceImporter,
): Promise<Record<string, unknown>> {
  const html = args['html'];
  if (typeof html !== 'string' || html.length === 0) return args;

  const isFullDocument = /<body[\s>]/i.test(html);
  const { document } = isFullDocument
    ? parseHTML(html)
    : parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);

  let changed = false;
  for (const img of document.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src && shouldImportImageSource(src)) {
      img.setAttribute('src', await importer(src));
      changed = true;
    }
  }
  if (!changed) return args;

  const serialized = isFullDocument ? document.toString() : document.body.innerHTML;
  return { ...args, html: serialized };
}

export async function storeMcpImageAsset(
  draftId: string,
  source: string,
  storage: ImageAssetStorage = getStorage(),
): Promise<string> {
  const asset = await loadServerImageAsset(source);
  const digest = createHash('sha256').update(asset.bytes).digest('hex');
  const key = `draft-assets/${draftId}/${digest}.${asset.extension}`;
  return storage.put(key, asset.bytes);
}

export async function localizeMcpToolImageSources(
  tool: string,
  args: Record<string, unknown>,
  importer: ImageSourceImporter,
): Promise<Record<string, unknown>> {
  const sourceCache = new Map<string, Promise<string>>();
  const cachedImporter: ImageSourceImporter = (source) => {
    const existing = sourceCache.get(source);
    if (existing) return existing;
    const imported = importer(source);
    sourceCache.set(source, imported);
    return imported;
  };

  if (tool === 'create_shape' || tool === 'update_shape') {
    return localizeCreateArgs(args, cachedImporter);
  }
  if (tool === 'batch_create_shapes') {
    return localizeBatchCreateArgs(args, cachedImporter);
  }
  if (tool === 'batch_update_shapes') {
    return localizeBatchUpdateArgs(args, cachedImporter);
  }
  if (tool === 'import_html') {
    return localizeImportHtmlArgs(args, cachedImporter);
  }
  return args;
}
