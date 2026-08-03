/**
 * Preloaded (not imported per-file) because `editor-store.ts` reads localStorage
 * at module scope, and the session tests import it transitively — the shim has to
 * exist before any module initialises.
 *
 * No DOM shim is needed: everything under test takes its DOM reads by injection.
 */
export class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
