import { act, cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { api } from '../erpApi';
import { setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { recordDefinition, recordRow } from './recordTemplateFixture';

// Kayıt kartı: bölüm kolonları bölümün kendi kutusuna göre azalır. jsdom `@container` değerlendirmez; JS'in ölçtüğü
// kolon sayısı (`data-cols`) ve tam satır işareti sınanır, CSS kurallarının varlığı ayrıca okunur.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const observers: { callback: ResizeObserverCallback; element: Element }[] = [];
class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(element: Element) { observers.push({ callback: this.callback, element }); }
  unobserve() {}
  disconnect() {}
}
const resizeSections = (width: number) => act(() => {
  for (const { callback, element } of observers) {
    if (element.classList.contains('record-section')) callback([{ contentRect: { width }, target: element } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  }
});

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(recordDefinition()), rights: { view: true, insert: true, update: true, delete: true } } as never;
    if (endpoint.includes('/queries/kayit/run')) return { columns: [], rows: [recordRow], rowCount: 1, truncated: false } as never;
    if (endpoint.includes('/queries/hareket/run')) return { columns: [{ code: 'Belge', label: 'Belge' }], rows: [{ Belge: 'FT-2291' }], rowCount: 1, truncated: false } as never;
    return { items: [], total: 0 } as never;
  });
  setPageParams('custom-page:p', { kod: 'C-1001' });
});
afterEach(() => { cleanup(); setPageParams('custom-page:p', {}); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };
const cellOf = (label: string) => screen.getByLabelText(label).closest('.tenant-page-form-card-cell')!;

describe('kayıt kartı kutu genişliği', () => {
  it('three-column section at 600px shows two columns and multiline input spans the row', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    const section = container.querySelector('.record-section')!;
    // Ölçülmeden önce seçilen sayı.
    expect(section.getAttribute('data-cols')).toBe('3');
    resizeSections(900);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('3'));
    resizeSections(600);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('2'));
    resizeSections(400);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('1'));
    // Çok satırlı girdi her genişlikte tam satırdır; tek satırlı girdi değildir.
    expect(cellOf('Adres').className).toContain('is-wide');
    expect(cellOf('Unvan').className).not.toContain('is-wide');
    // Satır tablosu da tam satırdır ve kendi kutusunda kayar.
    expect(container.querySelector('.record-lines')).toBeTruthy();
  });

  it('record rules live only under .record-template-page and use container queries', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/page-templates/page-templates.css'), 'utf8');
    expect(css).toMatch(/\.record-section\s*\{[^}]*container-type:\s*inline-size/);
    expect(css).toMatch(/@container[^{]*\(max-width:\s*720px\)/);
    expect(css).toMatch(/@container[^{]*\(max-width:\s*480px\)/);
    expect(css).toMatch(/\.record-template-page[^{]*\.is-wide[^{]*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    // Kayıt kartı kuralları başka yere sızmaz: `.record-section` / `.is-wide` içeren her seçici kalıp sayfasıyla başlar.
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{]+\{/g, '').split('}').map((rule) => rule.split('{')[0].trim()).filter(Boolean);
    for (const selector of selectors.filter((item) => /record-(section|lines|skeleton)|is-wide/.test(item))) {
      for (const part of selector.split(/,(?![^(]*\))/)) expect(part.trim().startsWith('.record-template-page')).toBe(true);
    }
    // Eski form kartının medya kuralları değişmedi.
    const legacy = readFileSync(resolve(process.cwd(), 'src/tenant-custom-page.css'), 'utf8');
    expect(legacy).toContain('@media (max-width: 900px) { .tenant-page-form-card-grid.is-cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }');
  });
});
