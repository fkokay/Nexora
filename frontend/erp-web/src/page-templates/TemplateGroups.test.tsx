import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { forgetOpener, setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';

// Kalıplı sayfada pencere ve grup iskeleti (taslak 12): özet üstte, içerik `contains` sırasıyla, sekmeler sonda, pencerenin
// düğmeleri alt satırda Kaydet'in solunda; grupta rozetler ilk satırda, düğmeler altta; genişlik ayarı uygulanmaz.
// Kalıpsız sayfada aynı tanım eski düzenle çizilir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const TAB = 'custom-page:p';
const T = { timeout: 5000 };
const rows = [{ id: '1', code: 'S-1' }];
const queries = [
  { id: 'siparisler', name: 'siparisler', kind: 'read', runOn: 'load', sql: 'SELECT Id AS id, Code AS code FROM O', parameters: [] },
  { id: 'kaydet', name: 'kaydet', kind: 'insert', runOn: 'manual', sql: 'INSERT INTO N DEFAULT VALUES', parameters: [] },
];
const components = [
  { id: 'liste_t', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'siparisler', title: 'Siparişler', columns: ['code'] } },
  { id: 'acDugmesi', type: 'button', props: { slot: 'actions', text: 'Pencereyi aç', actionType: 'openDialog', dialogId: 'pen' } },
  { id: 'pen', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'md', title: 'Sipariş', saveQuery: 'kaydet', contains: ['metin', 'penDugme', 'penGizli', 'sek', 'grupAcik', 'ozet', 'grupKapali'] } },
  { id: 'ozet', type: 'recordHeader', props: { slot: 'dialog', title: 'Özet başlığı' } },
  { id: 'metin', type: 'text', props: { slot: 'dialog', text: 'Ara metin' } },
  { id: 'penDugme', type: 'button', props: { slot: 'dialog', text: 'Yazdır', actionType: 'query', queryId: 'siparisler' } },
  { id: 'penGizli', type: 'button', props: { slot: 'dialog', text: 'Gizli düğme', actionType: 'query', queryId: 'siparisler', visibleWhen: "liste.seciliSatir.code == 'YOK'" } },
  { id: 'sek', type: 'tabs', props: { slot: 'dialog', tabs: ['Bilgi=sekMetin'] } },
  { id: 'sekMetin', type: 'text', props: { slot: 'dialog', text: 'Sekme metni' } },
  {
    id: 'grupAcik', type: 'section', props: { slot: 'dialog', title: 'Durum', description: 'Durum açıklaması', visibleWhen: "liste.seciliSatir.code == 'S-1'" },
    children: [
      { id: 'grupMetni', type: 'text', props: { text: 'Grup metni', width: 6 } },
      { id: 'rozet1', type: 'badge', props: { text: 'Onaylı' } },
      { id: 'grupDugme', type: 'button', props: { text: 'Grup düğmesi', actionType: 'query', queryId: 'siparisler' } },
      { id: 'rozet2', type: 'badge', props: { text: 'Acil' } },
    ],
  },
  {
    id: 'grupKapali', type: 'section', props: { slot: 'dialog', title: 'Gizli grup', visibleWhen: "liste.seciliSatir.code == 'YOK'" },
    children: [{ id: 'gizliRozet', type: 'badge', props: { text: 'Gizli rozet' } }],
  },
];
const templated = { schemaVersion: 2, template: { name: 'list' }, queries, components };
const unslot = (component: { props?: Record<string, unknown> }) => { const { slot: _slot, ...props } = component.props ?? {}; return { ...component, props }; };
const legacy = { schemaVersion: 2, queries, components: components.map(unslot) };

let definition: unknown;
let listReads: number;
beforeEach(() => {
  listReads = 0;
  localStorage.clear();
  api.mockReset();
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Siparişler', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [] };
    if (endpoint.includes('/queries/siparisler/run')) listReads += 1;
    if (endpoint.includes('/queries/siparisler/run')) return { columns: [{ code: 'id', label: 'id' }, { code: 'code', label: 'code' }], rows, rowCount: rows.length, truncated: false };
    return { affectedRows: 1 };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setPageParams(TAB, {});
  forgetOpener(TAB);
});

