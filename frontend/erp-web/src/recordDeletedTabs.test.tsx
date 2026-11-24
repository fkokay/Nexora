import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceTabs } from './useWorkspaceTabs';
import { api } from './erpApi';
import {
  deletedRecordIdFromUrl, openWorkspacePage, publishRecordsDeleted, RECORDS_DELETED_EVENT, setPageParams, tabRecordIds, useTabRecord,
  type RecordsDeletedDetail,
} from './pageNavigation';
import { deletedRecordIds } from './custom-page/deletedRecords';
import type { PageQueryDefinition } from './custom-page/usePageQueries';

// Silinen kaydın kart sekmesi kendiliğinden kapanır: olay (sistem sayfası silmesi ya da eski ekranın DELETE isteği) ve sekme kapanışı.

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';
const PAGES = ['customers', 'customer-create', 'inventory-stock', 'inventory-stock-create', 'crm-opportunity-create', 'crm-opportunities',
  'hr-employee-create', 'finance-account-create', 'reports'];

function workspace() {
  return renderHook(() => useWorkspaceTabs({
    standaloneStudio: false, embeddedStudioTool: false, tenantId: undefined, platformSession: false, locale: 'tr', pageResults: [],
    onSelectModule: () => {},
  }));
}
type Workspace = ReturnType<typeof workspace>['result'];
const open = (result: Workspace, page: string, params: Record<string, string> = {}) => act(() => {
  setPageParams(page, params);
  result.current.setPage(page);
});
const tabIds = (result: Workspace) => result.current.moduleTabs.map((tab) => tab.id);
const deleted = (detail: RecordsDeletedDetail) => act(() => { publishRecordsDeleted(detail); });

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const page of PAGES) setPageParams(page, {});
});

describe('silinen kaydın kart sekmesi', () => {
  it('a single delete closes the card tab that shows the record; the deleting list tab stays', () => {
    const { result } = workspace();
    open(result, 'customers');
    open(result, 'customer-create', { customerId: A });
    act(() => result.current.setPage('customers'));
    deleted({ ids: [A], from: 'customers' });
    expect(tabIds(result)).toEqual(['customers']);
    expect(result.current.page).toBe('customers');
  });

  it('a bulk delete closes every card of the deleted records and leaves unrelated tabs and their params alone', () => {
    const { result } = workspace();
    open(result, 'inventory-stock');
    open(result, 'inventory-stock-create', { id: A });
    open(result, 'crm-opportunity-create', { opportunityId: B });
    open(result, 'customer-create', { customerId: C });
    open(result, 'reports');
    act(() => result.current.setPage('inventory-stock'));
    // Toplu silme satır başına bir olay yayımlar; ikisi aynı çizimden önce gelebilir.
    act(() => {
      publishRecordsDeleted({ ids: [A], from: 'inventory-stock' });
      publishRecordsDeleted({ ids: [B], from: 'inventory-stock' });
    });
    expect(tabIds(result)).toEqual(['inventory-stock', 'customer-create', 'reports']);
    expect(tabRecordIds('customer-create')).toEqual(new Set([C]));
    // Kapanan sekme parametresini unutur: menüden yeniden açılınca yeni kart olarak başlar.
    expect(tabRecordIds('inventory-stock-create').size).toBe(0);
  });

  it('one event with several ids closes all their cards', () => {
    const { result } = workspace();
    open(result, 'customers');
    open(result, 'customer-create', { customerId: A });
    open(result, 'crm-opportunity-create', { opportunityId: B });
    act(() => result.current.setPage('customers'));
    deleted({ ids: [A, B], from: 'customers' });
    expect(tabIds(result)).toEqual(['customers']);
  });

  it('a delete matching nothing closes nothing; non-GUID params never match', () => {
    const { result } = workspace();
    open(result, 'finance-account-create', { accountType: 'Bank' });
    open(result, 'customer-create', { customerId: A });
    deleted({ ids: [B], from: 'reports' });
    deleted({ ids: ['Bank'], from: 'reports' });
    expect(tabIds(result)).toEqual(['finance-account-create', 'customer-create']);
  });

  it('an active card tab that closes hands over to the tab that opened it, else to the last tab', () => {
    const { result } = workspace();
    open(result, 'customers');
    open(result, 'reports');
    act(() => result.current.setPage('customers'));
    act(() => openWorkspacePage({ page: 'customer-create', params: { customerId: A }, replace: false, from: 'customers' }));
    act(() => result.current.setPage('customer-create'));
    expect(tabIds(result)).toEqual(['customers', 'reports', 'customer-create']);
    // Kartın kendi "Sil" komutu: silen sekme kaydı gösterdiği için kapanır, açan liste etkinleşir.
    deleted({ ids: [A], from: 'customer-create', closeSource: true });
    expect(tabIds(result)).toEqual(['customers', 'reports']);
    expect(result.current.page).toBe('customers');

    open(result, 'inventory-stock-create', { id: B });
    deleted({ ids: [B], from: 'inventory-stock-create', closeSource: true });
    expect(tabIds(result)).toEqual(['customers', 'reports']);
    expect(result.current.page).toBe('reports');
  });

  it('the deleting tab stays open when it only deleted a line (no closeSource), even if it shows a matching id', () => {
    const { result } = workspace();
    open(result, 'customer-create', { customerId: A });
    deleted({ ids: [A], from: 'customer-create' });
    expect(tabIds(result)).toEqual(['customer-create']);
  });

  it('a dirty card of a deleted record closes without the unsaved-changes prompt and loses its dirty mark', () => {
    const { result } = workspace();
    open(result, 'customers');
    open(result, 'customer-create', { customerId: A });
    act(() => result.current.setDirtyTabs(new Set(['customer-create'])));
    act(() => result.current.setPage('customers'));
    deleted({ ids: [A] });
    expect(tabIds(result)).toEqual(['customers']);
    expect(result.current.pendingCloseTab).toBeNull();
    expect(result.current.dirtyTabs.has('customer-create')).toBe(false);
  });

  it('a card that consumed its param reports its record (useTabRecord) and still closes', () => {
    const { result } = workspace();
    open(result, 'finance-account-create');
    open(result, 'reports');
    const card = renderHook(({ id }) => useTabRecord('finance-account-create', id), { initialProps: { id: A } });
    deleted({ ids: [A], from: 'reports' });
    expect(tabIds(result)).toEqual(['reports']);
    card.unmount();
    expect(tabRecordIds('finance-account-create').size).toBe(0);
  });
});

