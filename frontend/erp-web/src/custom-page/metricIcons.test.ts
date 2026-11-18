import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { METRIC_ICONS } from './metricIcons';

// Vitest runs from frontend/erp-web.
const repo = resolve(process.cwd(), '../..');

describe('metric icons', () => {
  const erp = Object.keys(METRIC_ICONS).sort();

  it('match the API whitelist (TenantCustomPageSchema.MetricIcons)', () => {
    const source = readFileSync(resolve(repo, 'src/Hosts/AIERP.Api/TenantCustomPageSchema.cs'), 'utf8');
    const block = /HashSet<string> MetricIcons = new\(StringComparer\.Ordinal\)\s*\{([^}]*)\}/.exec(source);
    expect(block).not.toBeNull();
    const server = [...block![1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
    expect(erp).toEqual(server);
  });

  it('match the Studio picker (page-designer/metricIcons.ts)', () => {
    const source = readFileSync(resolve(repo, 'frontend/development-studio/src/platform-tools/erp-src/page-designer/metricIcons.ts'), 'utf8');
    const studio = [...source.matchAll(/\{ value: "([^"]+)"/g)].map((match) => match[1]).sort();
    expect(erp).toEqual(studio);
  });

  it('keep the original eight keys for saved pages', () => {
    for (const key of ['box', 'users', 'receipt', 'wallet', 'chart', 'clock', 'check', 'alert']) expect(METRIC_ICONS[key]).toBeDefined();
  });
});
