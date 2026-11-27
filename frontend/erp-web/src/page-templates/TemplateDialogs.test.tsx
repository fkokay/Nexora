import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { forgetOpener, setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';

// Kalıplı sayfada pencereler (5b-2 adım 2): üst düzey `dialog` `dialogs` yerinde, içeriği `dialog` yerinde. Pencere kapalıyken
// hiçbir şey çizilmez; içerik (sekmenin işaret ettikleri dahil) gövdede görünmez. Açılış eskisi gibi: `openDialog` düğmesi
// (komut çubuğunun Aç'ı) ve tablonun `openParam`'ı.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const TAB = 'custom-page:p';
const T = { timeout: 5000 };

const queries = [
  { id: 'siparisler', name: 'siparisler', kind: 'read', runOn: 'load', sql: 'SELECT Id AS id, Code AS code FROM O', parameters: [] },
  { id: 'notEkle', name: 'notEkle', kind: 'insert', runOn: 'manual', sql: 'INSERT INTO N (Note) VALUES (@note)', parameters: [{ name: 'note', binding: '{{notGirdisi.value}}', type: 'text' }] },
];
const listComponents = (extra: { id: string; type: string; name?: string; props?: Record<string, unknown>; children?: unknown[] }[] = []) => [
  { id: 'komutlar', type: 'actionBar', props: { slot: 'commands', openButton: 'acDugmesi', exportTable: 'liste_t' } },
  { id: 'acDugmesi', type: 'button', props: { slot: 'actions', text: 'Aç', actionType: 'openDialog', dialogId: 'siparisPenceresi' } },
  { id: 'notDugmesi', type: 'button', props: { slot: 'actions', text: 'Not ekle', actionType: 'openDialog', dialogId: 'notPenceresi' } },
  { id: 'liste_t', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'siparisler', title: 'Siparişler', columns: ['code'], rowOpenAction: 'satirAc', openParam: 'orderId' } },
  { id: 'satirAc', type: 'button', props: { slot: 'rowActions', text: 'Aç', actionType: 'openDialog', dialogId: 'siparisPenceresi' } },
  {
    id: 'detay', type: 'card', props: { slot: 'detail', title: 'Seçili sipariş' },
    children: [{ id: 'detayKodu', type: 'text', props: { text: 'Kod: {{liste.seciliSatir.code}}' } }],
  },
  { id: 'siparisPenceresi', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'xl', title: 'Satış siparişi · {{liste.seciliSatir.code}}', contains: ['ozetMetni', 'sekmeler'] } },
  { id: 'ozetMetni', type: 'text', props: { slot: 'dialog', text: 'Sipariş özeti {{liste.seciliSatir.code}}' } },
  { id: 'sekmeler', type: 'tabs', props: { slot: 'dialog', tabs: ['Teslim=teslimMetni'] } },
  { id: 'teslimMetni', type: 'text', props: { slot: 'dialog', text: 'Teslim bilgisi' } },
  { id: 'notPenceresi', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'md', title: 'Not ekle', contains: ['notFormu'], saveQuery: 'notEkle', closeOnSave: true, refreshQueries: ['siparisler'] } },
  { id: 'notFormu', type: 'formCard', props: { slot: 'dialog', inputs: ['notGirdisi'] } },
  { id: 'notGirdisi', type: 'input', name: 'notGirdisi', props: { slot: 'dialog', label: 'Not', inputType: 'text' } },
  ...extra,
];
const listPage = () => ({ schemaVersion: 2, template: { name: 'list' }, queries, components: listComponents() });
const rows = [{ id: '1', code: 'S-1' }, { id: '2', code: 'S-2' }];

type Call = { endpoint: string; body: string };
let calls: Call[];
let definition: unknown;

