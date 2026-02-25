import { SignJWT } from 'jose';
import { StaffAccessTokenSchema } from '../schemas/common.js';
import { ExitCode, GhstError } from './errors.js';

export interface ParsedStaffAccessToken {
  id: string;
  secretHex: string;
  secret: Uint8Array;
}

export function parseStaffAccessToken(value: string): ParsedStaffAccessToken {
  const parsed = StaffAccessTokenSchema.safeParse(value);
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

export async function generateStaffJwt(staffToken: string): Promise<string> {
  const parsed = parseStaffAccessToken(staffToken);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', kid: parsed.id, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('/admin/')
    .sign(parsed.secret);
}
