import { createCipheriv, pbkdf2Sync } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  decryptChromiumCookieV10,
  discoverBrowserSessionCookies,
  parseSafariBinaryCookies,
} from '../src/lib/browser-cookies.js';

const key = pbkdf2Sync('test-pass', 'saltysalt', 1003, 16, 'sha1');

function encryptV10(plaintext: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from('v10'), cipher.update(plaintext), cipher.final()]);
}

describe('decryptChromiumCookieV10', () => {
  test('round-trips a v10 cookie value', () => {
    const enc = encryptV10(Buffer.from('s%3Asession-id.signature'));
    expect(decryptChromiumCookieV10(enc, key)).toBe('s%3Asession-id.signature');
  });

  test('strips the 32-byte sha256(host) prefix recent Chromium prepends', () => {
    const enc = encryptV10(Buffer.concat([Buffer.alloc(32, 0xff), Buffer.from('s%3Avalue.sig')]));
    expect(decryptChromiumCookieV10(enc, key)).toBe('s%3Avalue.sig');
  });

  test('returns null for non-v10 payloads', () => {
    expect(decryptChromiumCookieV10(Buffer.from('not-a-v10-encrypted-cookie'), key)).toBeNull();
  });

  test('returns null when decrypted with the wrong key', () => {
    const enc = encryptV10(Buffer.from('s%3Aa-reasonably-long-session-value.signature-bytes'));
    const wrong = pbkdf2Sync('other-pass', 'saltysalt', 1003, 16, 'sha1');
    expect(decryptChromiumCookieV10(enc, wrong)).toBeNull();
  });
});

// Minimal encoders for Safari's binarycookies format, mirroring the parser.
interface TestCookie {
  host: string;
  name: string;
  value: string;
  secure: boolean;
}

function encodeSafariCookie(cookie: TestCookie): Buffer {
  const domain = Buffer.from(`${cookie.host}\0`, 'utf8');
  const name = Buffer.from(`${cookie.name}\0`, 'utf8');
  const pathBuf = Buffer.from('/\0', 'utf8');
  const value = Buffer.from(`${cookie.value}\0`, 'utf8');

  const domainOffset = 56;
  const nameOffset = domainOffset + domain.length;
  const pathOffset = nameOffset + name.length;
  const valueOffset = pathOffset + pathBuf.length;
  const size = valueOffset + value.length;

  const buf = Buffer.alloc(size);
  buf.writeUInt32LE(size, 0);
  buf.writeUInt32LE(cookie.secure ? 1 : 0, 8);
  buf.writeUInt32LE(domainOffset, 16);
  buf.writeUInt32LE(nameOffset, 20);
  buf.writeUInt32LE(pathOffset, 24);
  buf.writeUInt32LE(valueOffset, 28);
  domain.copy(buf, domainOffset);
  name.copy(buf, nameOffset);
  pathBuf.copy(buf, pathOffset);
  value.copy(buf, valueOffset);
  return buf;
}

function encodeSafariPage(cookies: Buffer[]): Buffer {
  const headerLen = 8 + cookies.length * 4 + 4;
  const offsets: number[] = [];
  let running = headerLen;
  for (const cookie of cookies) {
    offsets.push(running);
    running += cookie.length;
  }
  const page = Buffer.alloc(running);
  page.writeUInt32BE(0x00000100, 0);
  page.writeUInt32LE(cookies.length, 4);
  offsets.forEach((offset, i) => {
    page.writeUInt32LE(offset, 8 + i * 4);
  });
  let pos = headerLen;
  for (const cookie of cookies) {
    cookie.copy(page, pos);
    pos += cookie.length;
  }
  return page;
}

function encodeSafariBinaryCookies(cookies: TestCookie[]): Buffer {
  const page = encodeSafariPage(cookies.map(encodeSafariCookie));
  const header = Buffer.alloc(8 + 4);
  header.write('cook', 0, 'latin1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(page.length, 8);
  return Buffer.concat([header, page, Buffer.alloc(8)]);
}

describe('parseSafariBinaryCookies', () => {
  test('parses host, name, value and secure flag', () => {
    const buffer = encodeSafariBinaryCookies([
      { host: 'localhost', name: 'ghost-admin-api-session', value: 's%3Asess.sig', secure: false },
      {
        host: '.demo.ghost.io',
        name: 'ghost-admin-api-session',
        value: 's%3Aother.sig',
        secure: true,
      },
    ]);

    const records = parseSafariBinaryCookies(buffer);

    expect(records).toEqual([
      { host: 'localhost', name: 'ghost-admin-api-session', value: 's%3Asess.sig', secure: false },
      {
        host: '.demo.ghost.io',
        name: 'ghost-admin-api-session',
        value: 's%3Aother.sig',
        secure: true,
      },
    ]);
  });

  test('returns [] for non-Safari payloads', () => {
    expect(parseSafariBinaryCookies(Buffer.from('not binarycookies'))).toEqual([]);
  });

  test('returns [] for truncated input without throwing', () => {
    expect(parseSafariBinaryCookies(Buffer.from('cook'))).toEqual([]);
  });
});

describe('discoverBrowserSessionCookies', () => {
  test('returns nothing on non-macOS platforms', () => {
    if (process.platform === 'darwin') {
      return; // platform-gated behaviour only asserted off-darwin
    }
    expect(discoverBrowserSessionCookies('ghost-admin-api-session')).toEqual([]);
  });
});
