import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemPageScreenKeys } from './systemPageKeys';

describe('system page screen keys', () => {
  it('match the API standards folder', () => {
    // Vitest runs from frontend/erp-web.
    const folder = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards');
    const standards = readdirSync(folder).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort();
    expect([...systemPageScreenKeys].sort()).toEqual(standards);
  });
});
