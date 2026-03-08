import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GhostClient } from '../src/lib/client.js';

interface CaptureOptions {
  url?: string;
  staffToken?: string;
  outDir?: string;
}

function parseArgs(argv: string[]): CaptureOptions {
  const options: CaptureOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if ((current === '--url' || current === '-u') && next) {
      options.url = next;
      index += 1;
      continue;
    }

    if ((current === '--staff-token' || current === '-t') && next) {
      options.staffToken = next;
      index += 1;
      continue;
    }

    if ((current === '--out-dir' || current === '-o') && next) {
      options.outDir = next;
      index += 1;
    }
  }

  return options;
}

function isAllowedCaptureHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.test')
  );
}

async function writeSnapshot(outDir: string, relativePath: string, value: unknown): Promise<void> {
  const filePath = path.join(outDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const url = options.url ?? process.env.GHOST_URL;
  const staffToken = options.staffToken ?? process.env.GHOST_STAFF_ACCESS_TOKEN;

  if (!url || !staffToken) {
    throw new Error(
      'fixtures:ghost:capture requires --url/--staff-token or GHOST_URL/GHOST_STAFF_ACCESS_TOKEN.',
    );
  }

  const hostname = new URL(url).hostname;
  if (!isAllowedCaptureHost(hostname)) {
    throw new Error(
      `fixtures:ghost:capture only supports disposable local Ghost instances. Refusing host "${hostname}".`,
    );
  }

  const outDir =
    options.outDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-ghost-capture-')));

  const client = new GhostClient({ url, staffToken });

  const captures: Array<{ path: string; payload: unknown }> = [
    { path: 'api/admin/site.json', payload: await client.siteInfo() },
    { path: 'api/admin/settings.json', payload: await client.rawRequest('/settings/') },
    { path: 'posts/browse.json', payload: await client.posts.browse({ limit: 5 }) },
    { path: 'pages/browse.json', payload: await client.pages.browse({ limit: 5 }) },
    { path: 'tags/browse.json', payload: await client.tags.browse({ limit: 5 }) },
    { path: 'members/browse.json', payload: await client.members.browse({ limit: 5 }) },
    { path: 'newsletters/browse.json', payload: await client.newsletters.browse({ limit: 5 }) },
    { path: 'tiers/browse.json', payload: await client.tiers.browse({ limit: 5 }) },
    { path: 'offers/browse.json', payload: await client.offers.browse({ limit: 5 }) },
    { path: 'labels/browse.json', payload: await client.labels.browse({ limit: 5 }) },
    {
      path: 'comments/list.json',
      payload: await client.comments.browseAll({ limit: 5, order: 'created_at desc' }),
    },
    { path: 'users/browse.json', payload: await client.users.browse({ limit: 5 }) },
    { path: 'themes/browse.json', payload: await client.themes.browse() },
  ];

  for (const capture of captures) {
    await writeSnapshot(outDir, capture.path, capture.payload);
  }

  console.log(`Wrote lightweight local Ghost snapshot to ${outDir}`);
  console.log('Review the snapshot manually. This command never rewrites committed fixtures.');
}

await main();
