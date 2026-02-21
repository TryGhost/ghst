import fs from 'node:fs/promises';
import path from 'node:path';
import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

function getFirstMember(payload: Record<string, unknown>): Record<string, unknown> {
  const members = payload.members;
  if (!Array.isArray(members) || members.length === 0) {
    throw new GhstError('Member not found', {
      exitCode: ExitCode.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  }

  return (members[0] as Record<string, unknown>) ?? {};
}

function emailFilter(email: string): string {
  const escaped = email.replace(/'/g, "\\'");
  return `email:'${escaped}'`;
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function listMembers(
  global: GlobalOptions,
  params: Record<string, string | number | boolean | undefined>,
  allPages: boolean,
): Promise<GhostPaginatedResponse> {
  const client = await getClient(global);

  if (!allPages) {
    return client.members.browse(params);
  }

  const limit = typeof params.limit === 'number' ? params.limit : 100;
  return collectAllPages('members', (page) => client.members.browse({ ...params, page, limit }));
}

export async function getMember(
  global: GlobalOptions,
  options: {
    id?: string;
    email?: string;
    params?: Record<string, string | number | boolean | undefined>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  if (options.id) {
    return client.members.read(options.id, options.params);
  }

  if (options.email) {
    const payload = await client.members.browse({
      ...options.params,
      filter: emailFilter(options.email),
      limit: 1,
    });
    getFirstMember(payload);
    return payload;
  }

  throw new GhstError('Provide an id argument or --email.', {
    code: 'USAGE_ERROR',
    exitCode: ExitCode.USAGE_ERROR,
  });
}

export async function createMember(
  global: GlobalOptions,
  member: Record<string, unknown>,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.members.add(member, params);
}

export async function updateMember(
  global: GlobalOptions,
  options: {
    id?: string;
    email?: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  let id = options.id;
  if (!id && options.email) {
    const payload = await client.members.browse({
      filter: emailFilter(options.email),
      limit: 1,
    });
    const existing = getFirstMember(payload);
    id = String(existing.id ?? '');
  }

  if (!id) {
    throw new GhstError('Provide an id argument or --email.', {
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  }

  return client.members.edit(id, options.patch);
}

export async function deleteMember(
  global: GlobalOptions,
  id: string,
  options?: {
    cancel?: boolean;
  },
): Promise<Record<string, never>> {
  const client = await getClient(global);

  const params = options?.cancel ? { cancel: true } : undefined;
  return client.members.delete(id, params);
}

export async function exportMembersCsv(
  global: GlobalOptions,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<string> {
  const client = await getClient(global);
  return client.members.exportCsv(params);
}

export async function importMembersCsv(
  global: GlobalOptions,
  options: {
    filePath: string;
    labels?: string[];
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  const bytes = await fs.readFile(options.filePath);
  const formData = new FormData();
  const fileBlob = new Blob([bytes], { type: 'text/csv' });
  formData.append('membersfile', fileBlob, path.basename(options.filePath));

  if (options.labels && options.labels.length > 0) {
    formData.append(
      'labels',
      JSON.stringify(options.labels.map((name) => ({ name: name.trim() })).filter((l) => l.name)),
    );
  }

  return client.members.importCsv(formData);
}

export async function bulkMembers(
  global: GlobalOptions,
  options: {
    action: 'unsubscribe' | 'add-label' | 'remove-label' | 'delete';
    all?: boolean;
    filter?: string;
    search?: string;
    labelId?: string;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);

  const params: Record<string, string | number | boolean | undefined> = {
    all: options.all,
    filter: options.filter,
    search: options.search,
  };

  if (options.action === 'delete') {
    return client.members.bulkDestroy(params);
  }

  let action: 'unsubscribe' | 'addLabel' | 'removeLabel' = 'unsubscribe';
  if (options.action === 'add-label') {
    action = 'addLabel';
  } else if (options.action === 'remove-label') {
    action = 'removeLabel';
  }

  const bulk: Record<string, unknown> = { action };
  if ((action === 'addLabel' || action === 'removeLabel') && options.labelId) {
    bulk.meta = {
      label: {
        id: options.labelId,
      },
    };
  }

  return client.members.bulkEdit(bulk, params);
}