describe('eski ekran silmeleri (DELETE isteği)', () => {
  const stubFetch = (status: number) => {
    const fetch = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify({ error: 'x' }), { status }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it('a successful stock card DELETE closes its card tab while the deleting list tab stays active', async () => {
    stubFetch(204);
    const { result } = workspace();
    open(result, 'inventory-stock');
    open(result, 'inventory-stock-create', { id: A });
    act(() => result.current.setPage('inventory-stock'));
    await act(async () => { await api(`/api/stock/items/${A}`, 't', { method: 'DELETE' }); });
    await waitFor(() => expect(tabIds(result)).toEqual(['inventory-stock']));
    expect(result.current.page).toBe('inventory-stock');
  });

  it('CRM opportunity and customer (system page ERP operation) DELETEs close their cards', async () => {
    stubFetch(204);
    const { result } = workspace();
    open(result, 'crm-opportunity-create', { opportunityId: A });
    open(result, 'customer-create', { customerId: B });
    open(result, 'crm-opportunities');
    await act(async () => { await api(`/api/crm/opportunities/${A}`, 't', { method: 'DELETE' }); });
    await waitFor(() => expect(tabIds(result)).toEqual(['customer-create', 'crm-opportunities']));
    await act(async () => { await api(`/api/customers/${B}`, 't', { method: 'DELETE' }); });
    await waitFor(() => expect(tabIds(result)).toEqual(['crm-opportunities']));
  });

  it('a failed DELETE and a sub-record DELETE close nothing', async () => {
    const { result } = workspace();
    open(result, 'inventory-stock-create', { id: A });
    open(result, 'inventory-stock');
    const events: RecordsDeletedDetail[] = [];
    const listen = (event: Event) => events.push((event as CustomEvent<RecordsDeletedDetail>).detail);
    window.addEventListener(RECORDS_DELETED_EVENT, listen);
    try {
      stubFetch(409);
      await act(async () => { await api(`/api/stock/items/${A}`, 't', { method: 'DELETE' }).catch(() => undefined); });
      stubFetch(204);
      await act(async () => { await api(`/api/stock/items/${A}/units/${C}`, 't', { method: 'DELETE' }); });
      await waitFor(() => expect(events).toEqual([{ ids: [C] }]));
    } finally {
      window.removeEventListener(RECORDS_DELETED_EVENT, listen);
    }
    expect(tabIds(result)).toEqual(['inventory-stock-create', 'inventory-stock']);
  });

  it('reads the deleted record id from the last path segment only', () => {
    expect(deletedRecordIdFromUrl(`/api/stock/items/${A.toUpperCase()}?force=true`)).toBe(A);
    expect(deletedRecordIdFromUrl('/api/customer-groups/abc')).toBeNull();
    expect(deletedRecordIdFromUrl(`/api/stock/items/${A}/units/${C}`)).toBe(C);
  });
});

describe('sayfa motoru silme sorgusunun kimliği', () => {
  const query = (parameters: [string, string][], kind: PageQueryDefinition['kind'] = 'delete'): PageQueryDefinition =>
    ({ id: 'q', name: 'sil', runOn: 'manual', kind, parameters: parameters.map(([name, binding]) => ({ name, binding, type: 'guid' })) });

  it('takes the id param or the param bound to a row/record id', () => {
    expect(deletedRecordIds(query([['id', '{{liste.seciliSatir.id}}']]), { id: A })).toEqual([A]);
    expect(deletedRecordIds(query([['kayit', '{{liste.seciliSatir.id}}'], ['belge', '{{belge.value}}']]), { kayit: A, belge: B })).toEqual([A]);
  });

  it('a card line delete publishes the line id, not the card record bound from the page; non-deletes never publish', () => {
    const line = query([['documentId', '{{sayfa.parametre.id}}'], ['lineId', '{{kalemler.seciliSatir.lineId}}']]);
    expect(deletedRecordIds(line, { documentId: A, lineId: B })).toEqual([B]);
    // Kartın kendi "Sil" komutu sayfa kaydına bağlıdır: o kayıt silinmiştir.
    expect(deletedRecordIds(query([['id', '{{sayfa.parametre.id}}']]), { id: A }, { recordDelete: true })).toEqual([A]);
    expect(deletedRecordIds(query([['id', '{{sayfa.parametre.id}}']]), { id: A })).toEqual([]);
    expect(deletedRecordIds(query([['a', '{{x.value}}'], ['b', '{{y.value}}']]), { a: A, b: B })).toEqual([]);
    expect(deletedRecordIds(query([['customerId', '{{musteri.value}}']]), { customerId: A })).toEqual([A]);
    expect(deletedRecordIds(query([['id', '{{x.value}}']], 'update'), { id: A })).toEqual([]);
    expect(deletedRecordIds(query([['id', '{{x.value}}']]), { id: 'C-1001' })).toEqual([]);
  });
});
