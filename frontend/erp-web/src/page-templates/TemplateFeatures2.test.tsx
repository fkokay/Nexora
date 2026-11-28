import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { forgetOpener, setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';

// Kalıp özellikleri 2: pencerenin içindeki veri listesinde satır eylemi (Kayıt kartı ve Serbest gövdede `rowActions` yeri).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const TAB = 'custom-page:p';
const T = { timeout: 5000 };
const queries = [
  { id: 'rotalar', name: 'rotalar', kind: 'read', runOn: 'load', sql: 'SELECT Id AS id, Code AS code FROM R', parameters: [] },
  { id: 'baslat', name: 'baslat', kind: 'update', runOn: 'manual', sql: 'UPDATE R SET S = 1 WHERE Id = @id', parameters: [{ name: 'id', binding: '{{rota.seciliSatir.id}}', type: 'text' }] },
];
const freePage = {
  schemaVersion: 2, template: { name: 'free' }, queries,
  components: [
    { id: 'blok', type: 'section', props: { slot: 'block', title: 'Bölüm', members: ['metin'] } },
    { id: 'metin', type: 'text', props: { slot: 'item', text: 'Merhaba' } },
    { id: 'ac', type: 'button', props: { slot: 'actions', text: 'Rota', actionType: 'openDialog', dialogId: 'pencere' } },
    { id: 'pencere', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'lg', title: 'Rota', contains: ['rotaTablosu'] } },
    { id: 'rotaTablosu', type: 'dataTable', name: 'rota', props: { slot: 'dialog', query: 'rotalar', columns: ['code'], rowActions: ['baslatDugmesi'] } },
    { id: 'baslatDugmesi', type: 'button', props: { slot: 'rowActions', text: 'Başlat', actionType: 'query', queryId: 'baslat' } },
  ],
};

let calls: { endpoint: string; body: string }[];
beforeEach(() => {
  localStorage.clear();
  calls = [];
  api.mockReset();
  api.mockImplementation(async (endpoint: string, _token?: string, init?: RequestInit) => {
    if (endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Rota', revision: 1, forms: [], definitionJson: JSON.stringify(freePage), rights: { view: true, insert: true, update: true, delete: true } };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [] };
    calls.push({ endpoint, body: typeof init?.body === 'string' ? init.body : '' });
    if (/queries\/rotalar\/run/.test(endpoint)) return { columns: [{ code: 'id', label: 'id' }, { code: 'code', label: 'code' }], rows: [{ id: '1', code: 'R-1' }], rowCount: 1, truncated: false };
    return { affectedRows: 1 };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setPageParams(TAB, {}); forgetOpener(TAB); });

describe('pencere tablosunda satır eylemi', () => {
  it('the window table draws its row action and runs it with the row', async () => {
    render(<CommandProvider><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews><ConfirmDialogHost /></CommandProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Rota' }, T));
    const dialog = await screen.findByRole('dialog', undefined, T);
    await within(dialog).findByText('R-1', { selector: 'td, td *' }, T);
    // The row button belongs to the table: not drawn again as a page button.
    expect(screen.getAllByRole('button', { name: 'Başlat' })).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Başlat' }));
    await waitFor(() => expect(calls.some((call) => /queries\/baslat\/run/.test(call.endpoint) && call.body.includes('"1"'))).toBe(true), T);
  });
});
