import { act, cleanup, fireEvent, render as renderPlain, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { api } from '../erpApi';
import TenantCustomPage from '../TenantCustomPage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Liste kalıbı: kutu genişliğine göre yerleşim. jsdom `@container` değerlendirmez; JS kipinin sürdüğü davranış sınanır.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const codes = Array.from({ length: 20 }, (_, index) => `K${index + 1}`);
const manyRows = Array.from({ length: 25 }, (_, index) => Object.fromEntries(codes.map((code) => [code, `${code}-${index + 1}`])));
let definition: unknown;
let listRows: Record<string, unknown>[];
let listColumns: string[];

const queries = [
  { id: 'q_list', name: 'liste_sorgu', kind: 'read', runOn: 'load', sql: 'SELECT 1', parameters: [] },
  { id: 'q_ozet', name: 'ozet', kind: 'read', runOn: 'load', sql: 'SELECT 1 AS Toplam', parameters: [] },
  { id: 'q_sil', name: 'sil', kind: 'delete', sql: 'DELETE FROM X', parameters: [] },
];
const page = (tableProps: Record<string, unknown>, extra: unknown[] = []) => {
  definition = {
    schemaVersion: 2, template: { name: 'list' }, queries,
    components: [
      { id: 't1', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'q_list', title: 'Kayıtlar', columns: listColumns, ...tableProps } },
      { id: 'rs', type: 'button', props: { slot: 'rowActions', text: 'Satırı sil', actionType: 'query', queryId: 'q_sil' } },
      ...extra,
    ],
  };
};

// ResizeObserver taklidi: gözlenen öğeye istenen genişlik bildirilir.
const observers: { callback: ResizeObserverCallback; element: Element }[] = [];
class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(element: Element) { observers.push({ callback: this.callback, element }); }
  unobserve() {}
  disconnect() {}
}
const resizeTo = (width: number) => act(() => {
  for (const { callback, element } of observers) callback([{ contentRect: { width }, target: element } as unknown as ResizeObserverEntry], {} as ResizeObserver);
});

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  mockedApi.mockReset();
  listColumns = codes;
  listRows = manyRows.slice(0, 3);
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Kayıtlar', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } } as never;
    if (endpoint.includes('/queries/q_list/run')) return { columns: listColumns.map((code) => ({ code, label: code })), rows: listRows, rowCount: listRows.length, truncated: false } as never;
    if (endpoint.includes('/queries/q_ozet/run')) return { columns: [{ code: 'Toplam', label: 'Toplam' }], rows: [{ Toplam: 1 }], rowCount: 1, truncated: false } as never;
    return { items: [], total: 0 } as never;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;
const headers = (container: HTMLElement) => [...container.querySelectorAll('thead th')].map((th) => th.textContent);

