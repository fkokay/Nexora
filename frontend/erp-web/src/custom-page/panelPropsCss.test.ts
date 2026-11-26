import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Alt proje 5a: bilgi kutusunun madde listesi kuralı yalnız kutunun kendi listesine uygulanır; eski iç içe listeler etkilenmez.
describe('info box items css', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/tenant-custom-page.css'), 'utf8');
  it('targets only the direct item list of an alert or card', () => {
    expect(css).toContain('.tenant-page-alert > ul, .tenant-page-card > ul {');
    expect(css).not.toMatch(/\.tenant-page-(alert|card) ul\b/);
  });
});
