import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { normalizeGhostApiPath } from '../lib/api-path.js';
import { GhostClient, type GhostResponseWithMeta } from '../lib/client.js';
import { resolveConnectionConfig } from '../lib/config.js';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';
import { parseQueryPairs } from '../lib/parse.js';

function parsePrimitiveValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && trimmed !== '') {
    return asNumber;
  }

  return value;
}

function parseFieldPairs(entries: string[] | undefined): Record<string, unknown> {
  if (!entries || entries.length === 0) {
    return {};
  }

  return Object.fromEntries(
    entries.map((entry) => {
      const [key, ...rest] = entry.split('=');
      const parsedKey = key?.trim();
      if (!parsedKey) {
        throw new GhstError(`Invalid field pair: ${entry}`, {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      return [parsedKey, parsePrimitiveValue(rest.join('='))];
    }),
  );
}

function getCollectionKey(data: Record<string, unknown>): string | null {
  const entries = Object.entries(data);
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      return key;
    }
  }

  return null;
}

function mergePaginatedPayload(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const left = Array.isArray(base[key]) ? base[key] : [];
  const right = Array.isArray(next[key]) ? next[key] : [];
  const merged = [...left, ...right];

  const baseMeta = (base.meta as Record<string, unknown> | undefined) ?? {};
  const pagination = ((baseMeta.pagination as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;

  return {
    ...base,
    [key]: merged,
    meta: {
      ...baseMeta,
      pagination: {
        ...pagination,
        page: 1,
        pages: 1,
        next: null,
        prev: null,
        total: merged.length,
        limit: merged.length,
      },
    },
  };
}

async function executeRequest(
  client: GhostClient,
  options: {
    endpointPath: string;
    method: string;
    body: unknown;
    params: Record<string, string | number | boolean | undefined>;
    contentApi: boolean;
    paginate: boolean;
  },
): Promise<GhostResponseWithMeta<Record<string, unknown>>> {
  let page = Number(options.params.page ?? 1);
  if (!Number.isInteger(page) || page <= 0) {
    page = 1;
  }

  let firstResponse: GhostResponseWithMeta<Record<string, unknown>> | null = null;
  let mergedPayload: Record<string, unknown> | null = null;

  while (true) {
    const requestParams = options.paginate
      ? {
          ...options.params,
          page,
        }
      : options.params;

    const current = await client.rawRequestWithMeta<Record<string, unknown>>(
      options.endpointPath,
      options.method,
      options.body,
      requestParams,
      {
        api: options.contentApi ? 'content' : 'admin',
      },
    );

    if (!firstResponse) {
      firstResponse = current;
      mergedPayload = current.data;
    } else if (mergedPayload) {
      const key = getCollectionKey(mergedPayload);
      if (key) {
        mergedPayload = mergePaginatedPayload(mergedPayload, current.data, key);
      }
    }

    if (!options.paginate) {
      break;
    }

    const pagination =
      ((current.data.meta as Record<string, unknown> | undefined)?.pagination as
        | Record<string, unknown>
        | undefined) ?? {};
    const pages = Number(pagination.pages ?? 1);
    if (!Number.isInteger(pages) || pages <= page) {
      break;
    }

    const key = getCollectionKey(current.data);
    if (!key) {
      break;
    }

    page += 1;
  }

  if (!firstResponse || !mergedPayload) {
    throw new GhstError('API request failed to produce a response payload.', {
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  }

  return {
    status: firstResponse.status,
    headers: firstResponse.headers,
    data: mergedPayload,
  };
}

export function registerApiCommands(program: Command): void {
  program
    .command('api [endpointPath]')
    .description('Make a raw Ghost API request')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('--body <json>', 'Inline JSON request body')
    .option('--input <path>', 'Read JSON request body from file')
    .option('-f, --field <pairs...>', 'Request body field in key=value format')
    .option('--query <pairs...>', 'Query params in key=value format')
    .option('--content-api', 'Use Content API instead of Admin API')
    .option('--paginate', 'Auto-paginate list responses')
    .option('--include-headers', 'Include response headers in output')
    .action(async (endpointPath: string | undefined, options, command) => {
      if (!endpointPath) {
        throw new GhstError('Missing required argument: endpointPath', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      if (options.body && options.input) {
        throw new GhstError('Use either --body or --input, not both.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const fieldValues = parseFieldPairs(options.field);
      const fieldKeys = Object.keys(fieldValues);
      const requestApi = options.contentApi ? 'content' : 'admin';
      const normalizedEndpointPath = normalizeGhostApiPath(endpointPath, requestApi);

      const global = getGlobalOptions(command);
      const connection = await resolveConnectionConfig(global);
      const client = new GhostClient({
        url: connection.url,
        staffToken: connection.staffToken,
        contentKey: process.env.GHOST_CONTENT_API_KEY,
        version: connection.apiVersion,
      });

      const params = parseQueryPairs(options.query);
      let requestBody: unknown;

      if (options.input) {
        requestBody = JSON.parse(await fs.readFile(options.input, 'utf8')) as unknown;
      } else if (options.body) {
        requestBody = JSON.parse(options.body) as unknown;
      }

      if (fieldKeys.length > 0) {
        if (requestBody === undefined) {
          requestBody = fieldValues;
        } else if (requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)) {
          requestBody = {
            ...(requestBody as Record<string, unknown>),
            ...fieldValues,
          };
        } else {
          throw new GhstError('--field can only be merged into object JSON bodies.', {
            exitCode: ExitCode.USAGE_ERROR,
            code: 'USAGE_ERROR',
          });
        }
      }

      const result = await executeRequest(client, {
        endpointPath: normalizedEndpointPath,
        method: options.method,
        body: requestBody,
        params,
        contentApi: requestApi === 'content',
        paginate: Boolean(options.paginate),
      });

      if (options.includeHeaders) {
        printJson(
          {
            status: result.status,
            headers: result.headers,
            data: result.data,
          },
          global.jq,
        );
        return;
      }

      printJson(result.data, global.jq);
    });
}
