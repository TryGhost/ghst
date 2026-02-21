import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setOpenUrlForTests, setPromptForTests } from '../src/commands/auth.js';
import { run } from '../src/index.js';
import { ExitCode } from '../src/lib/errors.js';
import { setPromptHandlerForTests } from '../src/lib/prompts.js';
import { fixtureIds } from './helpers/ghost-fixtures.js';
import { installGhostFixtureFetchMock } from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('run + commands', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;
  let previousApiVersion: string | undefined;
  let previousSite: string | undefined;
  let previousOutput: string | undefined;
  let previousContentKey: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;
    previousApiVersion = process.env.GHOST_API_VERSION;
    previousSite = process.env.GHOST_SITE;
    previousOutput = process.env.GHST_OUTPUT;
    previousContentKey = process.env.GHOST_CONTENT_API_KEY;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-run-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    process.env.GHOST_API_VERSION = 'v6.0';
    process.env.GHOST_CONTENT_API_KEY = 'content-key';
    delete process.env.GHOST_SITE;
    delete process.env.GHST_OUTPUT;

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    installGhostFixtureFetchMock({ postConflictOnce: true });
  });

  afterEach(async () => {
    setPromptForTests(null);
    setOpenUrlForTests(null);
    setPromptHandlerForTests(null);
    vi.restoreAllMocks();
    process.chdir(previousCwd);

    if (previousConfigDir === undefined) {
      delete process.env.GHST_CONFIG_DIR;
    } else {
      process.env.GHST_CONFIG_DIR = previousConfigDir;
    }

    if (previousApiVersion === undefined) {
      delete process.env.GHOST_API_VERSION;
    } else {
      process.env.GHOST_API_VERSION = previousApiVersion;
    }

    if (previousSite === undefined) {
      delete process.env.GHOST_SITE;
    } else {
      process.env.GHOST_SITE = previousSite;
    }

    if (previousOutput === undefined) {
      delete process.env.GHST_OUTPUT;
    } else {
      process.env.GHST_OUTPUT = previousOutput;
    }

    if (previousContentKey === undefined) {
      delete process.env.GHOST_CONTENT_API_KEY;
    } else {
      process.env.GHOST_CONTENT_API_KEY = previousContentKey;
    }
  });

  test('handles help and unknown command paths', async () => {
    await expect(run(['node', 'ghst', '--help'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'nope'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('covers auth flows including interactive switch branch', async () => {
    const openedUrls: string[] = [];
    setOpenUrlForTests(async (url) => {
      openedUrls.push(url);
    });

    await expect(run(['node', 'ghst', 'auth', 'status'])).resolves.toBe(ExitCode.SUCCESS);

    process.env.MY_GHOST_KEY = KEY;
    await expect(run(['node', 'ghst', 'auth', 'login', '--json'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
      ]),
    ).resolves.toBe(ExitCode.USAGE_ERROR);

    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--key-env',
        'MY_GHOST_KEY',
        '--site',
        'myblog',
        '--json',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'status', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'switch', 'myblog'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'switch', 'missing'])).resolves.toBe(
      ExitCode.NOT_FOUND,
    );

    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.USAGE_ERROR);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    setPromptForTests(async () => 'myblog');
    await expect(run(['node', 'ghst', 'auth', 'switch'])).resolves.toBe(ExitCode.SUCCESS);

    if (ttyDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
    }

    await expect(run(['node', 'ghst', 'auth', 'link'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'auth', 'token'])).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'auth', 'logout', '--site', 'myblog'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'auth', 'logout'])).resolves.toBe(ExitCode.SUCCESS);

    const promptAnswers = ['', 'https://prompted.ghost.io', KEY];
    setPromptForTests(async () => promptAnswers.shift() ?? '');
    await expect(run(['node', 'ghst', 'auth', 'login'])).resolves.toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['https://prompted.ghost.io/ghost/#/settings/integrations/new']);

    delete process.env.MY_GHOST_KEY;
  });

  test('covers post/page/tag/member/newsletter/tier/offer/label/config/api/completion command flows', async () => {
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--key',
        KEY,
        '--site',
        'myblog',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await fs.writeFile(path.join(workDir, 'post.html'), '<p>Hello</p>', 'utf8');
    await fs.writeFile(path.join(workDir, 'post.lexical.json'), '{"root":{}}', 'utf8');
    await fs.writeFile(path.join(workDir, 'payload.json'), '{"posts":[{"title":"raw"}]}', 'utf8');
    await fs.writeFile(path.join(workDir, 'members.csv'), 'email\nx@example.com\n', 'utf8');

    await expect(run(['node', 'ghst', 'post', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'list', '--limit', 'all'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'post', 'list', '--json', '--jq', '.posts[].title']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'get', '--slug', fixtureIds.postSlug])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'create',
        '--title',
        'Created',
        '--html-file',
        './post.html',
        '--tags',
        'One,Two',
        '--authors',
        'a@example.com',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'post',
        'update',
        fixtureIds.postId,
        '--title',
        'Updated',
        '--featured',
        'true',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'post', 'publish', fixtureIds.postId])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    setPromptHandlerForTests(async () => 'no');
    await expect(run(['node', 'ghst', 'post', 'delete', fixtureIds.postId])).resolves.toBe(
      ExitCode.OPERATION_CANCELLED,
    );
    setPromptHandlerForTests(async () => 'yes');
    await expect(run(['node', 'ghst', 'post', 'delete', fixtureIds.postId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }
    if (stdoutTty) {
      Object.defineProperty(process.stdout, 'isTTY', stdoutTty);
    }

    await expect(run(['node', 'ghst', 'page', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'page', 'get', '--slug', fixtureIds.pageSlug])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'page', 'create', '--title', 'Contact', '--html', '<p>Hi</p>']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'page', 'update', fixtureIds.pageId, '--title', 'Updated Page']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'page', 'delete', fixtureIds.pageId, '--yes'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(run(['node', 'ghst', 'tag', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tag', 'get', '--slug', fixtureIds.tagSlug])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'tag', 'create', '--name', 'My Tag', '--accent-color', '#ffffff']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'tag', 'update', fixtureIds.tagId, '--name', 'Updated Tag']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tag', 'delete', fixtureIds.tagId, '--yes'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(run(['node', 'ghst', 'member', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'member', 'get', fixtureIds.memberId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'member', 'get', '--email', fixtureIds.memberEmail]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run([
        'node',
        'ghst',
        'member',
        'create',
        '--email',
        'newmember@example.com',
        '--name',
        'New Member',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'update', fixtureIds.memberId, '--name', 'Updated Member']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'unsubscribe', '--all']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'delete', '--all']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'import', './members.csv', '--labels', 'Imported']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'export', '--output', './members-export.csv']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'member', 'delete', fixtureIds.memberId, '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'newsletter', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'newsletter', 'get', fixtureIds.newsletterId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'newsletter', 'create', '--name', 'Weekly'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run([
        'node',
        'ghst',
        'newsletter',
        'update',
        fixtureIds.newsletterId,
        '--name',
        'Updated Weekly',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'tier', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'tier', 'get', fixtureIds.tierId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'tier', 'create', '--name', 'Premium', '--monthly-price', '500']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'tier', 'update', fixtureIds.tierId, '--name', 'Premium Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'offer', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'offer', 'get', fixtureIds.offerId])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'offer', 'create', '--name', 'Sale', '--code', 'sale']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'offer', 'update', fixtureIds.offerId, '--name', 'Sale Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'label', 'list'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'label', 'get', '--slug', fixtureIds.labelSlug]),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'label', 'create', '--name', 'VIP'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(
      run(['node', 'ghst', 'label', 'update', fixtureIds.labelId, '--name', 'VIP Updated']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'label', 'delete', fixtureIds.labelId, '--yes']),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'config', 'path'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'config', 'show'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'config', 'list', '--json'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'config', 'set', 'defaults.limit', '25'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
    await expect(run(['node', 'ghst', 'config', 'get', 'defaults.limit'])).resolves.toBe(
      ExitCode.SUCCESS,
    );

    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
    await expect(run(['node', 'ghst', 'api', '/site/'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/settings/', '--query', 'limit=1', 'status=published']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--method', 'POST', '--input', './payload.json']),
    ).resolves.toBe(ExitCode.SUCCESS);
    await expect(
      run(['node', 'ghst', 'api', '/posts/', '--content-api', '--method', 'GET']),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'completion'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'bash'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'zsh'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'fish'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'powershell'])).resolves.toBe(ExitCode.SUCCESS);
    await expect(run(['node', 'ghst', 'completion', 'bad-shell'])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
  });

  test('uses env output mode for json errors', async () => {
    process.env.GHST_OUTPUT = 'json';
    await expect(run(['node', 'ghst', 'api'])).resolves.toBe(ExitCode.USAGE_ERROR);
  });

  test('covers phase2 validation and non-interactive branches', async () => {
    await expect(
      run([
        'node',
        'ghst',
        'auth',
        'login',
        '--non-interactive',
        '--url',
        'https://myblog.ghost.io',
        '--key',
        KEY,
        '--site',
        'myblog',
      ]),
    ).resolves.toBe(ExitCode.SUCCESS);

    await expect(run(['node', 'ghst', 'member', 'get'])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'add-label', '--all']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'member', 'bulk', '--action', 'delete', '--all', '--filter', 'id:1']),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'newsletter', 'update', fixtureIds.newsletterId]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(run(['node', 'ghst', 'tier', 'update', fixtureIds.tierId])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'offer', 'update', fixtureIds.offerId])).resolves.toBe(
      ExitCode.VALIDATION_ERROR,
    );
    await expect(run(['node', 'ghst', 'label', 'get'])).resolves.toBe(ExitCode.VALIDATION_ERROR);
    await expect(
      run(['node', 'ghst', 'label', 'get', fixtureIds.labelId, '--slug', fixtureIds.labelSlug]),
    ).resolves.toBe(ExitCode.VALIDATION_ERROR);

    const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(run(['node', 'ghst', 'member', 'delete', fixtureIds.memberId])).resolves.toBe(
      ExitCode.USAGE_ERROR,
    );
    if (stdinTty) {
      Object.defineProperty(process.stdin, 'isTTY', stdinTty);
    }

    await expect(run(['node', 'ghst', 'member', 'export', '--json'])).resolves.toBe(
      ExitCode.SUCCESS,
    );
  });
});