async function openDialog(page: unknown) {
  definition = page;
  render(<CommandProvider>
    <ActionBar locale="tr" />
    <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    <ConfirmDialogHost />
  </CommandProvider>);
  fireEvent.click((await screen.findByText('S-1', { selector: 'td, td *' }, T)).closest('tr')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pencereyi aç' })).toBeTruthy(), T);
  fireEvent.click(screen.getByRole('button', { name: 'Pencereyi aç' }));
  return screen.findByRole('dialog', undefined, T);
}

/** Metinlerin belgede göründüğü sıra. */
const orderOf = (root: HTMLElement, texts: string[]) => texts
  .map((text) => ({ text, node: within(root).getByText(text) }))
  .sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  .map((item) => item.text);
const bodyOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('.tenant-page-dialog-body')!;
const footerButtons = (dialog: HTMLElement) => [...dialog.querySelectorAll('.tenant-page-dialog-footer button')].map((button) => button.textContent);
const groupOf = (dialog: HTMLElement) => within(dialog).getByRole('heading', { name: 'Durum' }).closest('section')!;

describe('kalıplı pencere ve grup iskeleti', () => {
  it('templated dialog: summary first, contents in order, tabs last, its buttons left of Kaydet', async () => {
    const dialog = await openDialog(templated);
    expect(orderOf(bodyOf(dialog), ['Sekme metni', 'Durum', 'Ara metin', 'Özet başlığı'])).toEqual(['Özet başlığı', 'Ara metin', 'Durum', 'Sekme metni']);
    expect(within(bodyOf(dialog)).queryByText('Yazdır')).toBeNull();
    expect(footerButtons(dialog)).toEqual(['Yazdır', 'Vazgeç', 'Kaydet']);
    expect(within(dialog).queryByText('Gizli düğme')).toBeNull();
    // Alt satıra taşınan düğme eylemini aynen çalıştırır.
    const before = listReads;
    fireEvent.click(within(dialog.querySelector<HTMLElement>('.tenant-page-dialog-footer')!).getByRole('button', { name: 'Yazdır' }));
    await waitFor(() => expect(listReads).toBe(before + 1), T);
  });

  it('templated group: hidden group is not drawn; badges first row, buttons last row; no width style', async () => {
    const dialog = await openDialog(templated);
    expect(within(dialog).queryByText('Gizli grup')).toBeNull();
    expect(within(dialog).queryByText('Gizli rozet')).toBeNull();
    const group = groupOf(dialog);
    expect(within(group).getByText('Durum açıklaması')).toBeTruthy();
    const badges = group.querySelector<HTMLElement>('.tenant-page-group-badges')!;
    expect(within(badges).getAllByText(/Onaylı|Acil/).map((node) => node.textContent)).toEqual(['Onaylı', 'Acil']);
    const buttons = group.querySelector<HTMLElement>('.tenant-page-group-buttons')!;
    expect(within(buttons).getByRole('button', { name: 'Grup düğmesi' })).toBeTruthy();
    expect(orderOf(group, ['Grup düğmesi', 'Grup metni', 'Acil', 'Onaylı', 'Durum'])).toEqual(['Durum', 'Onaylı', 'Acil', 'Grup metni', 'Grup düğmesi']);
    expect(within(group).getByText('Grup metni').style.gridColumn).toBe('');
    const before = listReads;
    fireEvent.click(within(buttons).getByRole('button', { name: 'Grup düğmesi' }));
    await waitFor(() => expect(listReads).toBe(before + 1), T);
  });

  it('a group without badges or visible buttons draws no empty rows', async () => {
    const plain = { ...templated, components: templated.components.map((component) => component.id === 'grupAcik'
      ? { ...component, children: [{ id: 'yalniz', type: 'text', props: { text: 'Grup metni' } }] } : component) };
    const dialog = await openDialog(plain);
    const group = groupOf(dialog);
    expect(group.querySelector('.tenant-page-group-badges')).toBeNull();
    expect(group.querySelector('.tenant-page-group-buttons')).toBeNull();
  });

  it('the same definition without a template keeps the legacy layout', async () => {
    const dialog = await openDialog(legacy);
    expect(orderOf(bodyOf(dialog), ['Sekme metni', 'Durum', 'Ara metin', 'Özet başlığı', 'Yazdır'])).toEqual(['Ara metin', 'Yazdır', 'Sekme metni', 'Durum', 'Özet başlığı']);
    expect(footerButtons(dialog)).toEqual(['Vazgeç', 'Kaydet']);
    expect(within(dialog).queryByText('Gizli düğme')).toBeNull();
    const group = groupOf(dialog);
    expect(group.querySelector('.tenant-page-group-badges')).toBeNull();
    expect(orderOf(group, ['Grup düğmesi', 'Grup metni', 'Acil', 'Onaylı'])).toEqual(['Grup metni', 'Onaylı', 'Grup düğmesi', 'Acil']);
    expect(within(group).getByText('Grup metni').style.gridColumn).toBe('span 6');
  });
});

describe('Liste kalıbının detay kartı ve gizli girişleri', () => {
  const listOnly = (extra: unknown[]) => ({ schemaVersion: 2, template: { name: 'list' }, queries, components: [components[0], ...extra] });
  async function show(page: unknown) {
    definition = page;
    const view = render(<CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    </CommandProvider>);
    await screen.findByText('S-1', { selector: 'td, td *' }, T);
    return view.container;
  }
  // Kart grubu detay alanında yalnız seçili satır varken görünür.
  const card = { id: 'detayKarti', type: 'card', props: { slot: 'detail', variant: 'panel', title: '{{liste.seciliSatir.code}}' }, children: [
    { id: 'detayBos', type: 'text', props: { text: 'Bir lot veya seri seçin; ayrıntıları burada görün.', visibleWhen: 'liste.seciliSatir.code == null' } },
    { id: 'detayKod', type: 'text', props: { text: 'Seçili: {{liste.seciliSatir.code}}', visibleWhen: 'liste.seciliSatir.code != null' } },
  ] };

  it('a detail card is absent without a row selection and opens for the selected row', async () => {
    const container = await show(listOnly([card]));
    const detail = () => container.querySelector<HTMLElement>('.list-template-detail');
    expect(detail()).toBeNull();
    expect(container.querySelector('.list-template-list')!.classList.contains('is-full-width')).toBe(true);
    fireEvent.click(screen.getByText('S-1', { selector: 'td, td *' }).closest('tr')!);
    await waitFor(() => expect(detail()).not.toBeNull(), T);
    await waitFor(() => expect(within(detail()!).getByText('Seçili: S-1')).toBeTruthy(), T);
    expect(container.querySelector('.list-template-list')!.classList.contains('is-full-width')).toBe(false);
    fireEvent.click(screen.getByText('S-1', { selector: 'td, td *' }).closest('tr')!);
    await waitFor(() => expect(detail()).toBeNull(), T);
  });

  it('a detail panel still opens only with a row selection', async () => {
    const panel = { id: 'panel', type: 'contextPanel', props: { slot: 'detail', table: 'liste_t', fields: ['code=Kod'] } };
    const container = await show(listOnly([panel]));
    expect(container.querySelector('.list-template-detail')).toBeNull();
    fireEvent.click(screen.getByText('S-1', { selector: 'td, td *' }).closest('tr')!);
    await waitFor(() => expect(container.querySelector('.list-template-detail')).not.toBeNull(), T);
  });

  it('above / below holding only hidden inputs draw no wrapper and keep level 1', async () => {
    const hidden = (id: string, slot: string) => ({ id, type: 'input', name: id, props: { slot, hidden: true, inputType: 'number', defaultValue: '50' } });
    const container = await show(listOnly([hidden('sevkSayfaBoyutu', 'below'), hidden('ustGizli', 'above')]));
    expect(container.querySelector('.list-template-below')).toBeNull();
    expect(container.querySelector('.list-template-above')).toBeNull();
    expect(container.querySelector('.list-template')!.getAttribute('data-level')).toBe('1');
    // Görünür bir bileşen sarmalayıcıyı ve 2. basamağı geri getirir.
    cleanup();
    const shown = await show(listOnly([hidden('sevkSayfaBoyutu', 'below'), { id: 'not', type: 'text', props: { slot: 'below', text: 'Alt not' } }]));
    expect(within(shown.querySelector<HTMLElement>('.list-template-below')!).getByText('Alt not')).toBeTruthy();
    expect(shown.querySelector('.list-template')!.getAttribute('data-level')).toBe('2');
  });
});
