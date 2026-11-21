import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { openWorkspacePage, setPageParams } from '../pageNavigation';

// dataTable `openParam`: sekme `sayfa.parametre.<ad>` ile açılınca tablo o kaydı seçer ve satır açma düğmesini çalıştırır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'custom-page:p';
const listQuery = { id: 'qr', name: 'kargolar', kind: 'read', runOn: 'load', parameters: [] };
let listRuns = 0;

function setup(tableProps: Record<string, unknown>) {
  const components = [
    { id: 't1', type: 'dataTable', name: 'liste', props: { query: 'qr', columns: ['takipNo'], ...tableProps } },
    { id: 'bd', type: 'button', props: { text: 'Pencere', actionType: 'openDialog', dialogId: 'd1' } },
    { id: 'd1', type: 'dialog', props: { title: 'Ayrıntı', contains: ['h1'] } },
    { id: 'h1', type: 'heading', props: { text: 'Kimlik {{liste.seciliSatir.id}} · {{liste.seciliSatir.takipNo}}' } },
  ];
  api.mockImplementation(async (endpoint: string) => {
    if (!endpoint.includes('/queries/') && endpoint.includes('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries: [listQuery] }),
      };
    }
    listRuns += 1;
    return { columns: [{ code: 'id', label: 'Kimlik' }, { code: 'takipNo', label: 'Takip' }], rows: [{ id: 'r1', takipNo: 'A-1' }, { id: 'r2', takipNo: 'B-2' }], rowCount: 2, truncated: false };
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
beforeEach(() => { listRuns = 0; api.mockReset(); });
afterEach(() => { cleanup(); setPageParams(KEY, {}); });

describe('dataTable openParam', { timeout: 30000 }, () => {
  it('opens the loaded row the param names, once', async () => {
    setPageParams(KEY, { no: 'r2' });
    setup({ rowOpenAction: 'bd', openParam: 'no' });
    const dialog = await screen.findByRole('dialog', { name: 'Ayrıntı' }, T);
    expect(dialog.textContent).toContain('Kimlik r2 · B-2');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a record not on the loaded page opens with only its id', async () => {
    setPageParams(KEY, { no: 'r9' });
    setup({ rowOpenAction: 'bd', openParam: 'no' });
    const dialog = await screen.findByRole('dialog', { name: 'Ayrıntı' }, T);
    expect(dialog.textContent).toContain('Kimlik r9 ·');
    expect(dialog.textContent).not.toContain('A-1');
  });

  it('navigating to the open tab with the same params reopens the record without rebuilding the page', async () => {
    setPageParams(KEY, { no: 'r1' });
    setup({ rowOpenAction: 'bd', openParam: 'no' });
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ayrıntı' }, T)).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const runs = listRuns;
    act(() => openWorkspacePage({ page: KEY, params: { no: 'r1' }, replace: false }));
    expect((await screen.findByRole('dialog', { name: 'Ayrıntı' }, T)).textContent).toContain('Kimlik r1 · A-1');
    expect(listRuns).toBe(runs);
  });

  it('does nothing without the param or without a row open button', async () => {
    setup({ rowOpenAction: 'bd', openParam: 'no' });
    await screen.findByText('A-1', {}, T);
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    setPageParams(KEY, { no: 'r1' });
    setup({ openParam: 'no' });
    await screen.findByText('A-1', {}, T);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
