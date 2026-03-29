import * as Y from 'yjs';
import type { Prisma } from '../../generated/prisma/postgresql-client';
import type { SortOrder, DraftExport, ExportDraftData } from '@draftila/shared';
import { ymapToObject, valueToYjs, DEFAULT_PAGE_BACKGROUND } from '@draftila/engine';
import { getSortConfig, nextTimestamp, paginateResults } from '../../common/lib/pagination';
import { generateStorageKey, getStorage } from '../../common/lib/storage';
import { nanoid } from '../../common/lib/utils';
import { db } from '../../db';
import { userAccessFilter } from '../projects/projects.service';

const draftListSelect = {
  id: true,
  name: true,
  projectId: true,
  thumbnail: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listByProject(
  projectId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  let cursorFilter: Prisma.DraftWhereInput | undefined;
  if (cursor) {
    const cursorDraft = await db.draft.findFirst({
      where: { id: cursor, projectId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorDraft) {
      cursorFilter = sortConfig.where(cursorDraft) as Prisma.DraftWhereInput;
    }
  }

  const where: Prisma.DraftWhereInput = cursorFilter
    ? {
        projectId,
        AND: [cursorFilter],
      }
    : { projectId };

  const results = await db.draft.findMany({
    where,
    select: draftListSelect,
    orderBy: sortConfig.orderBy as Prisma.DraftOrderByWithRelationInput[],
    take: limit + 1,
  });

  return paginateResults(results, limit);
}

export async function listByUser(
  userId: string,
  cursor?: string,
  limit = 20,
  sort: SortOrder = 'last_edited',
) {
  const sortConfig = getSortConfig(sort);

  const accessFilter: Prisma.DraftWhereInput = {
    project: userAccessFilter(userId),
  };

  let cursorFilter: Prisma.DraftWhereInput | undefined;
  if (cursor) {
    const cursorDraft = await db.draft.findFirst({
      where: { id: cursor, ...accessFilter },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (cursorDraft) {
      cursorFilter = sortConfig.where(cursorDraft) as Prisma.DraftWhereInput;
    }
  }

  const where: Prisma.DraftWhereInput = cursorFilter
    ? {
        ...accessFilter,
        AND: [cursorFilter],
      }
    : accessFilter;

  const results = await db.draft.findMany({
    where,
    select: draftListSelect,
    orderBy: sortConfig.orderBy as Prisma.DraftOrderByWithRelationInput[],
    take: limit + 1,
  });

  return paginateResults(results, limit);
}

export function getById(id: string) {
  return db.draft.findUnique({ where: { id }, select: draftListSelect });
}

export function getByIdForUser(draftId: string, userId: string) {
  return db.draft.findFirst({
    where: { id: draftId, project: userAccessFilter(userId) },
    select: draftListSelect,
  });
}

export async function create(data: { name: string; projectId: string }) {
  const id = nanoid();
  const timestamp = nextTimestamp();
  await db.draft.create({
    data: {
      id,
      name: data.name,
      projectId: data.projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  const created = await getById(id);
  if (!created) throw new Error('Failed to create draft');
  return created;
}

export async function update(id: string, data: { name: string }) {
  const timestamp = nextTimestamp();
  const result = await db.draft.updateMany({
    where: { id },
    data: { name: data.name, updatedAt: timestamp },
  });

  if (result.count === 0) return null;
  return getById(id);
}

export async function remove(id: string) {
  const existing = await getById(id);
  if (!existing) return null;

  if (existing.thumbnail) {
    const key = existing.thumbnail.replace(/^\/storage\//, '');
    await getStorage()
      .delete(key)
      .catch(() => {});
  }

  await db.draft.delete({ where: { id } });
  return existing;
}

export async function saveThumbnail(id: string, data: Buffer) {
  const storage = getStorage();

  const existing = await db.draft.findUnique({
    where: { id },
    select: { thumbnail: true },
  });
  if (existing?.thumbnail) {
    const oldKey = existing.thumbnail.replace(/^\/storage\//, '');
    await storage.delete(oldKey).catch(() => {});
  }

  const key = generateStorageKey('thumbnails', 'jpg');
  const url = await storage.put(key, data);

  await db.draft.updateMany({
    where: { id },
    data: { thumbnail: url },
  });

  return url;
}

export async function loadYjsState(id: string) {
  const result = await db.draft.findUnique({
    where: { id },
    select: { yjsState: true },
  });
  return result?.yjsState ?? null;
}

export async function saveYjsState(id: string, state: Buffer) {
  await db.draft.update({ where: { id }, data: { yjsState: new Uint8Array(state) } });
}

function ydocToExportData(name: string, ydoc: Y.Doc): ExportDraftData {
  const pagesMap = ydoc.getMap('pages') as Y.Map<Y.Map<unknown>>;
  const pageOrder = ydoc.getArray<string>('pageOrder');
  const variablesMap = ydoc.getMap('variables') as Y.Map<Y.Map<unknown>>;
  const componentsMap = ydoc.getMap('components') as Y.Map<Y.Map<unknown>>;
  const instancesMap = ydoc.getMap('componentInstances') as Y.Map<string>;

  const orderedPageIds = pageOrder.toArray();

  const pages = orderedPageIds
    .map((pageId) => {
      const page = pagesMap.get(pageId);
      if (!page) return null;

      const shapesYMap = page.get('shapes') as Y.Map<Y.Map<unknown>> | undefined;
      const zOrderYArr = page.get('zOrder') as Y.Array<string> | undefined;

      const shapes: Record<string, unknown>[] = [];
      if (shapesYMap) {
        shapesYMap.forEach((shapeData) => {
          shapes.push(ymapToObject(shapeData));
        });
      }

      return {
        id: pageId,
        name: (page.get('name') as string) ?? 'Untitled',
        backgroundColor: (page.get('backgroundColor') as string) ?? DEFAULT_PAGE_BACKGROUND,
        shapes,
        zOrder: zOrderYArr ? zOrderYArr.toArray() : [],
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (pages.length === 0) {
    const defaultId = nanoid();
    pages.push({
      id: defaultId,
      name: 'Page 1',
      backgroundColor: DEFAULT_PAGE_BACKGROUND,
      shapes: [],
      zOrder: [],
    });
    orderedPageIds.push(defaultId);
  }

  const variables: ExportDraftData['variables'] = [];
  variablesMap.forEach((data, id) => {
    variables.push({
      id,
      name: (data.get('name') as string) ?? '',
      type: 'color',
      value: (data.get('value') as string) ?? '#000000',
    });
  });

  const components: ExportDraftData['components'] = [];
  componentsMap.forEach((data, id) => {
    components.push({
      id,
      name: (data.get('name') as string) ?? 'Component',
      shapes: (data.get('shapes') as string) ?? '[]',
    });
  });

  const componentInstances: Record<string, string> = {};
  instancesMap.forEach((componentId, shapeId) => {
    componentInstances[shapeId] = componentId;
  });

  return {
    name,
    pages,
    pageOrder: orderedPageIds.length > 0 ? orderedPageIds : [pages[0]!.id],
    variables,
    components,
    componentInstances,
  };
}

export async function exportDraft(id: string): Promise<DraftExport | null> {
  const draft = await db.draft.findUnique({
    where: { id },
    select: { id: true, name: true, yjsState: true },
  });
  if (!draft) return null;

  const ydoc = new Y.Doc();
  if (draft.yjsState) {
    Y.applyUpdate(ydoc, new Uint8Array(draft.yjsState));
  }

  const data = ydocToExportData(draft.name, ydoc);
  ydoc.destroy();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    generator: 'draftila',
    draft: data,
  };
}

function remapIds(data: ExportDraftData): ExportDraftData {
  const idMap = new Map<string, string>();

  const mapId = (oldId: string): string => {
    let newId = idMap.get(oldId);
    if (!newId) {
      newId = nanoid();
      idMap.set(oldId, newId);
    }
    return newId;
  };

  const pages = data.pages.map((page) => {
    const newPageId = mapId(page.id);
    const shapes = page.shapes.map((shape) => {
      const newShape = { ...shape };
      const oldId = newShape['id'] as string;
      newShape['id'] = mapId(oldId);
      if (newShape['parentId'] && typeof newShape['parentId'] === 'string') {
        newShape['parentId'] = idMap.get(newShape['parentId']) ?? mapId(newShape['parentId']);
      }
      return newShape;
    });
    const zOrder = page.zOrder.map((oldId) => idMap.get(oldId) ?? oldId);
    return { ...page, id: newPageId, shapes, zOrder };
  });

  const pageOrder = data.pageOrder.map((oldId) => idMap.get(oldId) ?? oldId);

  const variables = data.variables.map((v) => ({
    ...v,
    id: mapId(v.id),
  }));

  const components = data.components.map((comp) => {
    const newCompId = mapId(comp.id);
    const parsed: unknown[] = JSON.parse(comp.shapes);
    const remapped = parsed.map((s) => {
      const shape = s as Record<string, unknown>;
      const newShape = { ...shape };
      newShape['id'] = mapId(newShape['id'] as string);
      if (newShape['parentId'] && typeof newShape['parentId'] === 'string') {
        newShape['parentId'] = idMap.get(newShape['parentId']) ?? mapId(newShape['parentId']);
      }
      return newShape;
    });
    return { ...comp, id: newCompId, shapes: JSON.stringify(remapped) };
  });

  const componentInstances: Record<string, string> = {};
  for (const [shapeId, compId] of Object.entries(data.componentInstances)) {
    const newShapeId = idMap.get(shapeId) ?? shapeId;
    const newCompId = idMap.get(compId) ?? compId;
    componentInstances[newShapeId] = newCompId;
  }

  return { ...data, pages, pageOrder, variables, components, componentInstances };
}

function buildYDocFromExport(data: ExportDraftData): Uint8Array {
  const ydoc = new Y.Doc();
  const pagesMap = ydoc.getMap('pages');
  const pageOrderArr = ydoc.getArray<string>('pageOrder');
  const variablesMap = ydoc.getMap('variables');
  const componentsMap = ydoc.getMap('components');
  const instancesMap = ydoc.getMap('componentInstances');
  ydoc.getMap('shapes');
  ydoc.getArray('zOrder');
  ydoc.getMap('meta');

  ydoc.transact(() => {
    for (const page of data.pages) {
      const pageYMap = new Y.Map<unknown>();
      pageYMap.set('id', page.id);
      pageYMap.set('name', page.name);
      pageYMap.set('backgroundColor', page.backgroundColor);

      const shapesYMap = new Y.Map<unknown>();
      for (const shape of page.shapes) {
        const shapeYMap = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(shape)) {
          shapeYMap.set(key, valueToYjs(key, value));
        }
        shapesYMap.set(shape['id'] as string, shapeYMap);
      }
      pageYMap.set('shapes', shapesYMap);

      const zOrderYArr = new Y.Array<string>();
      zOrderYArr.push(page.zOrder);
      pageYMap.set('zOrder', zOrderYArr);

      pagesMap.set(page.id, pageYMap);
    }

    pageOrderArr.push(data.pageOrder);

    for (const variable of data.variables) {
      const entry = new Y.Map<unknown>();
      entry.set('name', variable.name);
      entry.set('type', variable.type);
      entry.set('value', variable.value);
      variablesMap.set(variable.id, entry);
    }

    for (const comp of data.components) {
      const entry = new Y.Map<unknown>();
      entry.set('id', comp.id);
      entry.set('name', comp.name);
      entry.set('shapes', comp.shapes);
      componentsMap.set(comp.id, entry);
    }

    for (const [shapeId, compId] of Object.entries(data.componentInstances)) {
      instancesMap.set(shapeId, compId);
    }
  });

  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}

export async function importDraft(data: ExportDraftData, projectId: string) {
  const remapped = remapIds(data);
  const yjsState = buildYDocFromExport(remapped);

  const id = nanoid();
  const timestamp = nextTimestamp();
  await db.draft.create({
    data: {
      id,
      name: remapped.name,
      projectId,
      yjsState: new Uint8Array(yjsState),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  const created = await getById(id);
  if (!created) throw new Error('Failed to create draft');
  return created;
}

export async function exportAllDrafts(projectId: string): Promise<DraftExport[]> {
  const drafts = await db.draft.findMany({
    where: { projectId },
    select: { id: true, name: true, yjsState: true },
    orderBy: { updatedAt: 'desc' },
  });

  return drafts.map((draft) => {
    const ydoc = new Y.Doc();
    if (draft.yjsState) {
      Y.applyUpdate(ydoc, new Uint8Array(draft.yjsState));
    }
    const data = ydocToExportData(draft.name, ydoc);
    ydoc.destroy();
    return {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      generator: 'draftila' as const,
      draft: data,
    };
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'Untitled';
}

export async function buildExportZip(exports: DraftExport[]): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const exported of exports) {
    const baseName = sanitizeFilename(exported.draft.name);
    let filename = `${baseName}.draftila.json`;
    let counter = 2;
    while (usedNames.has(filename)) {
      filename = `${baseName}-${counter}.draftila.json`;
      counter++;
    }
    usedNames.add(filename);
    zip.file(filename, JSON.stringify(exported, null, 2));
  }

  return zip.generateAsync({ type: 'uint8array' });
}
