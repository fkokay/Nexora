import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import { navigationTarget } from './navigationActions';
import { pageDateScope } from './pageBindings';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

function setup(components: unknown[], queries: unknown[] = []) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true }, definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    return { columns: [{ code: 'a', label: 'A' }], rows: [{ a: 1 }, { a: 2 }, { a: 3 }], rowCount: 3, truncated: false };
  });
  return render(<CommandProvider><ActionBar locale="tr" /><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews></CommandProvider>);
}

const opened: WorkspaceOpenRequest[] = [];
const onOpen = (event: Event) => opened.push((event as CustomEvent<WorkspaceOpenRequest>).detail);
beforeEach(() => { opened.length = 0; api.mockReset(); window.addEventListener(OPEN_PAGE_EVENT, onOpen); });
afterEach(() => { cleanup(); window.removeEventListener(OPEN_PAGE_EVENT, onOpen); vi.useRealTimers(); });

describe('tarih kapsamı (E2)', () => {
  it('computes local month, year and three-month starts', () => {
    expect(pageDateScope(new Date(2026, 10, 21, 23, 59))).toEqual({ ayBasi: '2026-11-01', yilBasi: '2026-01-01', ucAyOnce: '2026-09-01' });
  });

  it('wraps the three-month start into the previous year', () => {
    expect(pageDateScope(new Date(2026, 0, 15))).toEqual({ ayBasi: '2026-01-01', yilBasi: '2026-01-01', ucAyOnce: '2025-11-01' });
    expect(pageDateScope(new Date(2026, 1, 28))).toEqual({ ayBasi: '2026-02-01', yilBasi: '2026-01-01', ucAyOnce: '2025-12-01' });
    expect(pageDateScope(new Date(2026, 2, 1, 0, 0))).toEqual({ ayBasi: '2026-03-01', yilBasi: '2026-01-01', ucAyOnce: '2026-01-01' });
  });

  it('binds tarih in the page and lets setInput assign two inputs from it', async () => {
    const expected = pageDateScope();
    setup([
      { id: 'bas', type: 'input', name: 'baslangic', props: { inputType: 'date', label: 'Başlangıç' } },
      { id: 'bit', type: 'input', name: 'bitis', props: { inputType: 'date', label: 'Bitiş' } },
      { id: 'cip', type: 'button', props: { text: 'Son 3 ay', actionType: 'setInput', assignments: ['bas={{tarih.ucAyOnce}}', 'bit={{bugun}}'] } },
      { id: 'h', type: 'heading', props: { text: 'Yıl başı {{tarih.yilBasi}} · ay başı {{tarih.ayBasi}}' } },
    ]);
    expect(await screen.findByText(`Yıl başı ${expected.yilBasi} · ay başı ${expected.ayBasi}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Son 3 ay' }));
    await waitFor(() => expect((screen.getByLabelText('Başlangıç') as HTMLInputElement).value).toBe(expected.ucAyOnce));
    expect((screen.getByLabelText('Bitiş') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a page name tarih wins over the scope root', async () => {
    setup([
      { id: 'tarih', type: 'input', name: 'tarih', props: { inputType: 'text', label: 'Tarih', defaultValue: 'elle' } },
      { id: 'h', type: 'heading', props: { text: 'Değer {{tarih.value}}' } },
    ]);
    expect(await screen.findByText('Değer elle')).toBeTruthy();
  });
});

describe('satirSayisi (E3)', () => {
  it('is the row count of an unpaged query', async () => {
    setup([{ id: 'h', type: 'heading', props: { text: '{{liste.satirSayisi}} hareket' } }], [{ id: 'q', name: 'liste', kind: 'read', runOn: 'load', parameters: [] }]);
    expect(await screen.findByText('3 hareket')).toBeTruthy();
  });
});

describe('erpPage params (E4)', () => {
  it('passes bound page parameters next to q', () => {
    const scope = { liste: { seciliSatir: { id: 'c1', code: 'C-1' } } };
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'sales-order-create', params: ['customerId={{liste.seciliSatir.id}}'] }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-order-create', params: { customerId: 'c1' }, replace: true });
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'sales-invoices', queryText: '{{liste.seciliSatir.code}}', params: ['customerId={{liste.seciliSatir.id}}', 'q=x'] }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-invoices', params: { customerId: 'c1', q: 'C-1' }, replace: true });
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'sales-invoices', params: ['Bad=1', 'customerId=x'] }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-invoices', params: { customerId: 'x' }, replace: true });
  });

  it('erpPage button opens the legacy screen with its parameters', async () => {
    setup([{ id: 'b', type: 'button', props: { text: 'Yeni sipariş', actionType: 'erpPage', pageKey: 'sales-order-create', params: ['customerId=c-9'], target: 'newTab' } }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni sipariş' }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual({ page: 'sales-order-create', params: { customerId: 'c-9' }, replace: false, from: 'custom-page:p' });
  });
});
