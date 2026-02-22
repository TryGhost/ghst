import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const FIXTURE_PATH = path.resolve(process.cwd(), 'tests/fixtures/ghost-admin/fixtures.json');

const blockedPatterns: Array<{ name: string; regex: RegExp }> = [
  { name: 'Stripe key', regex: /\b(?:pk|sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/ },
  { name: 'Stripe webhook secret', regex: /\bwhsec_[A-Za-z0-9]+\b/ },
  { name: 'Ghost Admin API key', regex: /\b[0-9a-f]{24}:[0-9a-f]{64}\b/i },
  {
    name: 'Private key block',
    regex: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/,
  },
];

describe('ghost fixtures sanitization', () => {
  test('does not contain secret-like values', () => {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');

    const hits = blockedPatterns.flatMap((entry) => {
      const match = raw.match(entry.regex);
      if (!match) {
        return [];
      }

      return [`${entry.name}: ${match[0]}`];
    });

    expect(
      hits,
      hits.length > 0
        ? `Found secret-like fixture values:\n${hits.join('\n')}`
        : 'No secret-like fixture values found',
    ).toEqual([]);
  });
});
