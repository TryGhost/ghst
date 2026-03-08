import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';

const configMocks = vi.hoisted(() => ({
  getUserConfigPath: vi.fn(),
  readUserConfig: vi.fn(),
  writeUserConfig: vi.fn(),
}));

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

describe('config command coverage', () => {
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
          staffAccessToken: 'abc123:00112233445566778899aabbccddeeff',
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

  test('covers show, list, and get redaction behavior', async () => {
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
    expect(output).not.toContain('top-secret');
    expect(output).not.toContain('nested-secret');
  });

  test('covers config get missing-path error', async () => {
    await expect(run(['node', 'ghst', 'config', 'get', 'sites.prod.missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );
  });

  test('covers config set success branches', async () => {
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

  test('covers config set validation and usage errors', async () => {
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
