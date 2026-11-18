import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage, { PageBadge, QueryTable } from '../TenantCustomPage';
import { parseColumnFormats, parseToneMap } from './cellFormat';
import { PagedTableFooter } from './PagedTableFooter';
import type { QueryState } from './usePageQueries';

afterEach(cleanup);

const state = (rows: Record<string, unknown>[], columns: { code: string; label: string; dataType?: string }[], truncated = false): QueryState =>
  ({ rows, rowCount: rows.length, columns, truncated, loading: false, error: '', ran: true });

type TableOptions = { formats?: string[]; toneMap?: string[]; totals?: string[]; density?: 'dense' | 'comfort' };
const table = (s: QueryState, o: TableOptions = {}) => render(
  <QueryTable state={s} columns={[]} title="T" description="" style={{}}
    formats={parseColumnFormats(o.formats)} toneMap={parseToneMap(o.toneMap)} totals={o.totals ?? []} density={o.density ?? 'dense'} />,
);

describe('QueryTable biçimleri', () => {
  const statusCols = [{ code: 'Durum', label: 'Durum' }];

  it('status hücresi eşleşen değerde ton sınıfı alır', () => {
    const { container } = table(state([{ Durum: 'Aktif' }], statusCols), { formats: ['Durum=status'], toneMap: ['Aktif=success'] });
    const tag = container.querySelector('td .tenant-page-tag');
    expect(tag?.textContent).toBe('Aktif');
    expect(tag?.classList.contains('tone-success')).toBe(true);
  });

  it('eşleşmeyen status değeri nötr etiket olur', () => {
    const { container } = table(state([{ Durum: 'Beklemede' }], statusCols), { formats: ['Durum=status'], toneMap: ['Aktif=success'] });
    const tag = container.querySelector('td .tenant-page-tag');
    expect(tag?.textContent).toBe('Beklemede');
    expect(Array.from(tag!.classList).some((name) => name.startsWith('tone-'))).toBe(false);
  });

  it('money biçimi sayıyı yazar ve sağa hizalar', () => {
    const { container } = table(state([{ Tutar: 1234.5 }], [{ code: 'Tutar', label: 'Tutar' }]), { formats: ['Tutar=money'] });
    const cell = container.querySelector('tbody td')!;
    expect(cell.textContent).toBe('1.234,50');
    expect(cell.classList.contains('num')).toBe(true);
  });

  it('totals alt satırı yalnız sayısal değerleri toplar', () => {
    const { container } = table(state([{ Tutar: 10 }, { Tutar: 'x' }, { Tutar: 5.5 }], [{ code: 'Tutar', label: 'Tutar' }]), { totals: ['Tutar'] });
    const foot = container.querySelector('tfoot tr')!;
    expect(foot.textContent).toContain('15,5');
    const { container: other } = table(state([{ Tutar: 10 }, { Tutar: 'x' }, { Tutar: 5.5 }], [{ code: 'Ad', label: 'Ad' }, { code: 'Tutar', label: 'Tutar' }]), { totals: ['Tutar'] });
    const cells = other.querySelectorAll('tfoot td');
    expect(cells[0].textContent).toBe('Toplam · 3 kayıt');
    expect(cells[1].textContent).toBe('15,5');
  });

  it('toplamı olmayan totals sütununda tire gösterir', () => {
    const { container } = table(state([{ Ad: 'a', Tutar: 1 }], [{ code: 'Tutar', label: 'Tutar' }, { code: 'Ad', label: 'Ad' }]), { totals: ['Tutar', 'Ad'] });
    const cells = container.querySelectorAll('tfoot td');
    expect(cells[cells.length - 1].textContent).toBe('—');
    const { container: plain } = table(state([{ Ad: 'a', Tutar: 1 }], [{ code: 'Ad', label: 'Ad' }, { code: 'Tutar', label: 'Tutar' }, { code: 'Not', label: 'Not' }]), { totals: ['Tutar'] });
    expect(plain.querySelectorAll('tfoot td')[2].textContent).toBe('');
  });

  it('kesilmiş sonuçta toplam etiketi ilk satırları belirtir', () => {
    const { container } = table(state([{ Tutar: 1 }, { Tutar: 2 }, { Tutar: 3 }], [{ code: 'Ad', label: 'Ad' }, { code: 'Tutar', label: 'Tutar' }], true), { totals: ['Tutar'] });
    expect(container.querySelector('tfoot td')!.textContent).toBe('Toplam · ilk 3 satır');
  });

  it('totals yoksa alt satır çizilmez', () => {
    const { container } = table(state([{ Tutar: 1 }], [{ code: 'Tutar', label: 'Tutar' }]));
    expect(container.querySelector('tfoot')).toBeNull();
  });

  it('comfort yoğunluğu is-comfort sınıfı ekler', () => {
    const { container } = table(state([{ Durum: 'a' }], statusCols), { density: 'comfort' });
    expect(container.querySelector('table')!.classList.contains('is-comfort')).toBe(true);
    const { container: dense } = table(state([{ Durum: 'a' }], statusCols));
    expect(dense.querySelector('table')!.classList.contains('is-comfort')).toBe(false);
  });
});

