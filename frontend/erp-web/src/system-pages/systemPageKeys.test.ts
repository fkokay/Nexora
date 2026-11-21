import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemPageAliasKeys, systemPageScreenKeys } from './systemPageKeys';

// Vitest runs from frontend/erp-web.
const folder = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards');
const standards = () => readdirSync(folder).filter((name) => name.endsWith('.json'));

describe('system page screen keys', () => {
  it('match the API standards folder', () => {
    expect([...systemPageScreenKeys].sort()).toEqual(standards().map((name) => name.slice(0, -'.json'.length)).sort());
  });

  it('alias keys match the aliases the standards declare', () => {
    const declared = standards().flatMap((name) => {
      const standard = JSON.parse(readFileSync(resolve(folder, name), 'utf8')) as { aliases?: { key?: unknown }[] };
      return (standard.aliases ?? []).map((alias) => String(alias.key));
    });
    expect([...systemPageAliasKeys].sort()).toEqual(declared.sort());
    for (const key of systemPageAliasKeys) expect(systemPageScreenKeys.has(key)).toBe(false);
  });
});
