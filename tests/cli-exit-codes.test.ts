import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe('CLI exit codes', () => {
  test('unknown command exits with usage code 2', () => {
    const result = runCli(['nope']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command 'nope'");
  });

  test('api without endpoint exits with usage code 2', () => {
    const result = runCli(['api']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Missing required argument: endpointPath');
  });

  test('auth switch without site in non-interactive mode exits with usage code 2', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ghst-test-'));
    const configDir = path.join(tempRoot, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify(
        {
          version: 1,
          active: 'myblog',
          sites: {
            myblog: {
              url: 'https://myblog.ghost.io',
              adminApiKey: 'abc123:0011223344556677',
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const result = runCli(['auth', 'switch'], {
      GHST_CONFIG_DIR: configDir,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Missing site argument');
  });
});
