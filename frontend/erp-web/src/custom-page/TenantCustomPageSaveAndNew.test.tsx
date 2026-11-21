import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import { buildPageCommands, SAVE_AND_NEW_COMMAND_ID, type PageActionDeps } from './pageActions';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

// Yeni kayıt kartı: `olustur` yalnız henüz sonuç yokken çalışır (stok/cari kartındaki koşulla aynı).
const queries = [
  { id: 'kart', name: 'kart', kind: 'read', runOn: 'load', parameters: [] },
  { id: 'olustur', name: 'olustur', kind: 'insert', runOn: 'manual', operation: 'kart.olustur', parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }] },
];
const createOperation = {
  name: 'kart.olustur', label: 'Kart oluştur', module: 'Test', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/cards',
  parameters: [{ name: 'name', in: 'body', type: 'text', required: false }], result: { shape: 'record', rowsPath: null, columns: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-21', deprecated: false, allowed: true,
};
const card = { id: 'kc', type: 'formCard', props: { title: 'Kimlik', inputs: ['ad'], recordKey: '{{kart.rows[0].id}}' } };
const input = { id: 'ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad', defaultValue: '{{kart.rows[0].name}}' } };
const bar = (extra: Record<string, unknown> = {}) => ({ id: 'bar', type: 'actionBar', props: {
  saveSequence: ['olustur'], sequenceWhen: ['olustur=olustur.sonuc == null'], saveAndNew: true,
  newAction: 'page', newPageCode: 'p', newTarget: 'sameTab', afterSaveAction: 'page', afterSavePageCode: 'liste', afterSaveTarget: 'sameTab', ...extra,
} });

let writes: string[] = [];
function setup(components: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (!endpoint.includes('/queries/') && endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Kart', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    if (endpoint.includes('/queries/kart/run')) return { columns: [], rows: [], rowCount: 0, truncated: false };
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [createOperation] };
    if (endpoint !== '/api/cards') throw new Error(`unexpected ${endpoint}`);
    writes.push(typeof init?.body === 'string' ? init.body : '');
    return { id: `k${writes.length}` };
  });
  return render(<CommandProvider><ActionBar locale="tr" /><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews><ConfirmDialogHost /></CommandProvider>);
}
const bar$ = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar$().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const opened: WorkspaceOpenRequest[] = [];
const onOpen = (event: Event) => opened.push((event as CustomEvent<WorkspaceOpenRequest>).detail);

beforeEach(() => { writes = []; opened.length = 0; api.mockReset(); window.addEventListener(OPEN_PAGE_EVENT, onOpen); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
});

describe('Kaydet ve yeni (E6)', () => {
  it('saves, then starts a new record instead of the after-save page; a second save creates again', async () => {
    setup([card, input, bar()]);
    const field = await screen.findByLabelText('Ad') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Birinci' } });
    fireEvent.click(command('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Kaydet ve yeni/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain('Birinci');
    await waitFor(() => expect((screen.getByLabelText('Ad') as HTMLInputElement).value).toBe(''));
    expect(await screen.findByText('Kaydedildi. Yeni kayıt için alanlar temizlendi.')).toBeTruthy();
    // Kayıttan sonra eylemi (liste sayfası) çalışmaz.
    expect(opened.some((request) => request.page === 'custom-page:liste')).toBe(false);

    // Ctrl+F2 aynı komut; `olustur.sonuc` sıfırlandığı için ikinci kart da oluşturulur.
    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'İkinci' } });
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toContain('İkinci');
  });

  it('plain Kaydet still runs the after-save action', async () => {
    setup([card, input, bar()]);
    fireEvent.change(await screen.findByLabelText('Ad'), { target: { value: 'Tek' } });
    fireEvent.click(command('save'));
    await waitFor(() => expect(opened.some((request) => request.page === 'custom-page:liste')).toBe(true));
    expect(writes).toHaveLength(1);
  });

  it('commandWhen saveNew hides the menu item and its shortcut', async () => {
    setup([card, input, bar({ commandWhen: ['saveNew=kart.rows[0].id != null'] })]);
    fireEvent.change(await screen.findByLabelText('Ad'), { target: { value: 'X' } });
    fireEvent.click(command('more'));
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /Kaydet ve yeni/ })).toBeNull());
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writes).toHaveLength(0);
  });
});

describe('buildPageCommands saveAndNew', () => {
  const deps = (run: Partial<PageActionDeps['run']> = {}): PageActionDeps => ({
    rights: { view: true, insert: true, update: true }, busy: false, queryKind: (id) => (id === 'q' ? 'insert' : undefined),
    inputIds: new Set(['a']), tableState: () => undefined, buttonLabel: () => undefined, deleteNeedsSelection: false, queryAllowed: () => true,
    run: { clearInputs: () => {}, write: () => {}, saveSequence: () => {}, refresh: () => {}, focus: () => {}, print: () => {}, exportTable: () => {}, button: () => {}, saveAndNew: () => {}, ...run },
  });
  const item = (props: Record<string, unknown>, d = deps()) => buildPageCommands(props, d).more?.find((entry) => entry.id === SAVE_AND_NEW_COMMAND_ID);

  it('needs saveAndNew, a save path and a New command', () => {
    expect(item({ saveQuery: 'q', newInputs: ['a'], saveAndNew: true })).toMatchObject({ label: 'Kaydet ve yeni', shortcut: 'Ctrl+F2' });
    expect(item({ saveQuery: 'q', newInputs: ['a'] })).toBeUndefined();
    expect(item({ newInputs: ['a'], saveAndNew: true })).toBeUndefined();
    expect(item({ saveQuery: 'q', saveAndNew: true })).toBeUndefined();
    expect(item({ saveQuery: 'q', newInputs: ['a'], saveAndNew: true, hiddenCommands: ['saveNew'] })).toBeUndefined();
    expect(item({ saveQuery: 'q', newInputs: ['a'], saveAndNew: true, hiddenCommands: ['save'] })).toBeUndefined();
  });

  it('is disabled with the save reason while busy', () => {
    const busy = { ...deps(), busy: true };
    expect(item({ saveQuery: 'q', newInputs: ['a'], saveAndNew: true }, busy)).toMatchObject({ disabledReason: 'İşlem sürüyor…' });
  });
});
