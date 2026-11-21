import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';
import { CommandProvider } from '../commands/CommandProvider';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const G1 = '11111111-1111-1111-1111-111111111111';
const G2 = '22222222-2222-2222-2222-222222222222';
const operations = [
  { name: 'stok.birim.liste', label: 'Birimler', module: 'Stok', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/units',
    parameters: [], result: { shape: 'list', rowsPath: null, columns: [{ code: 'id', label: 'id', dataType: 'guid' }], flatten: [], metaPaths: [] },
    sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null },
];

function setup(components: unknown[], queries: unknown[] = []) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/published')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    if (endpoint === '/api/units') return [{ id: G1, qty: 2 }, { id: G2, qty: '3.5' }];
    return {};
  });
  return render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews></CommandProvider>);
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const totalCell = (code: string) => document.querySelector(`.tenant-page-grid tfoot [data-total="${code}"]`);
const lines = { id: 'g', type: 'editableGrid', name: 'satirlar', props: { title: 'Satırlar', gridMode: 'list',
  gridColumns: ['accountId|Hesap|text', 'debit|Borç|number|min:0', 'credit|Alacak|number|min:0'], totals: ['debit', 'credit'] } };
const balanced = { id: 'ok', type: 'badge', props: { text: 'Dengeli', visibleWhen: 'satirlar.toplam.debit == satirlar.toplam.credit && satirlar.toplam.debit > 0' } };
const unbalanced = { id: 'no', type: 'text', props: { text: 'Fiş dengede değil', visibleWhen: 'satirlar.toplam.debit != satirlar.toplam.credit' } };

afterEach(() => { cleanup(); api.mockReset(); });

describe('editableGrid totals', () => {
  it('renders footer sums and drives a balance indicator through page scope', async () => {
    setup([lines, balanced, unbalanced]);
    const add = await screen.findByRole('button', { name: 'Satır ekle' });
    await waitFor(() => expect(totalCell('debit')?.textContent).toContain('0,00'));
    expect(screen.queryByText('Dengeli')).toBeNull();
    fireEvent.click(add);
    fireEvent.click(add);
    type('Borç (satır 1)', '25000');
    type('Borç (satır 2)', '5000');
    await waitFor(() => expect(totalCell('debit')?.textContent).toContain('30.000,00'));
    expect(screen.getByText('Fiş dengede değil')).toBeTruthy();
    fireEvent.click(add);
    type('Alacak (satır 3)', '30000');
    await waitFor(() => expect(screen.getByText('Dengeli')).toBeTruthy());
    expect(totalCell('credit')?.textContent).toContain('30.000,00');
    expect(screen.queryByText('Fiş dengede değil')).toBeNull();
    // Satır silinince toplam ve gösterge güncellenir.
    fireEvent.click(screen.getAllByRole('button', { name: 'Satırı sil' })[2]);
    await waitFor(() => expect(screen.queryByText('Dengeli')).toBeNull());
    expect(totalCell('credit')?.textContent).toContain('0,00');
  });

  it('stage mode totals include kept source rows and exclude removed ones', async () => {
    setup([{ id: 'g', type: 'editableGrid', name: 'birimler', props: { gridMode: 'stage', sourceQuery: 'qs', gridColumns: ['qty|Miktar|number'], totals: ['qty'] } },
      { id: 't', type: 'text', props: { text: 'Toplam {{birimler.toplam.qty}}' } }],
    [{ id: 'qs', name: 'kaynak', kind: 'read', runOn: 'load', operation: 'stok.birim.liste', parameters: [] }]);
    await waitFor(() => expect(screen.getByText('Toplam 5.5')).toBeTruthy());
    expect(totalCell('qty')?.textContent).toContain('5,50');
    fireEvent.click(screen.getAllByRole('button', { name: 'Satırı sil' })[0]);
    await waitFor(() => expect(screen.getByText('Toplam 3.5')).toBeTruthy());
  });

  it('draws no footer without totals', async () => {
    setup([{ ...lines, props: { ...lines.props, totals: undefined } }]);
    await screen.findByRole('button', { name: 'Satır ekle' });
    expect(document.querySelector('.tenant-page-grid tfoot')).toBeNull();
  });
});
