import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';

const configMocks = vi.hoisted(() => ({
  getUserConfigPath: vi.fn(),
  readUserConfig: vi.fn(),
  writeUserConfig: vi.fn(),
}));
const STAFF_ACCESS_TOKEN = 'abc123:00112233445566778899aabbccddeeff';

vi.mock('../src/lib/config.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/config.js')>('../src/lib/config.js');
  return {
    ...actual,
    getUserConfigPath: (...args: unknown[]) => configMocks.getUserConfigPath(...args),
    readUserConfig: (...args: unknown[]) => configMocks.readUserConfig(...args),
    writeUserConfig: (...args: unknown[]) => configMocks.writeUserConfig(...args),
  };
});

import { run } from '../src/index.js';

describe('config command contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    configMocks.getUserConfigPath.mockReturnValue('/tmp/ghst/config.json');
    configMocks.readUserConfig.mockResolvedValue({
      version: 2,
      active: 'prod',
      defaults: {
        limit: 10,
        format: 'table',
        editor: 'lexical',
      },
      sites: {
        prod: {
          url: 'https://prod.example.com',
          staffAccessToken: STAFF_ACCESS_TOKEN,
          apiVersion: 'v6.0',
          addedAt: '2026-03-01T00:00:00.000Z',
        },
      },
      profiles: [
        {
          apiToken: 'nested-secret',
        },
      ],
    });
    configMocks.writeUserConfig.mockResolvedValue(undefined);

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('redacts sensitive values in show, list, and json get output by default', async () => {
    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'config', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'config', 'get', 'sites.prod.staffAccessToken', '--json']),
    ).resolves.toBe(ExitCode.SUCCESS);

    const output = vi
      .mocked(console.log)
      .mock.calls.map((call) => String(call[0]))
      .join('\n');
    expect(output).toContain('<redacted>');
    expect(output).not.toContain(STAFF_ACCESS_TOKEN);
    expect(output).not.toContain('nested-secret');
  });

  test('returns not found when a requested config path does not exist', async () => {
    await expect(run(['node', 'ghst', 'config', 'get', 'sites.prod.missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );
  });

  test('writes validated config changes for supported mutable paths', async () => {
    await expect(run(['node', 'ghst', 'config', 'set', 'active', 'prod'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'config', 'set', 'defaults.format', 'json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(configMocks.writeUserConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ active: 'prod' }),
    );
    expect(configMocks.writeUserConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        defaults: expect.objectContaining({ format: 'json' }),
      }),
    );
  });

  test('rejects invalid values, missing aliases, and unsupported paths', async () => {
    await expect(run(['node', 'ghst', 'config', 'set', 'defaults.limit', '0'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'config', 'set', 'active', 'missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );
    await expect(run(['node', 'ghst', 'config', 'set', 'unsupported.path', 'value'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
  });
});
