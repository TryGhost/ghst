import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';

const thinMocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  listSettings: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getSiteInfo: vi.fn(),
  listUsers: vi.fn(),
  getUser: vi.fn(),
  getCurrentUser: vi.fn(),
  printJson: vi.fn(),
  printSettingHuman: vi.fn(),
  printSettingListHuman: vi.fn(),
  printSiteHuman: vi.fn(),
  printUserHuman: vi.fn(),
  printUserListHuman: vi.fn(),
}));

vi.mock('../src/lib/images.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/images.js')>('../src/lib/images.js');
  return {
    ...actual,
    uploadImage: (...args: unknown[]) => thinMocks.uploadImage(...args),
  };
});

vi.mock('../src/lib/settings.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/settings.js')>('../src/lib/settings.js');
  return {
    ...actual,
    listSettings: (...args: unknown[]) => thinMocks.listSettings(...args),
    getSetting: (...args: unknown[]) => thinMocks.getSetting(...args),
    setSetting: (...args: unknown[]) => thinMocks.setSetting(...args),
  };
});

vi.mock('../src/lib/site.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/site.js')>('../src/lib/site.js');
  return {
    ...actual,
    getSiteInfo: (...args: unknown[]) => thinMocks.getSiteInfo(...args),
  };
});

vi.mock('../src/lib/users.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/users.js')>('../src/lib/users.js');
  return {
    ...actual,
    listUsers: (...args: unknown[]) => thinMocks.listUsers(...args),
    getUser: (...args: unknown[]) => thinMocks.getUser(...args),
    getCurrentUser: (...args: unknown[]) => thinMocks.getCurrentUser(...args),
  };
});

vi.mock('../src/lib/output.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/output.js')>('../src/lib/output.js');
  return {
    ...actual,
    printJson: (...args: unknown[]) => thinMocks.printJson(...args),
    printSettingHuman: (...args: unknown[]) => thinMocks.printSettingHuman(...args),
    printSettingListHuman: (...args: unknown[]) => thinMocks.printSettingListHuman(...args),
    printSiteHuman: (...args: unknown[]) => thinMocks.printSiteHuman(...args),
    printUserHuman: (...args: unknown[]) => thinMocks.printUserHuman(...args),
    printUserListHuman: (...args: unknown[]) => thinMocks.printUserListHuman(...args),
  };
});

import { run } from '../src/index.js';

describe('thin command coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    thinMocks.uploadImage.mockImplementation(async (_global, payload: { filePath: string }) => ({
      url: `https://cdn.example/${payload.filePath}`,
    }));
    thinMocks.listSettings.mockResolvedValue({ settings: [{ key: 'title', value: 'Demo' }] });
    thinMocks.getSetting.mockResolvedValue({ key: 'title', value: 'Demo' });
    thinMocks.setSetting.mockImplementation(async (_global, key: string, value: unknown) => ({
      key,
      value,
    }));
    thinMocks.getSiteInfo.mockResolvedValue({ site: { title: 'Demo' } });
    thinMocks.listUsers.mockResolvedValue({ users: [{ id: 'user-1' }] });
    thinMocks.getUser.mockResolvedValue({ users: [{ id: 'user-1' }] });
    thinMocks.getCurrentUser.mockResolvedValue({ users: [{ id: 'me' }] });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('covers image json and validation paths', async () => {
    await expect(
      run([
        'node',
        'ghst',
        'image',
        'upload',
        'photo.jpg',
        'cover.png',
        '--purpose',
        'profile_image',
        '--ref',
        'hero',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    expect(thinMocks.uploadImage).toHaveBeenCalledTimes(2);
    expect(thinMocks.printJson).toHaveBeenCalledWith(
      {
        images: [
          { url: 'https://cdn.example/photo.jpg' },
          { url: 'https://cdn.example/cover.png' },
        ],
      },
      undefined,
    );

    await expect(run(['node', 'ghst', 'image', 'upload', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('covers setting json, coercion, and validation paths', async () => {
    await expect(run(['node', 'ghst', 'setting', 'list', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'get', 'title', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', 'false', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', 'title', '[1,2]', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    expect(thinMocks.printJson).toHaveBeenCalledTimes(4);
    expect(thinMocks.setSetting).toHaveBeenNthCalledWith(1, expect.any(Object), 'title', false);
    expect(thinMocks.setSetting).toHaveBeenNthCalledWith(2, expect.any(Object), 'title', [1, 2]);

    await expect(run(['node', 'ghst', 'setting', 'get', ''])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'setting', 'set', '', 'value'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });

  test('covers site info json output', async () => {
    await expect(run(['node', 'ghst', 'site', 'info', '--json'])).resolves.toBe(ExitCode.SUCCESS);

    expect(thinMocks.printJson).toHaveBeenCalledWith({ site: { title: 'Demo' } }, undefined);
    expect(thinMocks.printSiteHuman).not.toHaveBeenCalled();
  });

  test('covers user json outputs and validation path', async () => {
    await expect(run(['node', 'ghst', 'user', 'list', '--limit', 'all', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'user', 'get', 'user-1', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'user', 'me', '--json'])).resolves.toBe(ExitCode.SUCCESS);

    expect(thinMocks.printJson).toHaveBeenCalledTimes(3);
    expect(thinMocks.listUsers).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ limit: undefined }),
      true,
    );

    await expect(run(['node', 'ghst', 'user', 'list', '--page', '0'])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
  });
});
