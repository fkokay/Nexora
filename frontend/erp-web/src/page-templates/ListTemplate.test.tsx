import { cleanup, fireEvent, render as renderPlain, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { api } from '../erpApi';
import TenantCustomPage from '../TenantCustomPage';

// Liste kalıbı: bileşenler `slot`'larına göre ortak kabuk içinde yerleşir; işlem düğmeleri kabuğun çubuğuna taşınır.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

const baseQueries = [
  { id: 'q_list', name: 'cariler', kind: 'read', runOn: 'load', sql: 'SELECT Code, Name, Type FROM CustomerAccounts', parameters: [] },
  { id: 'q_ozet', name: 'ozet', kind: 'read', runOn: 'load', sql: 'SELECT 1 AS Toplam', parameters: [] },
  { id: 'q_ekle', name: 'ekle', kind: 'insert', sql: 'INSERT INTO X DEFAULT VALUES', parameters: [] },
  { id: 'q_sil', name: 'sil', kind: 'delete', sql: 'DELETE FROM X WHERE Code = @code', parameters: [{ name: 'code', binding: '{{liste.seciliSatir.Code}}', type: 'text' }] },
];
const components = [
  { id: 'sil', type: 'button', props: { slot: 'actions', text: 'Sil', actionType: 'query', queryId: 'q_sil' } },
  { id: 'm1', type: 'metric', props: { slot: 'indicators', title: 'Toplam alacak', query: 'q_ozet' } },
  { id: 'f1', type: 'filterBar', name: 'suzgec', props: { slot: 'filters', table: 't1', search: true, searchPlaceholder: 'Kod ile ara', searchColumns: ['Code'], filters: ['Type|select|row|tur|Tür'] } },
  { id: 't1', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'q_list', title: 'Cariler', columns: ['Code', 'Name'], striped: true } },
  { id: 'yeni', type: 'button', props: { slot: 'actions', text: 'Yeni', actionType: 'query', queryId: 'q_ekle' } },
  { id: 'yenile', type: 'button', props: { slot: 'actions', text: 'Yenile', actionType: 'query', queryId: 'q_list' } },
  { id: 'd1', type: 'contextPanel', props: { slot: 'detail', title: 'Cari detayı', fields: ['Code=Kod', 'Name=Ad'] } },
];
const rows = [{ Code: 'C001', Name: 'Ayşe Ltd', Type: 'A' }, { Code: 'C002', Name: 'Mehmet AŞ', Type: 'S' }, { Code: 'X003', Name: 'Ayten Tic', Type: 'A' }];

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
let definition: unknown;
let rights: Record<string, boolean>;
const page = (queries: unknown[], list: unknown[] = components) => { definition = { schemaVersion: 2, template: { name: 'list' }, queries, components: list }; };
const runs = (id: string) => mockedApi.mock.calls.filter(([endpoint]) => String(endpoint).includes(`/queries/${id}/run`)).length;