describe('PageBadge', () => {
  it('toneMap eşleşmesi variant değerini geçer', () => {
    const { container } = render(<PageBadge text="pasif" variant="success" toneMap={['Pasif=danger']} />);
    expect(container.querySelector('.tenant-page-badge')!.classList.contains('tone-danger')).toBe(true);
  });
  it('eşleşme yoksa variant geri dönüş tonudur', () => {
    const { container } = render(<PageBadge text="Aktif" variant="success" toneMap={['Pasif=danger']} />);
    expect(container.querySelector('.tenant-page-badge')!.classList.contains('tone-success')).toBe(true);
  });
});

describe('QueryTable ek durumlar', () => {
  it('ilk sütun toplamlıysa etiket ve değer ayrı yazılır', () => {
    const { container } = table(state([{ Tutar: 10 }, { Tutar: 5.5 }], [{ code: 'Tutar', label: 'Tutar' }]), { totals: ['Tutar'] });
    expect(container.querySelector('tfoot .tenant-page-total-label')!.textContent).toBe('Toplam · 2 kayıt');
    expect(container.querySelector('tfoot span.num')!.textContent).toBe('15,5');
  });
  it('boş status değeri tire olur, etiket çizilmez', () => {
    const { container } = table(state([{ Durum: '' }], [{ code: 'Durum', label: 'Durum' }]), { formats: ['Durum=status'] });
    expect(container.querySelector('tbody td')!.textContent).toBe('—');
    expect(container.querySelector('.tenant-page-tag')).toBeNull();
  });
  it('money sütun başlığı sağa hizalanır', () => {
    const { container } = table(state([{ Tutar: 1 }], [{ code: 'Tutar', label: 'Tutar' }]), { formats: ['Tutar=money'] });
    expect(container.querySelector('th.num')).not.toBeNull();
  });
});

