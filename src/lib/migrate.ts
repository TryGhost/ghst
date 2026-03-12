import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { slugify } from '@tryghost/string';
import { parse as parseCsv } from 'csv-parse/sync';
import MarkdownIt from 'markdown-it';
import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { assertFileDoesNotExist } from './file-guards.js';
import type { GlobalOptions } from './types.js';

interface CsvRow {
  title: string;
  html?: string;
  markdown?: string;
  slug?: string;
  status?: 'draft' | 'published' | 'scheduled';
  published_at?: string;
  tags?: string;
  authors?: string;
  excerpt?: string;
  feature_image?: string;
}

const ALLOWED_CSV_HEADERS = new Set([
  'title',
  'html',
  'markdown',
  'slug',
  'status',
  'published_at',
  'tags',
  'authors',
  'excerpt',
  'feature_image',
]);

const VALID_STATUSES = new Set(['draft', 'published', 'scheduled']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const markdownRenderer = new MarkdownIt({ html: true, linkify: true, breaks: true });

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

function ensureObjectRecord(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GhstError(`Migration source '${source}' returned an invalid payload.`, {
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  }

  return value as Record<string, unknown>;
}

function splitList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createTagRelation(name: string): Record<string, unknown> {
  const normalizedName = name.trim();
  const normalizedSlug = slugify(normalizedName);

  return {
    url: `csv://tag/${normalizedSlug}`,
    data: {
      name: normalizedName,
      slug: normalizedSlug,
    },
  };
}

function createAuthorRelation(value: string): Record<string, unknown> {
  const normalized = value.trim();

  if (EMAIL_PATTERN.test(normalized)) {
    const localPart = normalized.split('@')[0] ?? normalized;
    const normalizedSlug = slugify(localPart);

    return {
      url: `csv://author/${normalizedSlug}`,
      data: {
        name: localPart,
        slug: normalizedSlug,
        email: normalized,
      },
    };
  }

  const normalizedSlug = slugify(normalized);
  return {
    url: `csv://author/${normalizedSlug}`,
    data: {
      name: normalized,
      slug: normalizedSlug,
    },
  };
}

function parseCsvRows(raw: string): CsvRow[] {
  let matrix: string[][];
  try {
    matrix = parseCsv(raw, {
      bom: true,
      skip_empty_lines: true,
      relax_quotes: false,
    }) as string[][];
  } catch (error) {
    throw new GhstError(`CSV parsing failed: ${(error as Error).message}`, {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  if (matrix.length < 2) {
    throw new GhstError('CSV must include headers and at least one row.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const headers = (matrix[0] ?? []).map((header) => String(header ?? '').trim());
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw new GhstError('CSV headers must be non-empty values.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateHeaders));
    throw new GhstError(`Duplicate CSV headers are not allowed: ${uniqueDuplicates.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const unknownHeaders = headers.filter((header) => !ALLOWED_CSV_HEADERS.has(header));
  if (unknownHeaders.length > 0) {
    const allowed = Array.from(ALLOWED_CSV_HEADERS).join(', ');
    throw new GhstError(
      `Unsupported CSV headers: ${unknownHeaders.join(', ')}. Allowed headers: ${allowed}`,
      {
        code: 'VALIDATION_ERROR',
        exitCode: ExitCode.VALIDATION_ERROR,
      },
    );
  }

  if (!headers.includes('title')) {
    throw new GhstError("CSV must include a 'title' header.", {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const hasHtmlHeader = headers.includes('html');
  const hasMarkdownHeader = headers.includes('markdown');
  if (!hasHtmlHeader && !hasMarkdownHeader) {
    throw new GhstError("CSV must include exactly one content header: 'html' or 'markdown'.", {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  if (hasHtmlHeader && hasMarkdownHeader) {
    throw new GhstError("CSV cannot include both 'html' and 'markdown' headers.", {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const rows: CsvRow[] = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? [];
    if (values.length !== headers.length) {
      throw new GhstError(
        `CSV row ${rowIndex + 1} has ${values.length} column(s), expected ${headers.length}.`,
        {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        },
      );
    }

    const record = Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] ?? '')]),
    ) as Record<string, string>;

    const title = (record.title ?? '').trim();
    if (!title) {
      throw new GhstError(`CSV row ${rowIndex + 1} is missing required title.`, {
        code: 'VALIDATION_ERROR',
        exitCode: ExitCode.VALIDATION_ERROR,
      });
    }

    const htmlRaw = hasHtmlHeader ? (record.html ?? '') : undefined;
    const markdownRaw = hasMarkdownHeader ? (record.markdown ?? '') : undefined;

    if (hasHtmlHeader && !(htmlRaw ?? '').trim()) {
      throw new GhstError(`CSV row ${rowIndex + 1} must include html content.`, {
        code: 'VALIDATION_ERROR',
        exitCode: ExitCode.VALIDATION_ERROR,
      });
    }

    if (hasMarkdownHeader && !(markdownRaw ?? '').trim()) {
      throw new GhstError(`CSV row ${rowIndex + 1} must include markdown content.`, {
        code: 'VALIDATION_ERROR',
        exitCode: ExitCode.VALIDATION_ERROR,
      });
    }

    const statusValue = (record.status ?? '').trim().toLowerCase();
    if (statusValue && !VALID_STATUSES.has(statusValue)) {
      throw new GhstError(
        `CSV row ${rowIndex + 1} has invalid status '${statusValue}'. Expected draft, published, or scheduled.`,
        {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        },
      );
    }

    rows.push({
      title,
      html: htmlRaw,
      markdown: markdownRaw,
      slug: (record.slug ?? '').trim() || undefined,
      status: (statusValue as CsvRow['status']) || undefined,
      published_at: (record.published_at ?? '').trim() || undefined,
      tags: (record.tags ?? '').trim() || undefined,
      authors: (record.authors ?? '').trim() || undefined,
      excerpt: (record.excerpt ?? '').trim() || undefined,
      feature_image: (record.feature_image ?? '').trim() || undefined,
    });
  }

  return rows;
}

async function uploadDbImportFile(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const bytes = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('importfile', new Blob([bytes]), path.basename(filePath));
  return client.db.import(formData);
}

async function buildGhostDbImportFile(input: Record<string, unknown>): Promise<string> {
  const mgJsonModule = (await loadMigrateModule('@tryghost/mg-json')) as {
    toGhostJSON?: (
      input: Record<string, unknown>,
      options?: Record<string, unknown>,
      ctx?: unknown,
    ) => Promise<Record<string, unknown>>;
    default?: {
      toGhostJSON?: (
        input: Record<string, unknown>,
        options?: Record<string, unknown>,
        ctx?: unknown,
      ) => Promise<Record<string, unknown>>;
    };
  };

  const toGhostJSON = mgJsonModule.toGhostJSON ?? mgJsonModule.default?.toGhostJSON;
  if (!toGhostJSON) {
    throw new GhstError('Ghost JSON converter is unavailable in @tryghost/mg-json.', {
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  }

  const ghostJson = await toGhostJSON(input, {});
  const payload = { db: [ghostJson] };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-import-json-'));
  const outputPath = path.join(tempDir, 'import.json');
  await fs.writeFile(outputPath, JSON.stringify(payload), 'utf8');

  return outputPath;
}

export async function migrateImportJson(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  return uploadDbImportFile(global, filePath);
}

type MigrateSource = 'wordpress' | 'medium' | 'substack';

let migrateSourceLoaderForTests: ((modulePath: string) => Promise<unknown>) | null = null;

export function setMigrateSourceLoaderForTests(
  loader: ((modulePath: string) => Promise<unknown>) | null,
): void {
  migrateSourceLoaderForTests = loader;
}

function isMissingModuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('cannot find package') ||
    message.includes('cannot find module') ||
    message.includes('err_module_not_found')
  );
}

async function loadMigrateModule(modulePath: string): Promise<unknown> {
  try {
    if (migrateSourceLoaderForTests) {
      return await migrateSourceLoaderForTests(modulePath);
    }

    return await import(modulePath);
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new GhstError(
        `Migration dependency '${modulePath}' is not installed. Run: pnpm add @tryghost/mg-json @tryghost/mg-wp-xml @tryghost/mg-medium-export @tryghost/mg-substack`,
        {
          code: 'USAGE_ERROR',
          exitCode: ExitCode.USAGE_ERROR,
        },
      );
    }

    throw error;
  }
}

async function collectSourceMigrationInput(
  source: MigrateSource,
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (source === 'wordpress') {
    const wpModule = (await loadMigrateModule('@tryghost/mg-wp-xml')) as {
      default?: (ctx: { options: Record<string, unknown> }) => Promise<unknown>;
    };

    if (typeof wpModule.default !== 'function') {
      throw new GhstError('Invalid @tryghost/mg-wp-xml module: missing default export.', {
        code: 'GENERAL_ERROR',
        exitCode: ExitCode.GENERAL_ERROR,
      });
    }

    const output = await wpModule.default({
      options: {
        pathToFile: options.pathToFile,
        scrape: 'none',
        zip: false,
        cache: false,
      },
    });

    return ensureObjectRecord(output, source);
  }

  if (source === 'medium') {
    const mediumModule = (await loadMigrateModule('@tryghost/mg-medium-export')) as {
      default?: (pathToZip: string, options?: Record<string, unknown>) => unknown;
    };

    if (typeof mediumModule.default !== 'function') {
      throw new GhstError('Invalid @tryghost/mg-medium-export module: missing default export.', {
        code: 'GENERAL_ERROR',
        exitCode: ExitCode.GENERAL_ERROR,
      });
    }

    const output = await Promise.resolve(
      mediumModule.default(String(options.pathToZip ?? ''), {
        scrape: 'none',
      }),
    );

    return ensureObjectRecord(output, source);
  }

  const substackModule = (await loadMigrateModule('@tryghost/mg-substack')) as {
    default?: {
      ingest?: (ctx: { options: Record<string, unknown> }) => Promise<unknown>;
      process?: (
        input: unknown,
        ctx: { options: Record<string, unknown>; postsDir?: string },
      ) => Promise<unknown>;
    };
  };

  const substackApi = substackModule.default;
  if (
    !substackApi ||
    typeof substackApi.ingest !== 'function' ||
    typeof substackApi.process !== 'function'
  ) {
    throw new GhstError('Invalid @tryghost/mg-substack module: expected ingest/process API.', {
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  }

  const substackOptions: Record<string, unknown> = {
    pathToZip: options.pathToZip,
    url: options.url,
    posts: true,
    pages: true,
    podcasts: true,
    threads: false,
    drafts: true,
    addPlatformTag: true,
    addTypeTag: true,
    addAccessTag: true,
    useMetaImage: true,
    useFirstImage: true,
    useMetaAuthor: true,
    comments: true,
  };

  const ingested = await substackApi.ingest({ options: substackOptions });
  const output = await substackApi.process(ingested, { options: substackOptions });

  return ensureObjectRecord(output, source);
}

async function runGhostMigrateSource(
  source: MigrateSource,
  options: Record<string, unknown>,
): Promise<string> {
  const migrationInput = await collectSourceMigrationInput(source, options);
  return buildGhostDbImportFile(migrationInput);
}

export async function migrateImportWordpress(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const importPath = await runGhostMigrateSource('wordpress', { pathToFile: filePath });
  return uploadDbImportFile(global, importPath);
}

export async function migrateImportMedium(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const importPath = await runGhostMigrateSource('medium', { pathToZip: filePath });
  return uploadDbImportFile(global, importPath);
}

export async function migrateImportSubstack(
  global: GlobalOptions,
  filePath: string,
  url: string,
): Promise<Record<string, unknown>> {
  const importPath = await runGhostMigrateSource('substack', {
    pathToZip: filePath,
    url,
  });
  return uploadDbImportFile(global, importPath);
}

export async function migrateImportCsv(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(filePath, 'utf8');
  const rows = parseCsvRows(raw);

  const posts = rows.map((row, index) => {
    const html = row.html ?? markdownRenderer.render(row.markdown ?? '');
    const tags = splitList(row.tags).map((name) => createTagRelation(name));
    const authors = splitList(row.authors).map((name) => createAuthorRelation(name));

    const postData: Record<string, unknown> = {
      title: row.title,
      html,
      slug: row.slug,
      status: row.status,
      published_at: row.published_at,
      custom_excerpt: row.excerpt,
      feature_image: row.feature_image,
    };

    if (tags.length > 0) {
      postData.tags = tags;
    }

    if (authors.length === 1) {
      postData.author = authors[0];
    } else if (authors.length > 1) {
      postData.authors = authors;
    }

    return {
      url: row.slug ? `csv://post/${row.slug}` : `csv://post/${index + 1}`,
      data: postData,
    };
  });

  const importPath = await buildGhostDbImportFile({ posts });
  const payload = await uploadDbImportFile(global, importPath);

  return {
    imported: rows.length,
    ...payload,
  };
}

export async function migrateExport(global: GlobalOptions, outputPath: string): Promise<string> {
  const client = await getClient(global);
  const data = await client.db.export();
  await assertFileDoesNotExist(outputPath);
  await fs.writeFile(outputPath, data);
  return outputPath;
}