beforeEach(() => {
  localStorage.clear();
  calls = [];
  api.mockReset();
  api.mockImplementation(async (endpoint: string, _token?: string, init?: RequestInit) => {
    if (endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Siparişler', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [] };
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ endpoint, body });
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? '';
    if (id === 'siparisler') return { columns: [{ code: 'id', label: 'id' }, { code: 'code', label: 'code' }], rows, rowCount: rows.length, truncated: false };
    return { affectedRows: 1 };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setPageParams(TAB, {});
  forgetOpener(TAB);
});

function setup(page: unknown) {
  definition = page;
  return render(<CommandProvider>
    <ActionBar locale="tr" />
    <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    <ConfirmDialogHost />
  </CommandProvider>);
}

const ran = (query: string) => calls.filter((call) => call.endpoint.includes(`/queries/${query}/run`));
const shellBar = () => screen.getByRole('toolbar', { name: 'İşlemler' });
const command = (id: string) => shellBar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const selectRow = async (code: string) => { fireEvent.click((await screen.findByText(code, { selector: 'td, td *' }, T)).closest('tr')!); };
const listReady = () => screen.findByText('S-1', { selector: 'td, td *' }, T);

describe('kalıplı sayfada pencereler', () => {
  it('a closed dialog draws nothing; its contents (tab targets included) stay out of the body', async () => {
    setup(listPage());
    await listReady();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Sipariş özeti', { exact: false })).toBeNull();
    expect(screen.queryByText('Teslim bilgisi')).toBeNull();
    expect(screen.queryByLabelText('Not')).toBeNull();
  });

  it('the bar Aç (openButton → openDialog button) opens the dialog with its bound title', async () => {
    setup(listPage());
    await selectRow('S-1');
    await waitFor(() => expect(command('open')?.getAttribute('aria-disabled')).not.toBe('true'), T);
    // Düğme kipindeki Aç komutu kabukta "Düzenle" adıyla çizilir (Görüntüle yalnız sayfa açan Aç'ta vardır; açılış değişmez).
    expect(command('open')!.textContent).toBe('Düzenle');
    fireEvent.click(command('open')!);
    const dialog = await screen.findByRole('dialog', undefined, T);
    expect(within(dialog).getByRole('heading', { name: 'Satış siparişi · S-1' })).toBeTruthy();
    expect(within(dialog).getByText('Sipariş özeti S-1')).toBeTruthy();
    expect(within(dialog).getByText('Teslim bilgisi')).toBeTruthy();
    expect(dialog.closest('.tenant-page-dialog-backdrop')!.querySelector('.tenant-page-dialog')!.getAttribute('data-size')).toBe('xl');
  });

  it('openParam opens the dialog on arrival', async () => {
    setPageParams(TAB, { orderId: '2' });
    setup(listPage());
    const dialog = await screen.findByRole('dialog', undefined, T);
    expect(within(dialog).getByRole('heading', { name: 'Satış siparişi · S-2' })).toBeTruthy();
  });

  it('a form dialog saves its saveQuery, closes on save and refreshes refreshQueries', async () => {
    setup(listPage());
    await listReady();
    await waitFor(() => expect(ran('siparisler')).toHaveLength(1), T);
    fireEvent.click(within(shellBar()).getByRole('button', { name: 'Not ekle' }));
    const dialog = await screen.findByRole('dialog', undefined, T);
    fireEvent.change(within(dialog).getByLabelText('Not'), { target: { value: 'Acele' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(ran('notEkle')).toHaveLength(1), T);
    expect(ran('notEkle')[0].body).toContain('Acele');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);
    await waitFor(() => expect(ran('siparisler')).toHaveLength(2), T);
  });

  it('resetOnOpen clears the field on the next opening', async () => {
    setup(listPage());
    await listReady();
    fireEvent.click(within(shellBar()).getByRole('button', { name: 'Not ekle' }));
    let dialog = await screen.findByRole('dialog', undefined, T);
    fireEvent.change(within(dialog).getByLabelText('Not'), { target: { value: 'Taslak not' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);
    fireEvent.click(within(shellBar()).getByRole('button', { name: 'Not ekle' }));
    dialog = await screen.findByRole('dialog', undefined, T);
    expect((within(dialog).getByLabelText('Not') as HTMLInputElement).value).toBe('');
  });

  it('the detail card shows the selected row', async () => {
    setup(listPage());
    await selectRow('S-2');
    const detail = await waitFor(() => { const element = document.querySelector('.list-template-detail'); expect(element).toBeTruthy(); return element as HTMLElement; }, T);
    expect(within(detail).getByText('Seçili sipariş')).toBeTruthy();
    expect(within(detail).getByText('Kod: S-2')).toBeTruthy();
  });

  it('record and free templates draw their dialogs too', async () => {
    const dialogParts = [
      { id: 'b_ac', type: 'button', props: { slot: 'actions', text: 'Pencereyi aç', actionType: 'openDialog', dialogId: 'pen' } },
      { id: 'pen', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'md', title: 'Ayrıntı', contains: ['penSekme'] } },
      { id: 'penSekme', type: 'tabs', props: { slot: 'dialog', tabs: ['Bilgi=penTablo,penMetin'] } },
      { id: 'penTablo', type: 'dataTable', name: 'penTablo', props: { slot: 'dialog', query: 'siparisler', columns: ['code'] } },
      { id: 'penMetin', type: 'text', props: { slot: 'dialog', text: 'Pencere metni' } },
    ];
    const pages = [
      { schemaVersion: 2, template: { name: 'record' }, queries, components: [
        { id: 'ozet', type: 'recordHeader', props: { slot: 'summary', title: 'Kart' } },
        { id: 'sek', type: 'tabs', props: { slot: 'tabs', tabs: ['Genel=not1'] } },
        { id: 'not1', type: 'text', props: { slot: 'note', text: 'Kart notu' } },
        ...dialogParts,
      ] },
      { schemaVersion: 2, template: { name: 'free' }, queries, components: [
        { id: 'blok', type: 'section', props: { slot: 'block', title: 'Blok', members: ['uye'] } },
        { id: 'uye', type: 'text', props: { slot: 'item', text: 'Üye metni' } },
        ...dialogParts,
      ] },
    ];
    for (const page of pages) {
      setup(page);
      const open = await screen.findByRole('button', { name: 'Pencereyi aç' }, T);
      expect(screen.queryByText('Pencere metni')).toBeNull();
      fireEvent.click(open);
      const dialog = await screen.findByRole('dialog', undefined, T);
      expect(within(dialog).getByText('Pencere metni')).toBeTruthy();
      expect(await within(dialog).findByText('S-1', undefined, T)).toBeTruthy();
      expect(within(dialog).queryByText('Kayıt kaydedilince burada görünür.')).toBeNull();
      cleanup();
    }
  });
});