const { api, downloadXlsx } = vi.hoisted(() => ({ api: vi.fn(), downloadXlsx: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../general-ledger/ledgerReportUtils', () => ({ downloadXlsx }));

const pagedOp = {
  name: 'stok.bakiye.sayfa', label: 'Depo bakiyeleri', module: 'Stok', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/warehouses/balances/page',
  parameters: [
    { name: 'page', in: 'query', type: 'int', required: false },
    { name: 'pageSize', in: 'query', type: 'int', required: false },
    { name: 'search', in: 'query', type: 'text', required: false },
  ],
  result: { shape: 'list', rowsPath: 'items', columns: [{ code: 'kod', label: 'Kod', dataType: 'text' }, { code: 'miktar', label: 'Miktar', dataType: 'decimal' }],
    flatten: [], metaPaths: ['page', 'pageSize', 'totalCount', 'belowMinimumCount'] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
};
const pagedQuery = {
  id: 'q', name: 'bakiye', kind: 'read', runOn: 'load', operation: 'stok.bakiye.sayfa', parameters: [
    { name: 'page', binding: '{{liste.sayfa}}', type: 'int' },
    { name: 'pageSize', binding: '{{liste.sayfaBoyutu}}', type: 'int' },
    { name: 'search', binding: '{{arama.value}}', type: 'text' },
  ],
};
const searchInput = { id: 'ara', type: 'input', name: 'arama', props: { inputType: 'text', label: 'Ara' } };
const pagedTable = (props: Record<string, unknown> = {}) => ({
  id: 't', type: 'dataTable', name: 'liste',
  props: { query: 'q', title: 'Bakiyeler', paging: 'server', searchInput: 'ara', footerMeta: ['belowMinimumCount=Minimum altı'], totals: ['miktar'], ...props },
});

let urls: string[] = [];
let shrunkTotal: number | null = null;
let hold: ((url: string) => boolean) | null = null;
let held: (() => void)[] = [];

const pageResponse = (url: string) => {
  const params = new URL(url, 'http://x').searchParams;
  const page = Number(params.get('page') ?? '1');
  const size = Number(params.get('pageSize') ?? '25');
  const search = params.get('search') ?? '';
  const total = search ? 3 : shrunkTotal ?? 340;
  const count = Math.max(0, Math.min(size, total - (page - 1) * size));
  return {
    items: Array.from({ length: count }, (_, index) => ({ kod: `${search || 'P'}${page}-${index + 1}`, miktar: 1 })),
    page, pageSize: size, totalCount: total, belowMinimumCount: 7,
  };
};

function setupPaged(components: unknown[]) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries: [pagedQuery] }),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [pagedOp] };
    urls.push(endpoint);
    if (hold?.(endpoint)) return new Promise((resolve) => { held.push(() => resolve(pageResponse(endpoint))); });
    return pageResponse(endpoint);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    </CommandProvider>,
  );
}

const firstCell = () => document.querySelector('.tenant-page-table tbody td')?.textContent;
const pagerRange = () => document.querySelector('.tenant-page-pager-range')?.textContent;

