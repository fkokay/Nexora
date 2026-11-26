import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider, useCommandRegistry } from '../commands/CommandProvider';
import type { CommandRegistry } from '../commands/registry';
import type { PageCommands, StandardCommandId } from '../commands/types';
import { ConfirmDialogHost } from '../confirmDialog';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { UNBOUND_REASON, VIEW_MODE_PARAM, VIEW_MODE_VALUE } from '../custom-page/pageActions';
import {
  CLOSE_PAGE_EVENT, forgetOpener, OPEN_PAGE_EVENT, openWorkspacePage, pageParamsOf, setPageParams, type WorkspaceOpenRequest,
} from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';
import { freeComponents, freeDefinition } from './freeTemplateFixture';
import { recordComponents, recordQueries, recordRow } from './recordTemplateFixture';

// Kalıplı sayfanın komutları (`commands` yerindeki actionBar): eski çubukla aynı komutlar kayıt defterine kaydedilir, kabuk
// onları sabit sırayla ve tek "⋯" menüsüyle çizer; ortak çubuk o görünümde çizilmez.

const { api, downloadXlsx, downloadCsv } = vi.hoisted(() => ({ api: vi.fn(), downloadXlsx: vi.fn(), downloadCsv: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../general-ledger/ledgerReportUtils', () => ({ downloadXlsx, downloadCsv }));

const TAB = 'custom-page:p';
const LIST = 'custom-page:liste';
const T = { timeout: 5000 };

// ---- Liste ----
const listOperation = {
  name: 'cari.liste', label: 'Cariler', module: 'Cari', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/customers', parameters: [],
  result: { shape: 'list', rowsPath: 'items', columns: [{ code: 'id', label: 'Kimlik', dataType: 'text' }, { code: 'code', label: 'Kod', dataType: 'text' }, { code: 'name', label: 'Ad', dataType: 'text' }],
    flatten: [], metaPaths: ['toplam'] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
};
const listQueries = [
  { id: 'cariler', name: 'cariler', kind: 'read', runOn: 'load', operation: 'cari.liste', parameters: [] },
  { id: 'sil', name: 'sil', kind: 'delete', runOn: 'manual', sql: 'DELETE FROM C WHERE Id = @id', parameters: [{ name: 'id', binding: '{{liste.seciliSatir.id}}', type: 'text' }] },
  { id: 'teklif', name: 'teklif', kind: 'insert', runOn: 'manual', sql: 'INSERT INTO Q DEFAULT VALUES', parameters: [] },
];
const listBarProps = {
  newAction: 'page', newPageCode: 'cari-kart', newTarget: 'sameTab',
  openAction: 'page', openPageCode: 'cari-kart', openTarget: 'sameTab', openTable: 'liste_t', openParams: ['kod={{liste.seciliSatir.code}}'],
  deleteQuery: 'sil', deleteConfirmText: '{{liste.seciliSatir.code}} · {{liste.seciliSatir.name}} cari kartı silinsin mi?',
  exportTable: 'liste_t', titleCount: '{{cariler.meta.toplam}}', focusInput: 'suzgec', moreButtons: ['b_teklif'],
};
const listBar = (extra: Record<string, unknown> = {}) => ({ id: 'komutlar', type: 'actionBar', props: { slot: 'commands', ...listBarProps, ...extra } });
const listBody = [
  { id: 'suzgec', type: 'filterBar', props: { slot: 'filters', table: 'liste_t', search: true, searchPlaceholder: 'Cari ara', searchColumns: ['code', 'name'] } },
  { id: 'liste_t', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'cariler', title: 'Cariler', columns: ['code', 'name'] } },
  { id: 'b_teklif', type: 'button', props: { slot: 'actions', text: 'Yeni teklif', actionType: 'query', queryId: 'teklif' } },
  { id: 'b_rapor', type: 'button', props: { slot: 'actions', text: 'Rapor', actionType: 'query', queryId: 'cariler' } },
];
const listRows = [{ id: '1', code: 'C-1001', name: 'Akdeniz Gıda A.Ş.' }, { id: '2', code: 'C-1002', name: 'Ege Tekstil' }];
const listPage = (bar: unknown = listBar()) => ({ schemaVersion: 2, template: { name: 'list' }, queries: listQueries, components: [...(bar ? [bar] : []), ...listBody] });
/** Aynı çubuk, kalıpsız: bileşenler yersiz, sayfa eski biçimde çizilir. */
const unslotted = (components: { props?: Record<string, unknown> }[]) => components.map((component) => {
  const { slot: _slot, ...props } = component.props ?? {};
  return { ...component, props };
});

// ---- Kayıt kartı: Kaydet ve Sil çubukta, düğmeleri yok ----
const recordBarProps = {
  saveSequence: ['ekle', 'guncelle'], sequenceWhen: ['ekle=kayit.rows[0].Code == null', 'guncelle=kayit.rows[0].Code != null'], deleteQuery: 'sil',
};
const recordBar = (extra: Record<string, unknown> = {}) => ({ id: 'komutlar', type: 'actionBar', props: { slot: 'commands', ...recordBarProps, ...extra } });
const recordBody = recordComponents.filter((component) => component.id !== 'b_kaydet' && component.id !== 'b_sil');
const extraQueries = [
  { id: 'ekle2', name: 'ekle2', kind: 'insert', sql: 'INSERT INTO D DEFAULT VALUES', parameters: [] },
  { id: 'ekle3', name: 'ekle3', kind: 'insert', sql: 'INSERT INTO E DEFAULT VALUES', parameters: [] },
];
const recordPage = (bar: unknown = recordBar(), body: unknown[] = recordBody) =>
  ({ schemaVersion: 2, template: { name: 'record' }, queries: [...recordQueries, ...extraQueries], components: [...(bar ? [bar] : []), ...body] });
const withKey = (patch: Record<string, unknown>) => recordBody.map((component) => component.id === 'kod'
  ? { ...component, props: { ...component.props, ...patch } } : component);

type Call = { endpoint: string; body: string };
let calls: Call[];
let definition: unknown;
let knownKeys: Set<string>;
let failing: Set<string>;
let opens: WorkspaceOpenRequest[];
let closes: string[];
let registry: CommandRegistry;
const onOpen = (event: Event) => { opens.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };
const onClose = (event: Event) => { closes.push((event as CustomEvent<{ page: string }>).detail.page); };

function Grab() { registry = useCommandRegistry(); return null; }

beforeEach(() => {
  localStorage.clear();
  calls = []; opens = []; closes = [];
  knownKeys = new Set(['C-1001']);
  failing = new Set();
  definition = listPage();
  api.mockReset(); downloadXlsx.mockReset(); downloadCsv.mockReset();
  api.mockImplementation(async (endpoint: string, _token?: string, init?: RequestInit) => {
    if (endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Cariler', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [listOperation] };
    if (endpoint.startsWith('/api/customers')) return { items: listRows, toplam: 1248 };
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ endpoint, body });
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? '';
    if (failing.has(id)) throw new Error('Sunucu hatası (500)');
    if (id === 'kayit') {
      const key = [...knownKeys].find((candidate) => body.includes(`"${candidate}"`));
      return { columns: [], rows: key ? [{ ...recordRow, Code: key }] : [], rowCount: key ? 1 : 0, truncated: false };
    }
    if (id === 'hareket') return { columns: [{ code: 'Belge', label: 'Belge' }], rows: [], rowCount: 0, truncated: false };
    return { affectedRows: 1 };
  });
  window.addEventListener(OPEN_PAGE_EVENT, onOpen);
  window.addEventListener(CLOSE_PAGE_EVENT, onClose);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  window.removeEventListener(CLOSE_PAGE_EVENT, onClose);
  for (const page of [TAB, LIST]) { setPageParams(page, {}); forgetOpener(page); }
});

function setup(page: unknown) {
  definition = page;
  return render(<CommandProvider>
    <Grab />
    <ActionBar locale="tr" />
    <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    <ConfirmDialogHost />
  </CommandProvider>);
}

const view = () => registry.getView('v');
const ran = (query: string) => calls.filter((call) => call.endpoint.includes(`/queries/${query}/run`));
const shellBar = () => screen.getByRole('toolbar', { name: 'İşlemler' });
const shellButton = (label: string) => within(shellBar()).queryByRole('button', { name: label });
const command = (id: string) => shellBar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const enabled = (element: HTMLElement | null) => !!element && element.getAttribute('aria-disabled') !== 'true' && !(element as HTMLButtonElement).disabled;
const listReady = () => waitFor(() => expect(view()?.export?.run).toBeTruthy(), T);
const selectRow = async (code: string) => { fireEvent.click((await screen.findByText(code, undefined, T)).closest('tr')!); };
const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const openMore = () => fireEvent.click(within(shellBar()).getByRole('button', { name: 'Diğer işlemler' }));
const narrow = () => vi.stubGlobal('ResizeObserver', class {
  constructor(private cb: ResizeObserverCallback) {}
  observe() { this.cb([{ contentRect: { width: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  disconnect() {}
  unobserve() {}
});
const openedFromList = (params: Record<string, string> = {}) => { openWorkspacePage({ page: TAB, params, replace: true, from: LIST }); opens = []; };

const IDS: StandardCommandId[] = ['new', 'open', 'view', 'save', 'delete', 'refresh', 'filter', 'export', 'undo'];
/** Kayıt defterindeki komutların yapısı; Yazdır (kalıpta her zaman bağlı) ve `shell` (kimin çizdiği) dışında. */
const structure = (commands: PageCommands | undefined) => commands && JSON.stringify([
  IDS.map((id) => { const spec = commands[id]; return spec ? [id, !!spec.run, spec.disabledReason ?? '', !!spec.primary, !!spec.hidden, spec.label ?? ''] : [id]; }),
  (commands.more ?? []).map((item) => [item.id, item.label, item.shortcut ?? '', item.disabledReason ?? '', !!item.run]),
  (commands.barItems ?? []).map((item) => [item.id, item.label, item.shortcut ?? '', item.disabledReason ?? '', !!item.run]),
  !!commands.moreHidden, !!commands.besideList, commands.screen ?? '',
]);

describe('kalıplı sayfada komutlar', () => {
  it('templated page registers the same commands as the legacy page with the same bar', async () => {
    const cases: { name: string; templated: unknown; legacy: unknown; ready: () => Promise<unknown>; before?: () => void }[] = [
      { name: 'list', templated: listPage(), legacy: { schemaVersion: 2, queries: listQueries, components: unslotted([listBar(), ...listBody]) }, ready: listReady },
      {
        name: 'record', templated: recordPage(recordBar({ saveAndNew: true, newAction: 'page', newPageCode: 'p', newTarget: 'sameTab' })),
        legacy: { schemaVersion: 2, queries: [...recordQueries, ...extraQueries], components: unslotted([recordBar({ saveAndNew: true, newAction: 'page', newPageCode: 'p', newTarget: 'sameTab' }), ...recordBody]) },
        // Var olan kayıt: yeni kayıtta kalıp Sil'i gizler (eski sayfada yoktur).
        before: () => setPageParams(TAB, { kod: 'C-1001' }),
        ready: () => waitFor(() => expect(view()?.delete?.run).toBeTruthy(), T),
      },
    ];
    for (const item of cases) {
      item.before?.();
      setup(item.legacy);
      await item.ready();
      await pause();
      const legacy = view();
      cleanup();
      item.before?.();
      setup(item.templated);
      await item.ready();
      await pause();
      const templated = view();
      expect(structure(templated), item.name).toBe(structure(legacy));
      expect(legacy?.print?.disabledReason, item.name).toBe(UNBOUND_REASON);
      expect(templated?.print?.run, item.name).toBeTruthy();
      expect(templated?.shell, item.name).toBe(true);
      expect(legacy?.shell, item.name).toBeUndefined();
      cleanup();
    }
  });

  it('exactly one toolbar is on screen', async () => {
    setup(listPage());
    await listReady();
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    expect(screen.getByRole('toolbar').getAttribute('aria-label')).toBe('İşlemler');
    expect(within(shellBar()).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['Yeni', 'Düzenle', 'Görüntüle', 'Yenile', 'Filtre', 'Yazdır', 'Excel', 'Rapor', '⋯', 'Sil']);
  });

  it('hiddenCommands hide the command and its shortcut', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    setup(listPage(listBar({ hiddenCommands: ['print', 'save'] })));
    await listReady();
    expect(shellButton('Yazdır')).toBeNull();
    expect(view()?.print?.hidden).toBe(true);
    const notPrevented = fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true });
    expect(notPrevented).toBe(false);
    expect(print).not.toHaveBeenCalled();
    cleanup();
    // Görünen Yazdır yazdırır (kalıpta printEnabled sayılır), Ctrl+P de.
    setup(listPage());
    await listReady();
    fireEvent.click(shellButton('Yazdır')!);
    fireEvent.keyDown(document.body, { key: 'p', ctrlKey: true });
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('commandWhen saveNew shows Kaydet ve yeni only for a new record', async () => {
    const bar = recordBar({ saveAndNew: true, newAction: 'page', newPageCode: 'p', newTarget: 'sameTab', commandWhen: ['saveNew=kayit.rows[0].Code == null'] });
    setup(recordPage(bar));
    await waitFor(() => expect(command('save-and-new')).toBeTruthy(), T);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    expect(shellButton('Kaydet ve yeni')).toBeTruthy();
    // Kısayol kabukta ikinci kez bağlanmaz: Ctrl+F2 tek kayıt yazar.
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await waitFor(() => expect(ran('ekle')).toHaveLength(1), T);
    await pause();
    expect(ran('ekle')).toHaveLength(1);
    cleanup();
    calls = [];
    setPageParams(TAB, { kod: 'C-1001' });
    setup(recordPage(bar));
    await waitFor(() => expect(view()?.delete?.run).toBeTruthy(), T);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    expect(command('save-and-new')).toBeNull();
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await pause(100);
    expect(ran('ekle')).toHaveLength(0);
    expect(ran('guncelle')).toHaveLength(0);
  });

  it('saveSequence runs steps in order and stops on error', async () => {
    failing.add('ekle2');
    setup(recordPage(recordBar({ saveSequence: ['ekle', 'ekle2', 'ekle3'], sequenceWhen: [], stopOnError: true })));
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    expect(command('save')!.className).toContain('page-shell-action--primary');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(ran('ekle2')).toHaveLength(1), T);
    await pause(100);
    expect(calls.map((call) => /queries\/(\w+)\/run/.exec(call.endpoint)?.[1]).filter((id) => id !== 'kayit' && id !== 'hareket')).toEqual(['ekle', 'ekle2']);
    expect(ran('ekle3')).toHaveLength(0);
  });

  it('afterSaveAction page opens the target in the same tab and refreshes it', async () => {
    openedFromList();
    setup(recordPage(recordBar({ afterSaveAction: 'page', afterSavePageCode: 'liste', afterSaveTarget: 'sameTab', afterSaveRefresh: true })));
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(command('save')!);
    await waitFor(() => expect(opens).toEqual([expect.objectContaining({ page: LIST, replace: true, refresh: true })]), T);
    // Kayıt kartının kendi kuralı (açana dönüş) ayrıca çalışmaz.
    expect(closes).toEqual([]);
  });

  it('record bar save without afterSave keeps the card rule', async () => {
    setPageParams(LIST, { q: 'akdeniz' });
    openedFromList();
    setup(recordPage(recordBar(), withKey({ readOnly: true, placeholder: '(otomatik)' })));
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Unvan'), { target: { value: 'Yeni cari' } });
    fireEvent.click(command('save')!);
    await waitFor(() => expect(closes).toEqual([TAB]), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(opens).toEqual([expect.objectContaining({ page: LIST, replace: false, from: TAB, refresh: true, keepParams: true, notice: 'Kaydedildi.' })]);
  });

  it('record bar save with a typed key reopens the record and the second save updates', async () => {
    knownKeys.add('C-2002');
    openedFromList();
    setup(recordPage());
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    await waitFor(() => expect(ran('kayit')).toHaveLength(1), T);
    fireEvent.change(screen.getByLabelText('Cari kodu'), { target: { value: 'C-2002' } });
    fireEvent.click(command('save')!);
    await waitFor(() => expect(pageParamsOf(TAB)).toEqual({ kod: 'C-2002' }), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(await screen.findByText('Kaydedildi.', undefined, T)).toBeTruthy();
    await waitFor(() => expect(enabled(command('delete'))).toBe(true), T);
    fireEvent.click(command('save')!);
    await waitFor(() => expect(ran('guncelle')).toHaveLength(1), T);
    expect(ran('ekle')).toHaveLength(1);
    expect(closes).toEqual([]);
  });

  it('hidden and undrawn commands do nothing on shortcut', async () => {
    setup(recordPage());
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    // Yeni kayıtta Sil çizilmez ve kayıt defterinde gizlidir: Ctrl+Del onay bile sormaz.
    expect(command('delete')).toBeNull();
    expect(view()?.delete?.hidden).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Delete', ctrlKey: true });
    await pause();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(ran('sil')).toHaveLength(0);
    cleanup();
    // Var olan kayıtta aynı kısayol Sil'i (onayıyla) çalıştırır; silince açana dönülür.
    setPageParams(TAB, { kod: 'C-1001' });
    openedFromList({ kod: 'C-1001' });
    setup(recordPage());
    await waitFor(() => expect(enabled(command('delete'))).toBe(true), T);
    expect(command('delete')!.className).toContain('page-shell-action--danger');
    fireEvent.keyDown(document.body, { key: 'Delete', ctrlKey: true });
    const dialog = await screen.findByRole('alertdialog', undefined, T);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Sil/ }));
    await waitFor(() => expect(ran('sil')).toHaveLength(1), T);
    await waitFor(() => expect(closes).toEqual([TAB]), T);
    expect(opens).toEqual([expect.objectContaining({ page: LIST, notice: 'Silindi.' })]);
  });

  it('Sil confirm title comes from deleteConfirmText and selected row', async () => {
    setup(listPage());
    await listReady();
    expect(enabled(command('delete'))).toBe(false);
    await selectRow('C-1001');
    await waitFor(() => expect(enabled(command('delete'))).toBe(true), T);
    fireEvent.click(command('delete')!);
    let dialog = await screen.findByRole('alertdialog', undefined, T);
    expect(within(dialog).getByRole('heading').textContent).toBe('C-1001 · Akdeniz Gıda A.Ş. cari kartı silinsin mi?');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Sil/ }));
    await waitFor(() => expect(ran('sil')).toHaveLength(1), T);
    cleanup();
    setup(listPage(listBar({ deleteConfirmText: '' })));
    await listReady();
    await selectRow('C-1002');
    await waitFor(() => expect(enabled(command('delete'))).toBe(true), T);
    fireEvent.click(command('delete')!);
    dialog = await screen.findByRole('alertdialog', undefined, T);
    expect(within(dialog).getByRole('heading').textContent).toBe('Kayıt silinsin mi?');
  });

  it('Excel exports exportTable visible rows and CSV sits in the ⋯ menu', async () => {
    setup(listPage());
    await listReady();
    fireEvent.click(command('export')!);
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalledTimes(1), T);
    expect(downloadXlsx.mock.calls[0][2]).toEqual([['Kod', 'Ad'], ['C-1001', 'Akdeniz Gıda A.Ş.'], ['C-1002', 'Ege Tekstil']]);
    openMore();
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Diğer')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'CSV olarak dışa aktar' }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1), T);
    expect(downloadCsv.mock.calls[0][0]).toBe('p.csv');
  });

  it('titleCount shows the bound total next to the title', async () => {
    const { container } = setup(listPage());
    await listReady();
    await waitFor(() => expect(container.querySelector('.list-v2-count')?.textContent).toContain('1.248'), T);
    cleanup();
    // titleCount yoksa kalıbın sayısı (listenin satır sayısı).
    const { container: plain } = setup(listPage(listBar({ titleCount: '' })));
    await listReady();
    await waitFor(() => expect(plain.querySelector('.list-v2-count')?.textContent).toContain('2'), T);
    expect(plain.querySelector('.list-v2-count')?.textContent).not.toContain('1.248');
  });

  it('Filtre and Ctrl+F focus focusInput', async () => {
    setup(listPage());
    await listReady();
    fireEvent.click(command('filter')!);
    expect(document.activeElement?.id).toBe('page-input-suzgec');
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    expect(document.activeElement?.id).toBe('page-input-suzgec');
  });

  it('moreButtons run their buttons from the ⋯ menu and are not drawn in the bar', async () => {
    setup(listPage());
    await listReady();
    expect(shellButton('Yeni teklif')).toBeNull();
    expect(shellButton('Rapor')).toBeTruthy();
    openMore();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Yeni teklif' }));
    await waitFor(() => expect(ran('teklif')).toHaveLength(1), T);
    expect(screen.queryByRole('menu')).toBeNull();
    // Alt+İ aynı tek menüyü açar.
    fireEvent.keyDown(document.body, { key: 'İ', altKey: true });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Yeni teklif' }));
  });

  it('Görüntüle opens the Düzenle page read-only', async () => {
    setup(listPage());
    await listReady();
    expect(enabled(command('view'))).toBe(false);
    await selectRow('C-1001');
    await waitFor(() => expect(enabled(command('view'))).toBe(true), T);
    fireEvent.click(command('view')!);
    await waitFor(() => expect(opens).toEqual([expect.objectContaining({ page: 'custom-page:cari-kart', params: { kod: 'C-1001', [VIEW_MODE_PARAM]: VIEW_MODE_VALUE } })]), T);
    fireEvent.click(command('open')!);
    await waitFor(() => expect(opens.at(-1)).toEqual(expect.objectContaining({ page: 'custom-page:cari-kart', params: { kod: 'C-1001' } })), T);
  });

  it('buttons the commands bar runs are not the record card Kaydet or Sil and are not drawn', async () => {
    setPageParams(TAB, { kod: 'C-1001' });
    // ⋯ menüsündeki bir kayıt dizisi ve bir silme düğmesi: kartın Kaydet'i ve Sil'i sayılmaz, kabukta çizilmez.
    const owned = [
      { id: 'b_dizi', type: 'button', props: { slot: 'actions', text: 'Toplu güncelle', actionType: 'sequence', saveSequence: ['guncelle'] } },
      { id: 'b_kaldir', type: 'button', props: { slot: 'actions', text: 'Kaydı kaldır', actionType: 'query', queryId: 'sil' } },
    ];
    setup(recordPage(recordBar({ moreButtons: ['b_dizi', 'b_kaldir'] }), [...recordBody, ...owned]));
    await waitFor(() => expect(enabled(command('delete'))).toBe(true), T);
    expect(shellButton('Toplu güncelle')).toBeNull();
    expect(shellButton('Kaydı kaldır')).toBeNull();
    expect(command('save')!.className).toContain('page-shell-action--primary');
    expect(shellBar().querySelectorAll('.page-shell-action--primary')).toHaveLength(1);
    expect(shellBar().querySelectorAll('.page-shell-action--danger')).toHaveLength(1);
    openMore();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Toplu güncelle', 'Kaydı kaldır']);
  });

  it('a record card whose Kaydet is its button keeps that button as the main one', async () => {
    // Komut çubuğu yalnız Yenile/Yeni gibi komutları taşır; Kaydet ve Sil kartın düğmeleridir (Karar 7).
    setPageParams(TAB, { kod: 'C-1001' });
    setup(recordPage(recordBar({ saveSequence: undefined, sequenceWhen: undefined, deleteQuery: undefined, newAction: 'page', newPageCode: 'p', newTarget: 'sameTab' }), recordComponents));
    await waitFor(() => expect(shellButton('Kaydet')).toBeTruthy(), T);
    await waitFor(() => expect(view()?.new?.run).toBeTruthy(), T);
    const primary = [...shellBar().querySelectorAll<HTMLElement>('.page-shell-action--primary')].map((button) => button.textContent);
    expect(primary).toEqual(['Kaydet']);
    expect([...shellBar().querySelectorAll('.page-shell-bar-left button')].map((button) => button.textContent)).toEqual(['Kaydet', 'Yeni', 'Yenile', 'Yazdır', 'Ekstre al']);
  });

  it('free template draws the bar commands in its shell', async () => {
    setup(freeDefinition([
      { id: 'komutlar', type: 'actionBar', props: { slot: 'commands', exportTable: 'm_liste', moreButtons: ['b_aktar'] } },
      ...freeComponents,
    ]));
    await waitFor(() => expect(view()?.export?.run).toBeTruthy(), T);
    expect(view()?.shell).toBe(true);
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
    expect(within(shellBar()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Yenile', 'Yazdır', 'Excel', 'Yenile', '⋯']);
    openMore();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Dışa aktar', 'CSV olarak dışa aktar']);
  });

  it('at narrow width overflowed commands keep their shortcuts and Ctrl+S writes once', async () => {
    narrow();
    setPageParams(TAB, { kod: 'C-1001' });
    setup(recordPage());
    await waitFor(() => expect(enabled(command('save'))).toBe(true), T);
    await waitFor(() => expect(view()?.delete?.run).toBeTruthy(), T);
    // Yenile ve Sil ⋯ menüsünde; kısayolları kayıt defterinden çalışır, kabuk ikinci kez bağlamaz.
    expect(command('refresh')).toBeNull();
    openMore();
    expect(screen.getByRole('menuitem', { name: /Yenile/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    const loads = ran('kayit').length;
    fireEvent.keyDown(document.body, { key: 'F5' });
    await waitFor(() => expect(ran('kayit')).toHaveLength(loads + 1), T);
    await pause();
    expect(ran('kayit')).toHaveLength(loads + 1);
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(ran('guncelle')).toHaveLength(1), T);
    await pause(100);
    expect(ran('guncelle')).toHaveLength(1);
  });

  it('a bar button stays out of Kaydet detection while İşlemler is hidden', async () => {
    setPageParams(TAB, { kod: 'C-1001' });
    const owned = { id: 'b_dizi', type: 'button', props: { slot: 'actions', text: 'Toplu güncelle', actionType: 'sequence', saveSequence: ['guncelle'] } };
    // Kaydet kartın düğmesidir; çubuğun dizi düğmesi ondan önce gelse de Kaydet sayılmaz.
    setup(recordPage(recordBar({ saveSequence: undefined, sequenceWhen: undefined, deleteQuery: undefined, moreButtons: ['b_dizi'], hiddenCommands: ['more'] }),
      [owned, ...recordComponents]));
    await waitFor(() => expect(shellButton('Kaydet')).toBeTruthy(), T);
    // İşlemler gizli: düğme sayfada (kabukta) kalır, ama ana düğme kartın Kaydet'idir.
    await waitFor(() => expect(shellButton('Toplu güncelle')).toBeTruthy(), T);
    expect([...shellBar().querySelectorAll('.page-shell-action--primary')].map((button) => button.textContent)).toEqual(['Kaydet']);
  });

  it('on the Studio canvas the bar mark selects the whole shell toolbar', async () => {
    definition = listPage();
    render(<CommandProvider><Grab /><ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider></KeepAliveViews>
    </CommandProvider>);
    await listReady();
    const mark = await waitFor(() => { const found = document.querySelector('template[data-cp-anchor="komutlar"]'); expect(found).not.toBeNull(); return found!; }, T);
    expect(mark.nextElementSibling).toBe(shellBar());
  });

  it('templated page without commands bar renders and registers as before', async () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    });
    setup(listPage(null));
    await screen.findByText('C-1001', undefined, T);
    await pause();
    expect(view()?.shell).toBeUndefined();
    for (const id of ['new', 'open', 'save', 'delete', 'export', 'print'] as const) expect(view()?.[id], id).toBeUndefined();
    // Sayfa düğmeleri bugünkü gibi; ana düğme ilk düğmedir.
    const left = shellBar().querySelector('.page-shell-bar-left')!;
    expect([...left.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Yeni teklif']);
    expect(left.querySelector('button')!.className).toContain('page-shell-action--primary');
    // Kabuk Alt+İ'yi üstlenmez (menüsü yoktur): taşan düğmeler menüsü Alt+İ ile açılmaz.
    expect(within(shellBar()).getByRole('button', { name: 'Diğer işlemler' }).getAttribute('aria-keyshortcuts')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'İ', altKey: true });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
