import { describe, expect, test } from 'bun:test';
import { nanoid } from '../../src/common/lib/utils';

describe('nanoid', () => {
  test('generates a string of default length 21', () => {
    const id = nanoid();
    expect(id).toHaveLength(21);
  });

  test('generates a string of custom length', () => {
    const id = nanoid(10);
    expect(id).toHaveLength(10);
  });

  test('only contains alphanumeric characters', () => {
    const id = nanoid(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  test('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()));
    expect(ids.size).toBe(100);
  });
});
