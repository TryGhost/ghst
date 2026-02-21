import { describe, expect, test } from 'vitest';
import { PostGetInputSchema, PostListInputSchema } from '../src/schemas/post.js';

describe('post schemas', () => {
  test('validates list inputs', () => {
    const parsed = PostListInputSchema.parse({
      limit: 10,
      page: 2,
      filter: 'status:draft',
      status: 'draft',
      include: 'tags',
      fields: 'title,slug',
      order: 'updated_at desc',
    });

    expect(parsed.limit).toBe(10);
    expect(() => PostListInputSchema.parse({ limit: 0 })).toThrowError();
  });

  test('validates get inputs', () => {
    expect(PostGetInputSchema.parse({ id: 'abc' }).id).toBe('abc');
    expect(PostGetInputSchema.parse({ slug: 'welcome' }).slug).toBe('welcome');
    expect(() => PostGetInputSchema.parse({ id: '' })).toThrowError();
  });
});