describe('Sunucu sayfalı liste', () => {
  beforeEach(() => { urls = []; shrunkTotal = null; hold = null; held = []; api.mockReset(); downloadXlsx.mockReset(); });

  it('server paged table sends page and pageSize', async () => {
    setupPaged([searchInput, pagedTable({ pageSize: 10 })]);
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    expect(urls).toEqual(['/api/warehouses/balances/page?page=1&pageSize=10']);
    // Arama girişi liste başlığında çizilir, üst düzeyde ayrıca çizilmez.
    expect(screen.getAllByLabelText('Ara')).toHaveLength(1);
    expect(document.querySelector('.tenant-page-table .tenant-page-table-search input')).not.toBeNull();
  });

  it('footer shows range and total', async () => {
    setupPaged([searchInput, pagedTable()]);
    await waitFor(() => expect(pagerRange()).toBe('1–25 / 340'));
    expect(screen.getByText('Sayfa 1 / 14')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Önceki' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await waitFor(() => expect(firstCell()).toBe('P2-1'));
    expect(pagerRange()).toBe('26–50 / 340');
    expect(screen.getByText('Sayfa 2 / 14')).toBeTruthy();
    expect(urls.at(-1)).toBe('/api/warehouses/balances/page?page=2&pageSize=25');
    expect(document.querySelector('tfoot td')!.textContent).toBe('Sayfa toplamı · 25 kayıt');
  });

  it('search resets page and drops stale page', async () => {
    setupPaged([searchInput, pagedTable()]);
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    hold = (url) => url.includes('page=5');
    for (let click = 0; click < 4; click += 1) fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(screen.getByText('Sayfa 5 / 14')).toBeTruthy();
    await waitFor(() => expect(held).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'x' } });
    await waitFor(() => expect(firstCell()).toBe('x1-1'));
    expect(urls.at(-1)).toBe('/api/warehouses/balances/page?page=1&pageSize=25&search=x');
    // Sayfa 5 yanıtı en son gelir ve düşürülür.
    await act(async () => { held.forEach((release) => release()); await Promise.resolve(); });
    expect(firstCell()).toBe('x1-1');
    expect(pagerRange()).toBe('1–3 / 3');
    expect(screen.getByText('Sayfa 1 / 1')).toBeTruthy();
    // Arama silinince eski anahtara dönülse de sayfa 1 kalır.
    hold = null;
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: '' } });
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    expect(urls.at(-1)).toBe('/api/warehouses/balances/page?page=1&pageSize=25');
  });

  it('footerMeta renders meta values', async () => {
    setupPaged([searchInput, pagedTable()]);
    await waitFor(() => expect(screen.getByText('Minimum altı: 7')).toBeTruthy());
  });

  it('no truncation notice for paged table', async () => {
    setupPaged([searchInput, pagedTable()]);
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    expect(screen.queryByText('İlk 5.000 satır gösteriliyor.')).toBeNull();
  });

  it('clamps to the last page when the total shrinks and re-runs', async () => {
    setupPaged([searchInput, pagedTable({ pageSize: 100 })]);
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    for (let click = 0; click < 2; click += 1) fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await waitFor(() => expect(firstCell()).toBe('P3-1'));
    // Kayıtlar başka yerde silindi: sayfa 4 isteği 150 toplamla boş döner; son sayfaya (2) geçilir ve sorgu yeniden çalışır.
    shrunkTotal = 150;
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    await waitFor(() => expect(firstCell()).toBe('P2-1'));
    expect(urls.at(-1)).toBe('/api/warehouses/balances/page?page=2&pageSize=100');
    expect(pagerRange()).toBe('101–150 / 150');
    expect(screen.getByText('Sayfa 2 / 2')).toBeTruthy();
    cleanup();
    const onPage = vi.fn();
    const { container } = render(<PagedTableFooter page={4} pageSize={100} total={150} meta={[]} onPage={onPage} />);
    expect(container.querySelector('.tenant-page-pager-range')!.textContent).toBe('Son sayfaya geçiliyor…');
    expect(within(container as HTMLElement).getByText('Sayfa 2 / 2')).toBeTruthy();
    expect(onPage).toHaveBeenCalledWith(2);
    // Yüklenirken (eski toplamla) sayfa değiştirilmez.
    const waiting = vi.fn();
    render(<PagedTableFooter page={4} pageSize={100} total={150} meta={[]} onPage={waiting} loading />);
    expect(waiting).not.toHaveBeenCalled();
    // Toplam sıfıra inerse sayfa 1'e dönülür.
    const empty = vi.fn();
    render(<PagedTableFooter page={3} pageSize={25} total={0} meta={[]} onPage={empty} />);
    expect(empty).toHaveBeenCalledWith(1);
  });

  it('empty paged result reads 0 / 0', () => {
    const { container } = render(<QueryTable state={state([], [{ code: 'kod', label: 'Kod' }], true)} columns={[]} title="T" description="" style={{}}
      paging={{ page: 1, pageSize: 25, meta: [], onPage: () => undefined }} />);
    expect(container.querySelector('.tenant-page-pager-range')!.textContent).toBe('0 / 0');
    expect(container.querySelector('.tenant-page-truncated')).toBeNull();
  });

  it('export of a paged table reports the visible page only', async () => {
    setupPaged([searchInput, pagedTable(), { id: 'bar', type: 'actionBar', props: { exportTable: 't' } }]);
    await waitFor(() => expect(firstCell()).toBe('P1-1'));
    const exportButton = screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>('[data-command="export"]')!;
    await waitFor(() => expect(exportButton.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(exportButton);
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.tenant-page-action-status.is-warning')?.textContent).toBe('Yalnız görünen sayfa aktarıldı (25 satır).'));
  });
});
