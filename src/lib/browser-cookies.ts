import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A cookie found by scanning every host (used to discover sites the user is
// logged in to without knowing the URL up front).
export interface DiscoveredCookie {
  host: string; // leading-dot stripped, e.g. "localhost" or "demo.ghost.io"
  secure: boolean; // whether the cookie was flagged Secure (https)
  value: string;
  source: string;
}

// A cookie parsed out of Safari's binary cookie store.
export interface SafariCookieRecord {
  host: string;
  name: string;
  value: string;
  secure: boolean;
}

// macOS-only helper that reads a cookie out of the local browser stores so the
// CLI can bootstrap auth from an already-logged-in Ghost Admin session instead
// of asking the user to copy a token by hand. It only ever reads; the cookie is
// used once by the caller and never persisted.
//
// kooky (the Go library this mirrors) has no good Node equivalent, so the
// macOS Chromium path is ported directly: copy the (locked) SQLite store, read
// it via the sqlite3 CLI, fetch the AES key via the signed `security` CLI, and
// decrypt the v10 values ourselves. Firefox stores values in plaintext.

const HOME = os.homedir();
const SUPPORT = path.join(HOME, 'Library', 'Application Support');

// Chromium-family browsers share the v10 scheme, the profile layout, and a
// "<name> Safe Storage" Keychain key; only the store dir and key name differ.
interface ChromiumBrowser {
  name: string;
  dir: string; // under ~/Library/Application Support
  keychain: string; // Keychain service holding the AES password
}

const CHROMIUM_BROWSERS: ChromiumBrowser[] = [
  { name: 'Chrome', dir: 'Google/Chrome', keychain: 'Chrome Safe Storage' },
  { name: 'Brave', dir: 'BraveSoftware/Brave-Browser', keychain: 'Brave Safe Storage' },
  { name: 'Edge', dir: 'Microsoft Edge', keychain: 'Microsoft Edge Safe Storage' },
  { name: 'Vivaldi', dir: 'Vivaldi', keychain: 'Vivaldi Safe Storage' },
  { name: 'Arc', dir: 'Arc/User Data', keychain: 'Arc Safe Storage' },
  { name: 'Opera', dir: 'com.operasoftware.Opera', keychain: 'Opera Safe Storage' },
  { name: 'Opera GX', dir: 'com.operasoftware.OperaGX', keychain: 'Opera Safe Storage' },
];

/* c8 ignore start -- macOS-only browser store IO; verified by the manual login flow */
function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function runSqlite(dbFile: string, query: string): string | null {
  try {
    return execFileSync('sqlite3', [dbFile, query], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// Copies a (possibly locked) store to a temp file and runs fn against the copy,
// cleaning up afterwards. Returns null when the source is unreadable.
function withTempCopy<T>(src: string, fn: (tmpFile: string) => T): T | null {
  let data: Buffer;
  try {
    data = readFileSync(src);
  } catch {
    return null;
  }

  let dir: string;
  try {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ghst-ck-'));
  } catch {
    return null;
  }

  const tmp = path.join(dir, 'store.sqlite');
  try {
    writeFileSync(tmp, data);
    return fn(tmp);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function chromiumProfileDirs(base: string): string[] {
  let profiles: string[];
  try {
    profiles = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name === 'Default' || name.startsWith('Profile '));
  } catch {
    return [];
  }
  if (profiles.length > 0) {
    return profiles;
  }
  // Some Chromium browsers (e.g. Opera) store cookies in the base dir directly
  // rather than under a "Default" profile. Treat the base as a single profile.
  for (const sub of ['Network/Cookies', 'Cookies']) {
    try {
      statSync(path.join(base, sub));
      return ['.'];
    } catch {
      // keep looking
    }
  }
  return [];
}

// Resolves a profile dir ("Default", "Profile 1") to its friendly name from the
// browser's Local State, falling back to the dir name.
function chromiumProfileName(base: string, dir: string): string {
  if (dir === '.') {
    return 'Default';
  }
  try {
    const localState = JSON.parse(readFileSync(path.join(base, 'Local State'), 'utf8')) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    const name = localState.profile?.info_cache?.[dir]?.name;
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }
  } catch {
    // Local State missing or unparseable — fall back to the dir name.
  }
  return dir;
}

// Derives the AES-128 key a Chromium browser uses for cookie values from the
// Keychain password (PBKDF2, salt "saltysalt", 1003 iters). Returns null when
// the key is unavailable (e.g. the user denied the prompt).
function chromiumSafeStorageKey(service: string): Buffer | null {
  let password: string;
  try {
    password = execFileSync('security', ['find-generic-password', '-w', '-s', service], {
      encoding: 'utf8',
    }).replace(/\n+$/, '');
  } catch {
    return null;
  }
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}
/* c8 ignore stop */

function decodeUtf8Strict(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

// Decrypts a "v10" AES-128-CBC cookie value (IV = 16 spaces), stripping PKCS7
// padding and the 32-byte SHA256(host) prefix recent Chromium prepends.
export function decryptChromiumCookieV10(enc: Buffer, key: Buffer): string | null {
  if (enc.length < 3 + 16 || enc.subarray(0, 3).toString('latin1') !== 'v10') {
    return null;
  }

  const ciphertext = enc.subarray(3);
  if (ciphertext.length % 16 !== 0) {
    return null;
  }

  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
    decipher.setAutoPadding(false);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }

  const pad = plaintext[plaintext.length - 1] ?? 0;
  if (pad >= 1 && pad <= 16 && pad <= plaintext.length) {
    plaintext = plaintext.subarray(0, plaintext.length - pad);
  }

  // Recent Chromium prepends a 32-byte SHA256(host); strip it when the full
  // buffer isn't valid UTF-8 but the remainder is.
  const direct = decodeUtf8Strict(plaintext);
  if (direct !== null) {
    return direct;
  }
  if (plaintext.length >= 32) {
    return decodeUtf8Strict(plaintext.subarray(32));
  }
  return null;
}

function readCString(buffer: Buffer, start: number, limit: number): string | null {
  if (start < 0 || start >= limit) {
    return null;
  }
  let end = start;
  while (end < limit && buffer[end] !== 0) {
    end += 1;
  }
  return buffer.toString('utf8', start, end);
}

// Parses one page of Safari's binary cookie store, appending records to out.
function parseSafariPage(
  buffer: Buffer,
  pageStart: number,
  pageSize: number,
  out: SafariCookieRecord[],
): void {
  const pageEnd = Math.min(pageStart + pageSize, buffer.length);
  if (pageStart + 8 > pageEnd) {
    return;
  }

  const numCookies = buffer.readUInt32LE(pageStart + 4);
  for (let i = 0; i < numCookies; i += 1) {
    const offsetPos = pageStart + 8 + i * 4;
    if (offsetPos + 4 > pageEnd) {
      return;
    }
    const cookieStart = pageStart + buffer.readUInt32LE(offsetPos);
    if (cookieStart + 56 > pageEnd) {
      continue;
    }

    const flags = buffer.readUInt32LE(cookieStart + 8);
    const domainOffset = buffer.readUInt32LE(cookieStart + 16);
    const nameOffset = buffer.readUInt32LE(cookieStart + 20);
    const valueOffset = buffer.readUInt32LE(cookieStart + 28);

    const host = readCString(buffer, cookieStart + domainOffset, pageEnd);
    const name = readCString(buffer, cookieStart + nameOffset, pageEnd);
    const value = readCString(buffer, cookieStart + valueOffset, pageEnd);
    if (host === null || name === null || value === null) {
      continue;
    }
    out.push({ host, name, value, secure: (flags & 1) === 1 });
  }
}

// Parses Safari's Cookies.binarycookies format (big-endian header, little-endian
// page/cookie records). Returns every cookie found; malformed input yields [].
export function parseSafariBinaryCookies(buffer: Buffer): SafariCookieRecord[] {
  const records: SafariCookieRecord[] = [];
  try {
    if (buffer.length < 8 || buffer.subarray(0, 4).toString('latin1') !== 'cook') {
      return records;
    }

    const numPages = buffer.readUInt32BE(4);
    const pageSizes: number[] = [];
    let cursor = 8;
    for (let i = 0; i < numPages; i += 1) {
      if (cursor + 4 > buffer.length) {
        return records;
      }
      pageSizes.push(buffer.readUInt32BE(cursor));
      cursor += 4;
    }

    let pageStart = cursor;
    for (const pageSize of pageSizes) {
      parseSafariPage(buffer, pageStart, pageSize, records);
      pageStart += pageSize;
    }
  } catch {
    return records;
  }
  return records;
}

/* c8 ignore start -- macOS-only browser store IO; verified by the manual login flow */
// Safari stores cookies in a binary file inside its sandboxed container (needs
// Full Disk Access) and, on older systems, an unsandboxed legacy path.
const SAFARI_COOKIE_PATHS = [
  path.join(
    HOME,
    'Library',
    'Containers',
    'com.apple.Safari',
    'Data',
    'Library',
    'Cookies',
    'Cookies.binarycookies',
  ),
  path.join(HOME, 'Library', 'Cookies', 'Cookies.binarycookies'),
];

// Reads Safari's cookie records for a given name. Returns [] when the file is
// missing or unreadable (e.g. Full Disk Access not granted).
function readSafariRecords(name: string): SafariCookieRecord[] {
  const records: SafariCookieRecord[] = [];
  for (const file of SAFARI_COOKIE_PATHS) {
    let data: Buffer;
    try {
      data = readFileSync(file);
    } catch {
      continue; // not present, or no Full Disk Access — skip silently
    }
    for (const record of parseSafariBinaryCookies(data)) {
      if (record.name === name) {
        records.push(record);
      }
    }
  }
  return records;
}

function discoverSafariCookies(name: string): DiscoveredCookie[] {
  return readSafariRecords(name).map((record) => ({
    host: normalizeHost(record.host),
    secure: record.secure,
    value: record.value,
    source: 'Safari',
  }));
}

function normalizeHost(host: string): string {
  return host.startsWith('.') ? host.slice(1) : host;
}

interface DiscoveryRow {
  host: string;
  secure: boolean;
  enc: Buffer;
}

// Reads every row for a cookie name across all hosts (no host filter) so we can
// surface the sites the user is logged in to.
function chromiumDiscoveryRows(dbFile: string, name: string): DiscoveryRow[] {
  const out = runSqlite(
    dbFile,
    `SELECT host_key || char(9) || is_secure || char(9) || hex(encrypted_value) FROM cookies WHERE name = '${sqlEscape(name)}';`,
  );
  if (!out) {
    return [];
  }

  const rows: DiscoveryRow[] = [];
  for (const line of out.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 3) {
      continue;
    }
    const host = normalizeHost((parts[0] ?? '').trim());
    const hex = (parts[2] ?? '').trim();
    if (host.length === 0 || hex.length === 0) {
      continue;
    }
    rows.push({ host, secure: (parts[1] ?? '').trim() === '1', enc: Buffer.from(hex, 'hex') });
  }
  return rows;
}

function discoverChromiumCookies(name: string): DiscoveredCookie[] {
  const results: DiscoveredCookie[] = [];

  for (const browser of CHROMIUM_BROWSERS) {
    const base = path.join(SUPPORT, browser.dir);
    try {
      statSync(base);
    } catch {
      continue;
    }

    const loggedIn: Array<{ profile: string; rows: DiscoveryRow[] }> = [];
    for (const profile of chromiumProfileDirs(base)) {
      const rows: DiscoveryRow[] = [];
      for (const sub of ['Network/Cookies', 'Cookies']) {
        const found =
          withTempCopy(path.join(base, profile, sub), (tmp) => chromiumDiscoveryRows(tmp, name)) ??
          [];
        rows.push(...found);
      }
      if (rows.length > 0) {
        loggedIn.push({ profile, rows });
      }
    }
    if (loggedIn.length === 0) {
      continue;
    }

    const key = chromiumSafeStorageKey(browser.keychain);
    if (!key) {
      continue;
    }
    try {
      for (const { profile, rows } of loggedIn) {
        for (const row of rows) {
          const value = decryptChromiumCookieV10(row.enc, key);
          if (value) {
            results.push({
              host: row.host,
              secure: row.secure,
              value,
              source: `${browser.name} · ${chromiumProfileName(base, profile)}`,
            });
          }
        }
      }
    } finally {
      key.fill(0);
    }
  }

  return results;
}

function discoverFirefoxCookies(name: string): DiscoveredCookie[] {
  const profilesBase = path.join(SUPPORT, 'Firefox', 'Profiles');
  let profiles: string[];
  try {
    profiles = readdirSync(profilesBase, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const results: DiscoveredCookie[] = [];
  for (const profile of profiles) {
    const out = withTempCopy(path.join(profilesBase, profile, 'cookies.sqlite'), (tmp) =>
      runSqlite(
        tmp,
        `SELECT host || char(9) || isSecure || char(9) || value FROM moz_cookies WHERE name = '${sqlEscape(name)}';`,
      ),
    );
    if (!out) {
      continue;
    }
    for (const line of out.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3) {
        continue;
      }
      const host = normalizeHost((parts[0] ?? '').trim());
      const value = parts.slice(2).join('\t').trim();
      if (host.length === 0 || value.length === 0) {
        continue;
      }
      results.push({
        host,
        secure: (parts[1] ?? '').trim() === '1',
        value,
        source: `Firefox · ${profile}`,
      });
    }
  }
  return results;
}

// Finds every logged-in copy of the named cookie across browser stores, without
// needing a host up front. macOS only; returns [] everywhere else.
export function discoverBrowserSessionCookies(name: string): DiscoveredCookie[] {
  if (process.platform !== 'darwin') {
    return [];
  }

  const all = [
    ...discoverChromiumCookies(name),
    ...discoverFirefoxCookies(name),
    ...discoverSafariCookies(name),
  ];
  const seen = new Set<string>();
  const out: DiscoveredCookie[] = [];
  for (const cookie of all) {
    const key = `${cookie.source} ${cookie.host} ${cookie.value}`;
    if (cookie.value.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(cookie);
  }
  return out;
}
/* c8 ignore stop */
