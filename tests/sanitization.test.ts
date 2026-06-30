import { describe, expect, test } from 'vitest';
import { setByPath } from '../src/commands/config.js';
import { emailFilter } from '../src/lib/members.js';
import { stripHtml } from '../src/lib/output.js';
import { escapeNqlValue } from '../src/mcp/tools/core.js';

describe('emailFilter NQL escaping', () => {
  test('escapes single quotes', () => {
    expect(emailFilter("o'brien@example.com")).toBe("email:'o\\'brien@example.com'");
  });

  test('escapes backslashes before quotes so the quote cannot break out', () => {
    expect(emailFilter("a\\'b")).toBe("email:'a\\\\\\'b'");
  });

  test('escapes a lone backslash', () => {
    expect(emailFilter('a\\b')).toBe("email:'a\\\\b'");
  });
});

describe('escapeNqlValue', () => {
  test('escapes single quotes', () => {
    expect(escapeNqlValue("it's")).toBe("it\\'s");
  });

  test('escapes backslashes before quotes so the quote cannot break out', () => {
    expect(escapeNqlValue("\\'")).toBe("\\\\\\'");
  });
});

describe('stripHtml entity decoding', () => {
  test('decodes basic entities', () => {
    expect(stripHtml('a &amp; b')).toBe('a & b');
    expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
  });

  test('does not double-unescape an encoded ampersand', () => {
    expect(stripHtml('&amp;lt;')).toBe('&lt;');
    expect(stripHtml('&amp;amp;')).toBe('&amp;');
  });
});

describe('setByPath prototype-pollution guard', () => {
  test('assigns nested values', () => {
    const target: Record<string, unknown> = {};
    setByPath(target, 'a.b.c', 1);
    expect(target).toEqual({ a: { b: { c: 1 } } });
  });

  test('rejects __proto__ in the path', () => {
    const target: Record<string, unknown> = {};
    expect(() => setByPath(target, '__proto__.polluted', 'x')).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('rejects constructor and prototype segments', () => {
    expect(() => setByPath({}, 'constructor.x', 1)).toThrow();
    expect(() => setByPath({}, 'a.prototype', 1)).toThrow();
  });
});