describe('liste kalıbı kutu genişliği', () => {
  it('twenty columns at 600px show four and move row actions to menu', async () => {
    page({ rowActions: ['rs'] });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('K1-1', undefined, T);
    // Geniş kutuda 20 sütun ve satır düğmeleri açıktır.
    expect(headers(container).filter((text) => text?.startsWith('K'))).toHaveLength(20);
    expect(screen.getAllByRole('button', { name: 'Satırı sil' }).length).toBeGreaterThan(0);
    resizeTo(600);
    await waitFor(() => expect(headers(container).filter((text) => text?.startsWith('K'))).toEqual(['K1', 'K2', 'K3', 'K4']));
    expect(screen.queryByRole('button', { name: 'Satırı sil' })).toBeNull();
    const triggers = screen.getAllByRole('button', { name: 'Satır işlemleri' });
    expect(triggers).toHaveLength(3);
    fireEvent.click(triggers[0]);
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Satırı sil' })).toBeTruthy();
  });

  it('cards mode at 400px', async () => {
    listColumns = ['Ad', 'Şehir', 'Tür', 'Tutar'];
    listRows = [{ Ad: 'Ayşe Ltd', Şehir: 'Ankara', Tür: 'A', Tutar: 1250 }, { Ad: 'Mehmet AŞ', Şehir: 'İzmir', Tür: 'S', Tutar: 300 }];
    page({ columns: listColumns, rowActions: ['rs'], columnFormats: ['Tutar=money'] });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Ayşe Ltd', undefined, T);
    expect(container.querySelector('.list-cards')).toBeNull();
    resizeTo(400);
    await waitFor(() => expect(container.querySelectorAll('.list-card')).toHaveLength(2));
    expect(container.querySelector('table')).toBeNull();
    const card = container.querySelector('.list-card') as HTMLElement;
    expect(card.querySelector('.list-card-title')!.textContent).toBe('Ayşe Ltd');
    expect([...card.querySelectorAll('.list-card-sub')].map((node) => node.textContent)).toEqual(['Ankara', 'A']);
    expect(card.querySelector('.list-card-amount')!.textContent).toContain('1');
    expect(within(card).getByRole('button', { name: 'Satır işlemleri' })).toBeTruthy();
  });

  it('hideOnMobile hides the component in cards mode', async () => {
    page({}, [{ id: 'm1', type: 'metric', props: { slot: 'indicators', title: 'Toplam alacak', query: 'q_ozet', hideOnMobile: true } },
      { id: 'm2', type: 'metric', props: { slot: 'indicators', title: 'Açık belge', query: 'q_ozet' } }]);
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('K1-1', undefined, T);
    expect(container.querySelector('.list-template-indicators')!.textContent).toContain('Toplam alacak');
    resizeTo(600);
    await waitFor(() => expect(container.querySelector('.list-template-list')!.getAttribute('data-list-mode')).toBe('narrow'));
    expect(container.querySelector('.list-template-indicators')!.textContent).toContain('Toplam alacak');
    resizeTo(400);
    await waitFor(() => expect(container.querySelector('.list-template-indicators')!.textContent).not.toContain('Toplam alacak'));
    expect(container.querySelector('.list-template-indicators')!.textContent).toContain('Açık belge');
  });

  it('pageSize 10 without server paging shows 10 rows and a pager', async () => {
    listColumns = ['Ad'];
    listRows = Array.from({ length: 25 }, (_, index) => ({ Ad: `Kayıt ${String(index + 1).padStart(2, '0')}` }));
    page({ columns: listColumns, pageSize: 10 });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Kayıt 01', undefined, T);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.queryByText('Kayıt 11')).toBeNull();
    const footer = container.querySelector('.advanced-grid-footer') as HTMLElement;
    expect(footer.textContent).toContain('1–10');
    expect(footer.textContent).toContain('25');
    fireEvent.click(within(footer).getByRole('button', { name: 'Sonraki' }));
    await screen.findByText('Kayıt 11');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(screen.queryByText('Kayıt 01')).toBeNull();
  });

  it('page change clears the checkbox selection so bulk actions never reach other rows', async () => {
    listColumns = ['Ad'];
    listRows = Array.from({ length: 25 }, (_, index) => ({ Ad: `Kayıt ${String(index + 1).padStart(2, '0')}` }));
    page({ columns: listColumns, pageSize: 10 });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Kayıt 01', undefined, T);
    fireEvent.click(within(container.querySelectorAll('tbody tr')[0] as HTMLElement).getByRole('checkbox'));
    expect(container.querySelectorAll('tbody input[type=checkbox]:checked')).toHaveLength(1);
    fireEvent.click(within(container.querySelector('.advanced-grid-footer') as HTMLElement).getByRole('button', { name: 'Sonraki' }));
    await screen.findByText('Kayıt 11');
    expect(container.querySelectorAll('tbody input[type=checkbox]:checked')).toHaveLength(0);
    expect(screen.queryByText('Excel (seçilenler)')).toBeNull();
  });

  it('grid search runs over all rows before paging and shows the filtered count', async () => {
    listColumns = ['Ad'];
    listRows = Array.from({ length: 25 }, (_, index) => ({ Ad: `Kayıt ${String(index + 1).padStart(2, '0')}` }));
    page({ columns: listColumns, pageSize: 10 });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Kayıt 01', undefined, T);
    // Kayıt 22 ikinci sayfadadır; arama yalnız görünen sayfada değil tüm satırlarda çalışır.
    fireEvent.change(screen.getByPlaceholderText('Tüm sütunlarda ara'), { target: { value: 'Kayıt 22' } });
    await screen.findByText('Kayıt 22');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect((container.querySelector('.advanced-grid-footer') as HTMLElement).textContent).toContain('1–1');
  });

  it('card opens on a single tap and on Enter when rowOpenAction exists, with aria-selected', async () => {
    listColumns = ['Ad', 'Şehir'];
    listRows = [{ Ad: 'Ayşe Ltd', Şehir: 'Ankara' }, { Ad: 'Mehmet AŞ', Şehir: 'İzmir' }];
    page({ columns: listColumns, rowOpenAction: 'ac' }, [{ id: 'ac', type: 'button', props: { slot: 'rowActions', text: 'Aç', actionType: 'query', queryId: 'q_ozet' } }]);
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Ayşe Ltd', undefined, T);
    resizeTo(400);
    await waitFor(() => expect(container.querySelectorAll('.list-card')).toHaveLength(2));
    const runs = () => mockedApi.mock.calls.filter(([endpoint]) => String(endpoint).includes('/queries/q_ozet/run')).length;
    const cards = () => [...container.querySelectorAll('.list-card')] as HTMLElement[];
    const before = runs();
    fireEvent.click(cards()[0]);
    await waitFor(() => expect(runs()).toBeGreaterThan(before));
    await waitFor(() => expect(cards()[0].getAttribute('aria-selected')).toBe('true'));
    const mid = runs();
    fireEvent.keyDown(cards()[1], { key: 'Enter' });
    await waitFor(() => expect(runs()).toBeGreaterThan(mid));
    expect(cards()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('a table in the below slot stays full while the list is in cards mode', async () => {
    listColumns = ['Ad', 'Şehir'];
    listRows = [{ Ad: 'Ayşe Ltd', Şehir: 'Ankara' }];
    page({ columns: listColumns }, [{ id: 't2', type: 'dataTable', name: 'alt', props: { slot: 'below', query: 'q_list', title: 'Alt tablo', columns: listColumns } }]);
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findAllByText('Ayşe Ltd', undefined, T);
    resizeTo(400);
    await waitFor(() => expect(container.querySelector('.list-template-list .list-card')).toBeTruthy());
    expect(container.querySelector('.list-template-below table')).toBeTruthy();
    expect(container.querySelector('.list-template-below .list-card')).toBeNull();
  });

  it('measures the width before the first paint so a narrow box never draws the full table', async () => {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('list-template-list') ? ({ width: 400, height: 0, top: 0, left: 0, right: 400, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect) : original.call(this);
    });
    listColumns = ['Ad', 'Şehir'];
    listRows = [{ Ad: 'Ayşe Ltd', Şehir: 'Ankara' }];
    page({ columns: listColumns });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Ayşe Ltd', undefined, T);
    // Hiç ResizeObserver bildirimi gelmeden kart kipinde.
    expect(container.querySelector('.list-card')).toBeTruthy();
    expect(container.querySelector('.list-template-list')!.getAttribute('data-list-mode')).toBe('cards');
    vi.restoreAllMocks();
  });

  it('row menu renders outside the table, closes on Escape and returns focus to the trigger', async () => {
    page({ rowActions: ['rs'] });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('K1-1', undefined, T);
    resizeTo(600);
    const trigger = (await screen.findAllByRole('button', { name: 'Satır işlemleri' }))[0];
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('liste kalıbı tam genişlik', () => {
  it('kök ve liste kutusu tam genişlik sözleşmesini taşır', async () => {
    page({});
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('K1-1', undefined, T);
    // jsdom yerleşim ve CSS ızgara yerleşimi ölçemez; bu yüzden sınıf sözleşmesi ve CSS kuralı sınanır.
    // Kök eski 12 sütunlu `.tenant-custom-page-content` ızgarasının (dar ekranda `> *` span 6 kuralı) dışında çizilir; CSS yine de tam genişlik verir.
    const root = container.querySelector('.list-template') as HTMLElement;
    expect(root.closest('.tenant-custom-page-content')).toBeNull();
    expect(root.closest('.tenant-custom-page')).not.toBeNull();
    const listBox = container.querySelector('.list-template-list') as HTMLElement;
    expect(listBox).not.toBeNull();
    const css = readFileSync(resolve(__dirname, 'page-templates.css'), 'utf-8');
    const rule = (selector: string) => css.split("\n").find((line) => line.trimEnd().startsWith(`${selector} {`)) ?? '';
    expect(rule('.list-template')).toMatch(/grid-column:\s*1 \/ -1/);
    expect(rule('.list-template')).toMatch(/width:\s*100%/);
    expect(rule('.list-template')).toMatch(/min-width:\s*0/);
    expect(rule('.list-template-main')).toMatch(/width:\s*100%/);
    expect(rule('.list-template-list')).toMatch(/width:\s*100%/);
    expect(rule('.list-template-list')).toMatch(/min-width:\s*0/);
  });

  it('kabukta arama varken ızgara araç çubuğu aramayı çizmez; diğer araçlar kalır', async () => {
    page({}, [{ id: 'f1', type: 'filterBar', name: 'suzgec', props: { slot: 'filters', table: 't1', search: true, searchPlaceholder: 'Ara…', searchColumns: ['K1'] } }]);
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('K1-1', undefined, T);
    expect(container.querySelectorAll('.page-shell-bar-search input')).toHaveLength(1);
    expect(screen.queryByPlaceholderText('Tüm sütunlarda ara')).toBeNull();
    expect(screen.queryByLabelText('Tüm sütunlarda ara')).toBeNull();
    expect(screen.getByText('Sütun filtreleri')).toBeTruthy();
  });
});