beforeEach(() => {
  localStorage.clear();
  mockedApi.mockReset();
  page(baseQueries);
  rights = { view: true, insert: true, update: true, delete: true };
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari Hesaplar', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights } as never;
    if (endpoint.includes('/queries/q_list/run')) return { columns: [{ code: 'Code', label: 'Kod' }, { code: 'Name', label: 'Ad' }, { code: 'Type', label: 'Tür' }], rows, rowCount: rows.length, truncated: false } as never;
    if (endpoint.includes('/queries/q_sil/run')) return { affectedRows: 1 } as never;
    if (endpoint.includes('/workflows/definitions/')) return { id: 'w1' } as never;
    if (endpoint.includes('/queries/q_ozet/run')) return { columns: [{ code: 'Toplam', label: 'Toplam' }], rows: [{ Toplam: 1 }], rowCount: 1, truncated: false } as never;
    return { items: [], total: 0 } as never;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };

describe('liste kalıbı', () => {
  it('list template renders shell with primary action left and delete right', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('C001', undefined, T);
    expect(screen.getByRole('heading', { name: 'Cari Hesaplar' })).toBeTruthy();
    // Eski üst bilgi (h1) çizilmez; başlık kabuğundur.
    expect(container.querySelector('.tenant-custom-page-header')).toBeNull();
    // Kayıt sayısı tablonun satır sayısıdır.
    await waitFor(() => expect(container.querySelector('.page-shell')!.textContent).toContain('3'));
    const left = container.querySelector('.page-shell-bar-left')!;
    const right = container.querySelector('.page-shell-bar-right')!;
    expect([...left.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Yeni', 'Yenile']);
    expect(left.querySelector('button')!.className).toContain('page-shell-action--primary');
    expect([...right.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Sil']);
    expect(right.querySelector('button')!.className).toContain('page-shell-action--danger');
    // Düğmeler gövdede ikinci kez çizilmez.
    expect(container.querySelectorAll('.page-shell-body .tenant-page-button')).toHaveLength(0);
    // Arama kabuğun ortasında; öteki süzgeçler göstergelerin altında kalır.
    const search = container.querySelector('.page-shell-bar-search')!;
    expect(within(search as HTMLElement).getByPlaceholderText('Kod ile ara')).toBeTruthy();
    const filters = container.querySelector('.list-template-filters')!;
    expect(within(filters as HTMLElement).queryByPlaceholderText('Kod ile ara')).toBeNull();
    expect(within(filters as HTMLElement).getByLabelText('Tür')).toBeTruthy();
    const body = container.querySelector('.page-shell-body')!;
    expect([...body.children].map((child) => child.className)).toEqual(['list-template-indicators', 'list-template-filters', 'list-template-main']);
    expect(container.querySelector('.list-template-list')!.classList.contains('is-striped')).toBe(true);
    // Kabuktaki düğme sayfa düğmesiyle aynı yoldan çalışır: okuma sorgusu yeniden çalışır.
    const before = runs('q_list');
    fireEvent.click(within(left as HTMLElement).getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(runs('q_list')).toBeGreaterThan(before));
    // Arama kutusu tabloyu süzer.
    fireEvent.change(within(search as HTMLElement).getByPlaceholderText('Kod ile ara'), { target: { value: 'X0' } });
    await waitFor(() => expect(screen.queryByText('C001')).toBeNull());
    expect(screen.getByText('X003')).toBeTruthy();
  });

  it('selecting a row opens the detail panel on the right', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    const cell = await screen.findByText('C001', undefined, T);
    expect(container.querySelector('.list-template-detail')).toBeNull();
    fireEvent.click(cell.closest('tr')!);
    const main = container.querySelector('.list-template-main')!;
    await waitFor(() => expect(main.querySelector('.list-template-detail')).toBeTruthy());
    expect([...main.children].map((child) => child.className.split(' ')[0])).toEqual(['list-template-list', 'list-template-detail']);
    const detail = main.querySelector('.list-template-detail') as HTMLElement;
    expect(within(detail).getByRole('heading', { name: 'Cari detayı' })).toBeTruthy();
    expect(within(detail).getByText('Ayşe Ltd')).toBeTruthy();
  });

  it('catalog error shows in the list area while indicators still render', async () => {
    page(baseQueries.map((query) => (query.id === 'q_list' ? { ...query, catalogError: 'Bu veri kaynağı katalogda yok.' } : query)));
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Bu veri kaynağı katalogda yok.', undefined, T);
    const list = container.querySelector('.list-template-list')!;
    expect(list.textContent).toContain('Bu veri kaynağı katalogda yok.');
    expect(container.querySelector('.list-template-indicators')!.textContent).toContain('Toplam alacak');
    expect(screen.getByRole('heading', { name: 'Cari Hesaplar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeni' })).toBeTruthy();
    expect(runs('q_list')).toBe(0);
  });

  it('double click with no rowOpenAction does nothing', async () => {
    const opened = vi.fn();
    window.addEventListener('nexora:open-page', opened);
    try {
      const { container } = render(<TenantCustomPage code="p" token="t" />);
      const cell = await screen.findByText('C001', undefined, T);
      const calls = mockedApi.mock.calls.length;
      fireEvent.doubleClick(cell.closest('tr')!);
      await new Promise((done) => setTimeout(done, 50));
      expect(mockedApi.mock.calls.length).toBe(calls);
      expect(opened).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(container.querySelector('.page-shell')).toBeTruthy();
    } finally { window.removeEventListener('nexora:open-page', opened); }
  });

  it('anchors are emitted for every slotted component', async () => {
    const { container } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    await screen.findByText('C001', undefined, T);
    const anchors = [...container.querySelectorAll('template[data-cp-anchor]')].map((anchor) => anchor.getAttribute('data-cp-anchor'));
    expect(new Set(anchors)).toEqual(new Set(['sil', 'm1', 'f1', 't1', 'yeni', 'yenile', 'd1']));
    // Her işaret çizilen öğesinin hemen önündedir (tuval `nextElementSibling`'i ölçer).
    for (const anchor of container.querySelectorAll('template[data-cp-anchor]')) expect(anchor.nextElementSibling).toBeTruthy();
    const yeni = container.querySelector('template[data-cp-anchor="yeni"]')!;
    expect(yeni.nextElementSibling!.textContent).toBe('Yeni');
  });

  it('primary is the first allowed non-delete button and never goes to the overflow menu', async () => {
    rights = { view: true, update: true, delete: true };
    vi.stubGlobal('ResizeObserver', class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 60 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('C001', undefined, T);
    // Ekleme hakkı yok: "Yeni" gizlenir, ana düğme "Yenile" olur.
    expect(screen.queryByRole('button', { name: 'Yeni' })).toBeNull();
    const primary = container.querySelector('.page-shell-bar-left button')!;
    expect(primary.textContent).toBe('Yenile');
    expect(primary.className).toContain('page-shell-action--primary');
    fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Sil']);
  });

  it('workflow button in actions starts the workflow', async () => {
    page(baseQueries, [...components, { id: 'onay', type: 'button', props: { slot: 'actions', text: 'Onaya gönder', actionType: 'workflow', workflowId: 'wf1' } }]);
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('C001', undefined, T);
    const button = screen.getByRole('button', { name: 'Onaya gönder' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(mockedApi.mock.calls.some(([endpoint]) => String(endpoint) === '/api/workflows/definitions/wf1/instances')).toBe(true));
    const call = mockedApi.mock.calls.find(([endpoint]) => String(endpoint) === '/api/workflows/definitions/wf1/instances')!;
    expect(JSON.parse(String((call[2] as RequestInit).body)).context).toEqual({ pageCode: 'p', componentId: 'onay', action: 'low-code-button' });
    expect(await screen.findByText('İş akışı başlatıldı.')).toBeTruthy();
  });

  it('delete with confirm goes through confirm, write, success status and list refresh', async () => {
    page(baseQueries, components.map((component) => (component.id === 'sil'
      ? { ...component, props: { ...component.props, confirmEnabled: true, confirmText: '{{liste.seciliSatir.Code}} silinsin mi?', refreshQueries: ['q_list'] } } : component)));
    render(<><TenantCustomPage code="p" token="t" /><ConfirmDialogHost /></>);
    fireEvent.click((await screen.findByText('C001', undefined, T)).closest('tr')!);
    const before = runs('q_list');
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('C001 silinsin mi?')).toBeTruthy();
    expect(runs('q_sil')).toBe(0);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(runs('q_sil')).toBe(1));
    const call = mockedApi.mock.calls.find(([endpoint]) => String(endpoint).includes('/queries/q_sil/run'))!;
    expect(JSON.parse(String((call[2] as RequestInit).body)).parameters).toEqual({ code: 'C001' });
    await waitFor(() => expect(document.querySelector('.tenant-page-action-status.is-success')?.textContent).toBe('İşlem tamamlandı. (1 kayıt)'));
    await waitFor(() => expect(runs('q_list')).toBeGreaterThan(before));
  });

  it('legacy page workflow button still starts the workflow through the shared start path', async () => {
    definition = { schemaVersion: 2, queries: [], components: [{ id: 'onay', type: 'button', props: { text: 'Onaya gönder', actionType: 'workflow', workflowId: 'wf1' } }] };
    render(<TenantCustomPage code="p" token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Onaya gönder' }, T));
    expect(await screen.findByText('İş akışı başlatıldı.')).toBeTruthy();
    expect(mockedApi.mock.calls.filter(([endpoint]) => String(endpoint) === '/api/workflows/definitions/wf1/instances')).toHaveLength(1);
  });
});
