import { decodeProtectedHeader, jwtVerify } from 'jose';
import { describe, expect, test } from 'vitest';
import { generateStaffJwt, parseStaffAccessToken } from '../src/lib/auth.js';

describe('auth key parsing', () => {
  test('parses valid staff access token', () => {
    const parsed = parseStaffAccessToken('abc123:0011aabb');
    expect(parsed.id).toBe('abc123');
    expect(parsed.secretHex).toBe('0011aabb');
  });

  test('rejects invalid key', () => {
    expect(() => parseStaffAccessToken('invalid')).toThrowError();
  });

  test('generates JWT with expected header and audience', async () => {
    const key = 'myid:00112233445566778899aabbccddeeff';
    const token = await generateStaffJwt(key);
    const header = decodeProtectedHeader(token);

    expect(header.kid).toBe('myid');

    const secret = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const { payload } = await jwtVerify(token, secret, {
      audience: '/admin/',
    });

    expect(payload.aud).toBe('/admin/');
  });
});
