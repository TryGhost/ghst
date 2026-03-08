import fs from 'node:fs';
import path from 'node:path';
import {
  ghostFixtureContractEntries,
  ghostFixtureContractPaths,
} from '../tests/helpers/ghost-fixture-contract.js';

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/ghost-admin');

const blockedPatterns: Array<{ name: string; regex: RegExp }> = [
  { name: 'Stripe key', regex: /\b(?:pk|sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/ },
  { name: 'Stripe webhook secret', regex: /\bwhsec_[A-Za-z0-9]+\b/ },
  { name: 'Ghost staff access token', regex: /\b[0-9a-f]{24}:[0-9a-f]{64}\b/i },
  {
    name: 'Private key block',
    regex: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/,
  },
];

function fail(message: string): never {
  throw new Error(message);
}

function listJsonFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(path.relative(FIXTURE_DIR, fullPath).replaceAll(path.sep, '/'));
    }
  }

  return files.sort();
}

function validateFileSet(): void {
  const actualFiles = listJsonFiles(FIXTURE_DIR);
  const expectedFiles = [...ghostFixtureContractPaths];

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
    const unexpected = actualFiles.filter((file) => !expectedFiles.includes(file));
    const details = [
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : null,
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    fail(`Fixture manifest does not match committed JSON files.\n${details}`);
  }
}

function validateJsonAndSecrets(): void {
  for (const relativePath of ghostFixtureContractPaths) {
    const fullPath = path.join(FIXTURE_DIR, relativePath);
    const raw = fs.readFileSync(fullPath, 'utf8');

    try {
      JSON.parse(raw);
    } catch (error) {
      fail(`Invalid JSON in ${relativePath}: ${(error as Error).message}`);
    }

    for (const pattern of blockedPatterns) {
      const match = raw.match(pattern.regex);
      if (match) {
        fail(`${relativePath} contains secret-like fixture data (${pattern.name}).`);
      }
    }
  }
}

function validateContract(): void {
  for (const [name, contract] of ghostFixtureContractEntries) {
    try {
      const entry = contract as {
        usedBy: readonly string[];
        getFixture: () => unknown;
        validate: (value: unknown) => void;
      };
      entry.validate(entry.getFixture());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(
        `Fixture contract ${name} failed validation.\nUsed by: ${contract.usedBy.join(', ')}\n${message}`,
      );
    }
  }
}

function main(): void {
  validateFileSet();
  validateJsonAndSecrets();
  validateContract();
  console.log(`Verified ${ghostFixtureContractPaths.length} Ghost fixture files offline.`);
}

main();
