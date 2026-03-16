import type { ImportAdapter, ExportAdapter, ImportData } from './types';

const importAdapters: ImportAdapter[] = [];
const exportAdapters: ExportAdapter[] = [];

export function registerImportAdapter(adapter: ImportAdapter): void {
  const existing = importAdapters.findIndex((a) => a.id === adapter.id);
  if (existing !== -1) {
    importAdapters[existing] = adapter;
  } else {
    importAdapters.push(adapter);
  }
}

export function registerExportAdapter(adapter: ExportAdapter): void {
  const existing = exportAdapters.findIndex((a) => a.id === adapter.id);
  if (existing !== -1) {
    exportAdapters[existing] = adapter;
  } else {
    exportAdapters.push(adapter);
  }
}

export function unregisterImportAdapter(id: string): void {
  const index = importAdapters.findIndex((a) => a.id === id);
  if (index !== -1) importAdapters.splice(index, 1);
}

export function unregisterExportAdapter(id: string): void {
  const index = exportAdapters.findIndex((a) => a.id === id);
  if (index !== -1) exportAdapters.splice(index, 1);
}

export function getImportAdapters(): readonly ImportAdapter[] {
  return importAdapters;
}

export function getExportAdapters(): readonly ExportAdapter[] {
  return exportAdapters;
}

export function getImportAdapterById(id: string): ImportAdapter | undefined {
  return importAdapters.find((a) => a.id === id);
}

export function getExportAdapterById(id: string): ExportAdapter | undefined {
  return exportAdapters.find((a) => a.id === id);
}

export function getImportAdaptersByPlatform(platform: string): ImportAdapter[] {
  return importAdapters.filter((a) => a.platform === platform);
}

export function getExportAdaptersByPlatform(platform: string): ExportAdapter[] {
  return exportAdapters.filter((a) => a.platform === platform);
}

export function detectImportAdapter(data: ImportData): ImportAdapter | undefined {
  return importAdapters.find((a) => a.canImport(data));
}

export function clearAdapters(): void {
  importAdapters.length = 0;
  exportAdapters.length = 0;
}
