import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const listQuery = { id: 'qr', name: 'kargolar', kind: 'read', runOn: 'load', parameters: [] };
const detailQuery = { id: 'qd', name: 'detay', kind: 'read', runOn: 'load', parameters: [{ name: 'no', binding: '{{sayfa.parametre.no}}', type: 'text' }] };
let runs: { id: string; body: string }[] = [];

function setup(components: unknown[], queries: unknown[] = [listQuery], code = 'p') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (!endpoint.includes('/queries/') && endpoint.includes('/published')) {
      return {
        id: code, code, name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? '';
    runs.push({ id, body: typeof init?.body === 'string' ? init.body : '' });
    return { columns: [{ code: 'takipNo', label: 'Takip' }], rows: [{ takipNo: 'A 1/2' }, { takipNo: 'B&3' }], rowCount: 2, truncated: false };
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code={code} token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const opened: WorkspaceOpenRequest[] = [];
const onOpen = (event: Event) => opened.push((event as CustomEvent<WorkspaceOpenRequest>).detail);
let open: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  runs = []; opened.length = 0; api.mockReset();
  window.addEventListener(OPEN_PAGE_EVENT, onOpen);
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => {
  for (let dialog = screen.queryByRole('alertdialog'); dialog; dialog = screen.queryByRole('alertdialog')) fireEvent.click(within(dialog).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  open.mockRestore();
  setPageParams('custom-page:p', {});
  setPageParams('custom-page:detay', {});
});

const table = { id: 't1', type: 'dataTable', name: 'liste', props: { query: 'qr', columns: ['takipNo'], rowActions: ['bl', 'bp', 'bd'] } };
const rowLink = { id: 'bl', type: 'button', props: { text: 'Takip et', actionType: 'link', href: 'https://kargo.example.com/takip?no={{liste.seciliSatir.takipNo}}' } };
const rowPage = { id: 'bp', type: 'button', props: { text: 'Detay', actionType: 'page', pageCode: 'detay', params: ['no={{liste.seciliSatir.takipNo}}'], target: 'newTab' } };
const rowDialog = { id: 'bd', type: 'button', props: { text: 'Pencere', actionType: 'openDialog', dialogId: 'd1' } };
const dialog = { id: 'd1', type: 'dialog', props: { title: 'Ayrıntı', contains: ['h1'] } };
const heading = { id: 'h1', type: 'heading', props: { text: 'Seçili: {{liste.seciliSatir.takipNo}}' } };

const rowButton = async (row: number, name: string) => {
  const rows = await screen.findAllByRole('row');
  return within(rows[row]).getByRole('button', { name });
};

describe('Gezinme eylemleri', () => {
  it('link button opens the encoded address with noopener', async () => {
    setup([{ id: 'b1', type: 'button', props: { text: 'Kargo', actionType: 'link', href: 'https://kargo.example.com/takip?ad={{kullanici.ad}}&s=1' } }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Kargo' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/kargo\.example\.com\/takip\?ad=.*&s=1$/);
    expect(open.mock.calls[0][1]).toBe('_blank');
    expect(open.mock.calls[0][2]).toBe('noopener,noreferrer');
  });

  it('row link binds the clicked row and encodes it', async () => {
    setup([table, rowLink, rowPage, rowDialog, dialog, heading]);
    fireEvent.click(await rowButton(2, 'Takip et'));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0]).toEqual(['https://kargo.example.com/takip?no=B%263', '_blank', 'noopener,noreferrer']);
  });

  it('confirmation is asked before navigating', async () => {
    setup([{ id: 'b1', type: 'button', props: { text: 'Kargo', actionType: 'link', href: 'https://kargo.example.com/', confirmEnabled: true, confirmText: 'Dış siteye gidilsin mi?' } }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Kargo' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).toContain('Dış siteye gidilsin mi?');
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Devam' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  });

  it('row page action opens a workspace page with the row parameters', async () => {
    setup([table, rowLink, rowPage, rowDialog, dialog, heading]);
    fireEvent.click(await rowButton(1, 'Detay'));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual({ page: 'custom-page:detay', params: { no: 'A 1/2' }, replace: false, from: 'custom-page:p' });
  });

  it('erpPage button navigates the current workspace tab', async () => {
    setup([{ id: 'b1', type: 'button', props: { text: 'Cariler', actionType: 'erpPage', pageKey: 'customers', queryText: 'ACME' } }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Cariler' }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]).toEqual({ page: 'customers', params: { q: 'ACME' }, replace: true, from: 'custom-page:p' });
  });

  it('row dialog action selects the row and opens the dialog', async () => {
    setup([table, rowLink, rowPage, rowDialog, dialog, heading]);
    fireEvent.click(await rowButton(2, 'Pencere'));
    const opened = await screen.findByRole('dialog', { name: 'Ayrıntı' });
    expect(opened.textContent).toContain('Seçili: B&3');
  });

  it('page parameters land in {{sayfa.parametre.x}} and re-run bound queries', async () => {
    setPageParams('custom-page:detay', { no: 'K-1' });
    setup([{ id: 'h1', type: 'heading', props: { text: 'Takip {{sayfa.parametre.no}}' } }], [detailQuery], 'detay');
    expect(await screen.findByText('Takip K-1')).toBeTruthy();
    await waitFor(() => expect(runs.find((run) => run.id === 'qd')?.body).toBe('{"parameters":{"no":"K-1"}}'));
    act(() => setPageParams('custom-page:detay', { no: 'K-2' }));
    expect(await screen.findByText('Takip K-2')).toBeTruthy();
    await waitFor(() => expect(runs.filter((run) => run.id === 'qd').map((run) => run.body)).toContain('{"parameters":{"no":"K-2"}}'));
  });
});
