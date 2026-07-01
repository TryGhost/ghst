import fs from 'node:fs/promises';
import MarkdownIt from 'markdown-it';
import { ExitCode, GhstError } from './errors.js';

const markdownRenderer = new MarkdownIt({ html: true, linkify: true, breaks: true });

export function renderMarkdown(markdown: string): string {
  return markdownRenderer.render(markdown);
}

export async function readOptionalFile(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  return fs.readFile(filePath, 'utf8');
}

export async function readOptionalStdin(enabled: boolean | undefined): Promise<string | undefined> {
  if (!enabled) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const value = Buffer.concat(chunks).toString('utf8').trim();
  return value.length > 0 ? value : undefined;
}

export function wrapRawHtmlCard(html: string): string {
  return `<!--kg-card-begin: html-->\n${html}\n<!--kg-card-end: html-->`;
}

/**
 * Unwrap a `--from-json` payload into a single resource record. Accepts either a
 * bare object or a Ghost Admin collection envelope (e.g. `{ posts: [...] }` or
 * `{ pages: [...] }`) and returns the first entry.
 */
function asResourcePayload(value: unknown, collectionKey: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new GhstError('Invalid --from-json payload: expected JSON object.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const record = value as Record<string, unknown>;
  const collection = record[collectionKey];
  if (Array.isArray(collection) && collection.length > 0) {
    const first = collection[0];
    if (first && typeof first === 'object') {
      return first as Record<string, unknown>;
    }
  }

  return record;
}

export async function readOptionalResourceJson(
  filePath: string | undefined,
  collectionKey: string,
): Promise<Record<string, unknown>> {
  if (!filePath) {
    return {};
  }

  const payload = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  return asResourcePayload(payload, collectionKey);
}

export function assignDefined(
  target: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  return target;
}
