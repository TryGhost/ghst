import { describe, expect, test } from 'vitest';
import { normalizeGhostApiPath } from '../src/lib/api-path.js';

describe('normalizeGhostApiPath', () => {
  test('accepts resource-relative and canonical api-root paths', () => {
    expect(normalizeGhostApiPath('posts', 'admin')).toBe('/posts/');
    expect(normalizeGhostApiPath('/posts/', 'admin')).toBe('/posts/');
    expect(normalizeGhostApiPath('/ghost/api/admin/posts/', 'admin')).toBe('/posts/');
    expect(normalizeGhostApiPath('/ghost/api/content/posts/', 'content')).toBe('/posts/');
    expect(normalizeGhostApiPath('/ghost/api/admin/', 'admin')).toBe('/');
  });

  test('rejects paths outside the selected api root', () => {
    expect(() => normalizeGhostApiPath('/ghost/api/content/posts/', 'admin')).toThrow(
      'selected Ghost API root',
    );
  });

  test('rejects escape-capable paths and unsafe URL forms', () => {
    expect(() => normalizeGhostApiPath('../../../members/', 'admin')).toThrow('dot segments');
    expect(() => normalizeGhostApiPath('/%2E%2E/members/', 'admin')).toThrow('dot segments');
    expect(() => normalizeGhostApiPath('/%2E%2E%2Fmembers/', 'admin')).toThrow(
      'encoded path separators',
    );
    expect(() => normalizeGhostApiPath('/%2E%2E%5Cmembers/', 'admin')).toThrow(
      'encoded path separators',
    );
    expect(() => normalizeGhostApiPath('https://example.com/posts/', 'admin')).toThrow(
      'relative to the selected Ghost API root',
    );
    expect(() => normalizeGhostApiPath('//example.com/posts/', 'admin')).toThrow(
      'relative to the selected Ghost API root',
    );
    expect(() => normalizeGhostApiPath('/posts/#draft', 'admin')).toThrow('fragments');
    expect(() => normalizeGhostApiPath('/posts/?limit=1', 'admin')).toThrow('--query');
    expect(() => normalizeGhostApiPath('\\posts\\', 'admin')).toThrow('backslashes');
  });
});
