import { describe, expect, test } from 'vitest';
import {
  PageCreateInputSchema,
  PageGetInputSchema,
  PageListInputSchema,
  PageUpdateInputSchema,
} from '../src/schemas/page.js';
import {
  PostCreateInputSchema,
  PostGetInputSchema,
  PostListInputSchema,
  PostUpdateInputSchema,
} from '../src/schemas/post.js';
import {
  TagCreateInputSchema,
  TagGetInputSchema,
  TagListInputSchema,
  TagUpdateInputSchema,
} from '../src/schemas/tag.js';

describe('post schemas', () => {
  test('validates list/get/create/update', () => {
    expect(PostListInputSchema.parse({ limit: 'all', status: 'draft' }).limit).toBe('all');
    expect(PostGetInputSchema.parse({ slug: 'welcome' }).slug).toBe('welcome');

    expect(
      PostCreateInputSchema.parse({
        title: 'hello',
        status: 'draft',
        html: '<p>hi</p>',
      }).title,
    ).toBe('hello');

    expect(
      PostUpdateInputSchema.parse({
        id: 'id1',
        title: 'new',
      }).title,
    ).toBe('new');

    expect(() =>
      PostCreateInputSchema.parse({ title: 'bad', html: 'x', lexicalFile: 'y' }),
    ).toThrow();
    expect(() => PostUpdateInputSchema.parse({ id: 'id1' })).toThrow();
  });
});

describe('page schemas', () => {
  test('validates list/get/create/update', () => {
    expect(PageListInputSchema.parse({ limit: 5 }).limit).toBe(5);
    expect(PageGetInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(PageCreateInputSchema.parse({ title: 'About', status: 'draft' }).title).toBe('About');
    expect(PageUpdateInputSchema.parse({ id: 'id1', title: 'New' }).title).toBe('New');

    expect(() => PageUpdateInputSchema.parse({ slug: 'about' })).toThrow();
  });
});

describe('tag schemas', () => {
  test('validates list/get/create/update', () => {
    expect(TagListInputSchema.parse({ limit: 'all' }).limit).toBe('all');
    expect(TagGetInputSchema.parse({ slug: 'news' }).slug).toBe('news');
    expect(TagCreateInputSchema.parse({ name: 'News', accentColor: '#ffffff' }).name).toBe('News');
    expect(TagUpdateInputSchema.parse({ id: 'id1', name: 'Updated' }).name).toBe('Updated');

    expect(() => TagCreateInputSchema.parse({ name: 'x', accentColor: 'red' })).toThrow();
    expect(() => TagUpdateInputSchema.parse({ id: 'id1' })).toThrow();
  });
});
