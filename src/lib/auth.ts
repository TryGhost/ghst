import { SignJWT } from 'jose';
import { AdminApiKeySchema } from '../schemas/common.js';
import { ExitCode, GhstError } from './errors.js';

export interface ParsedAdminKey {
  id: string;
  secretHex: string;
  secret: Uint8Array;
}

export function parseAdminApiKey(value: string): ParsedAdminKey {
  const parsed = AdminApiKeySchema.safeParse(value);
  if (!parsed.success) {
    throw new GhstError(parsed.error.issues.map((issue) => issue.message).join('; '), {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: parsed.error.flatten(),
    });
  }

  const [id, secretHex] = parsed.data.split(':') as [string, string];
  return {
    id,
    secretHex,
    secret: Buffer.from(secretHex, 'hex'),
  };
}

export async function generateAdminToken(key: string): Promise<string> {
  const parsed = parseAdminApiKey(key);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid: parsed.id, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('/admin/')
    .sign(parsed.secret);
}
