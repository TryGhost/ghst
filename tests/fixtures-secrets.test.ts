import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ghostFixtureContractPaths } from './helpers/ghost-fixture-contract.js';

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/ghost-admin');

const blockedPatterns: Array<{ name: string; regex: RegExp }> = [
  { name: 'Stripe key', regex: /\b(?:pk|sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/ },
  { name: 'Stripe webhook secret', regex: /\bwhsec_[A-Za-z0-9]+\b/ },
  { name: 'Ghost staff access token', regex: /\b[0-9a-f]{24}:[0-9a-f]{64}\b/i },
  {
    name: 'Sentry DSN',
    regex: /https:\/\/[A-Za-z0-9]+@o\d+\.ingest\.[A-Za-z0-9.-]+\.sentry\.io\/\d+/,
  },
  {
    name: 'Gravatar hash',
    regex: /https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?s=\d+&r=[a-z]&d=[a-z]+/i,
  },
  {
    name: 'Private key block',
    regex: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/,
  },
];

describe('ghost fixtures sanitization', () => {
  test('does not contain secret-like values', () => {
    const findings = ghostFixtureContractPaths.flatMap((relativePath) => {
      const raw = fs.readFileSync(path.join(FIXTURE_DIR, relativePath), 'utf8');

      return blockedPatterns.flatMap((entry) => {
        const match = raw.match(entry.regex);
        if (!match) {
          return [];
        }

        return [`${relativePath} ${entry.name}: ${match[0]}`];
      });
    });

    expect(
      findings,
      findings.length > 0
        ? `Found secret-like fixture values:\n${findings.join('\n')}`
        : 'No secret-like fixture values found',
    ).toEqual([]);
  });
});
