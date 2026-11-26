import { act, cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { api } from '../erpApi';
import { setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { freeComponents, freeDefinition } from './freeTemplateFixture';

// Serbest gövde: bölüm kolonları bölümün kendi kutusuna göre azalır (Kayıt kartıyla aynı eşikler); `hideOnMobile` dar kipte
// (kutu ≤ 480 px) bölümü ve üyeyi gizler. jsdom `@container` değerlendirmez; JS'in ölçtüğü değerler sınanır.

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
const resize = (selector: string, width: number) => act(() => {
  for (const { callback, element } of observers) {
    if (element.matches(selector)) callback([{ contentRect: { width }, target: element } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  }
});
const publish = (components: unknown[]) => mockedApi.mockImplementation(async (endpoint: string) => {
  if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Satış panosu', revision: 1, forms: [], definitionJson: JSON.stringify(freeDefinition(components)), rights: { view: true, insert: true, update: true, delete: true } } as never;
  if (endpoint.includes('/queries/liste/run')) return { columns: [{ code: 'Belge', label: 'Belge' }], rows: [{ Belge: 'TK-1042' }], rowCount: 1, truncated: false } as never;
  return { columns: [], rows: [], rowCount: 0, truncated: false } as never;
});

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  mockedApi.mockReset();
  publish(freeComponents);
});
afterEach(() => { cleanup(); setPageParams('custom-page:p', {}); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };

describe('serbest gövde kutu genişliği', () => {
  it('three-column block shows 2 columns at 600px and 1 at 400px', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('TK-1042', undefined, T);
    const section = container.querySelector('.free-section')!;
    expect(section.getAttribute('data-cols')).toBe('3');
    resize('.free-section', 900);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('3'));
    resize('.free-section', 600);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('2'));
    resize('.free-section', 400);
    await waitFor(() => expect(section.getAttribute('data-cols')).toBe('1'));
    // Liste her genişlikte tam satırdır.
    expect(screen.getByText('TK-1042').closest('.free-cell')!.className).toContain('is-full');
    const css = readFileSync(resolve(process.cwd(), 'src/page-templates/page-templates.css'), 'utf8');
    expect(css).toMatch(/\.free-template-page \.free-section\s*\{[^}]*container-type:\s*inline-size/);
    expect(css).toMatch(/@container[^{]*\(max-width:\s*720px\)\s*\{\s*\.free-template-page/);
    expect(css).toMatch(/@container[^{]*\(max-width:\s*480px\)\s*\{\s*\.free-template-page/);
    // Serbest gövde kuralları başka yere sızmaz.
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{]+\{/g, '').split('}').map((rule) => rule.split('{')[0].trim()).filter(Boolean);
    for (const selector of selectors.filter((item) => /free-/.test(item))) {
      for (const part of selector.split(/,(?![^(]*\))/)) expect(part.trim().startsWith('.free-template-page')).toBe(true);
    }
  });

  it('hideOnMobile block and member are hidden in narrow mode', async () => {
    publish([
      ...freeComponents.map((component) => component.id === 'm_gosterge' ? { ...component, props: { ...component.props, hideOnMobile: true } } : component),
      { id: 'blk3', type: 'section', props: { slot: 'block', title: 'Masaüstü bölümü', hideOnMobile: true, members: ['m_not'] } },
      { id: 'm_not', type: 'text', props: { slot: 'item', text: 'Yalnız geniş ekranda' } },
    ]);
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('TK-1042', undefined, T);
    expect(screen.getByText('Açık teklif')).toBeTruthy();
    expect(screen.getByText('Yalnız geniş ekranda')).toBeTruthy();
    resize('.free-template-body, .free-section', 600);
    await waitFor(() => expect(container.querySelector('.free-section')!.getAttribute('data-cols')).toBe('2'));
    expect(screen.getByText('Açık teklif')).toBeTruthy();
    expect(screen.getByText('Yalnız geniş ekranda')).toBeTruthy();
    resize('.free-template-body, .free-section', 400);
    await waitFor(() => expect(screen.queryByText('Açık teklif')).toBeNull());
    expect(screen.queryByText('Yalnız geniş ekranda')).toBeNull();
    expect(screen.queryByText('Masaüstü bölümü')).toBeNull();
    // Gizlenmeyenler kalır.
    expect(screen.getByText('Merhaba serbest gövde')).toBeTruthy();
    expect(screen.getByText('TK-1042')).toBeTruthy();
    resize('.free-template-body, .free-section', 900);
    await waitFor(() => expect(screen.getByText('Açık teklif')).toBeTruthy());
    expect(screen.getByText('Yalnız geniş ekranda')).toBeTruthy();
  });
});
