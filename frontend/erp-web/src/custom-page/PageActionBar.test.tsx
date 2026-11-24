import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage, { BAR_DELETE_CONFIRM, barDeleteConfirmTitle } from '../TenantCustomPage';

const { api, downloadXlsx, downloadCsv } = vi.hoisted(() => ({ api: vi.fn(), downloadXlsx: vi.fn(), downloadCsv: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));
vi.mock('../general-ledger/ledgerReportUtils', () => ({ downloadXlsx, downloadCsv }));

const queries = [
  { id: 'qr', name: 'Liste', kind: 'read', runOn: 'load', parameters: [] },
  { id: 'qi', name: 'Ekle', kind: 'insert', runOn: 'manual', parameters: [] },
  { id: 'qd', name: 'Sil', kind: 'delete', runOn: 'manual', parameters: [] },
];
const baseComponents = [
  { id: 'in1', type: 'input', name: 'baslik', props: { inputType: 'text', label: 'Başlık' } },
  { id: 't1', type: 'dataTable', name: 'Tablo', props: { query: 'qr', title: 'Liste', columns: ['ad', 'tutar'] } },
  { id: 'b1', type: 'button', props: { text: 'Onayla', actionType: 'query', queryId: 'qi' } },
  { id: 'b2', type: 'button', props: { text: 'Kalan', actionType: 'query', queryId: 'qi' } },
];
const bar = { id: 'bar', type: 'actionBar', props: { saveQuery: 'qi', deleteQuery: 'qd', exportTable: 't1', moreButtons: ['b1'], newInputs: ['in1'] } };

let writes: string[] = [];
let insertDelay = 0;
let truncated = false;

function mockApi(components: unknown[]) {
  api.mockImplementation(async (endpoint: string) => {
    if (!endpoint.includes('/queries/') && (endpoint.includes('/published') || endpoint.includes('/preview'))) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    if (endpoint.includes('/queries/qr/run')) {
      return { columns: [{ code: 'ad', label: 'Ad' }, { code: 'tutar', label: 'Tutar' }], rows: [{ ad: '=SUM(A1)', tutar: 12.5 }], rowCount: 1, truncated };
    }
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? '';
    writes.push(id);
    if (insertDelay) await new Promise((resolve) => setTimeout(resolve, insertDelay));
    return { affectedRows: 1 };
  });
}

function setup(components: unknown[], previewId?: string) {
  mockApi(components);
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" previewId={previewId} token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const button = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const disabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

beforeEach(() => { writes = []; insertDelay = 0; truncated = false; api.mockReset(); downloadXlsx.mockReset(); downloadCsv.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Sayfa İşlem Çubuğu bağlama', () => {
  it('actionBar olmayan sayfada çubukta standart düğme çizilmez', async () => {
    setup(baseComponents);
    await screen.findByText('Kalan');
    // Hiçbir kaynağın kaydetmediği komut gizlenir.
    for (const id of ['new', 'open', 'save', 'delete', 'refresh', 'filter', 'print', 'export']) expect(button(id)).toBeNull();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(writes).toEqual([]);
  });

  it('actionBar bağlı sayfada Ctrl+S tek yazma isteği gönderir (hızlı iki basış da tek)', async () => {
    insertDelay = 30;
    setup([...baseComponents, bar]);
    await waitFor(() => expect(disabled(button('save'))).toBe(false));
    expect(button('save').getAttribute('data-primary')).toBe('true');
    expect(disabled(button('open'))).toBe(true);
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await screen.findByRole('status');
    expect(writes).toEqual(['qi']);
    expect(screen.getByRole('status').textContent).toContain('İşlem tamamlandı. (1 kayıt)');
    expect(screen.getByRole('status').className).toContain('tenant-page-action-status');
  });

  it('Sil onay sorar: Vazgeç istek göndermez, Sil gönderir ve durum satırında kayıt sayısı görünür', async () => {
    setup([...baseComponents, bar]);
    await waitFor(() => expect(disabled(button('delete'))).toBe(false));
    fireEvent.click(button('delete'));
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Kayıt silinsin mi?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Vazgeç/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(writes).toEqual([]);

    fireEvent.click(button('delete'));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Sil/ }));
    await waitFor(() => expect(writes).toEqual(['qd']));
    expect((await screen.findByRole('status')).textContent).toContain('(1 kayıt)');
  });

  it('deleteConfirmText Sil onayını tıklama anındaki değerlerle adlandırır; değer yoksa genel başlık kalır', async () => {
    setup([...baseComponents, { ...bar, props: { ...bar.props, deleteConfirmText: '{{baslik.value}} kaydı silinsin mi?' } }]);
    await waitFor(() => expect(disabled(button('delete'))).toBe(false));
    fireEvent.click(button('delete'));
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Kayıt silinsin mi?');
    fireEvent.click(within(dialog).getByRole('button', { name: /Vazgeç/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.change(document.getElementById('page-input-in1')!, { target: { value: 'Ocak' } });
    fireEvent.click(button('delete'));
    dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Ocak kaydı silinsin mi?');
  });

  it('barDeleteConfirmTitle: boş metin, bağlamasız metin ve boş bağlamalar', () => {
    const scope = { liste: { seciliSatir: { code: 'C-1', name: 'ACME', bos: '' } } };
    expect(barDeleteConfirmTitle(undefined, scope)).toBe(BAR_DELETE_CONFIRM);
    expect(barDeleteConfirmTitle('  ', scope)).toBe(BAR_DELETE_CONFIRM);
    expect(barDeleteConfirmTitle('Kart silinsin mi?', scope)).toBe('Kart silinsin mi?');
    expect(barDeleteConfirmTitle('{{liste.seciliSatir.code}} · {{liste.seciliSatir.name}} cari kartı silinsin mi?', scope)).toBe('C-1 · ACME cari kartı silinsin mi?');
    expect(barDeleteConfirmTitle('{{liste.seciliSatir.bos}} {{yok.alan}} silinsin mi?', scope)).toBe(BAR_DELETE_CONFIRM);
  });

  it('moreButtons düğmesi sayfada çizilmez, İşlemler menüsünde bulunur; actionBar yoksa sayfaya döner', async () => {
    const { unmount } = setup([...baseComponents, bar]);
    await screen.findByText('Kalan');
    expect(screen.queryAllByRole('button', { name: 'Onayla' })).toHaveLength(0);
    fireEvent.click(button('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Onayla/ }));
    await waitFor(() => expect(writes).toEqual(['qi']));
    unmount();
    cleanup();
    setup(baseComponents);
    expect(await screen.findByRole('button', { name: 'Onayla' })).toBeTruthy();
  });

  it('Excel tablonun sorgu satırlarıyla downloadXlsx çağırır', async () => {
    setup([...baseComponents, bar]);
    await waitFor(() => expect(disabled(button('export'))).toBe(false));
    fireEvent.click(button('export'));
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalledWith('p.xlsx', 'Liste', [['Ad', 'Tutar'], ['=SUM(A1)', 12.5]]));
  });

  it('Excel bağlıysa İşlemler › "CSV olarak dışa aktar" aynı satırlarla downloadCsv çağırır', async () => {
    setup([...baseComponents, bar]);
    await waitFor(() => expect(disabled(button('export'))).toBe(false));
    fireEvent.click(button('more'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /CSV olarak dışa aktar/ }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledWith('p.csv', [['Ad', 'Tutar'], ['=SUM(A1)', 12.5]]));
    expect(downloadXlsx).not.toHaveBeenCalled();
  });

  it('exportCsv: false İşlemler menüsüne CSV koymaz; Excel bağlı değilse CSV de yoktur', async () => {
    const { unmount } = setup([...baseComponents, { ...bar, props: { ...bar.props, exportCsv: false } }]);
    await waitFor(() => expect(disabled(button('export'))).toBe(false));
    fireEvent.click(button('more'));
    await screen.findByRole('menuitem', { name: /Onayla/ });
    expect(screen.queryByRole('menuitem', { name: /CSV/ })).toBeNull();
    unmount();
    cleanup();
    const { exportTable: _unused, ...withoutExport } = bar.props;
    setup([...baseComponents, { ...bar, props: withoutExport }]);
    await waitFor(() => expect(disabled(button('save'))).toBe(false));
    fireEvent.click(button('more'));
    await screen.findByRole('menuitem', { name: /Onayla/ });
    expect(screen.queryByRole('menuitem', { name: /CSV/ })).toBeNull();
  });

  it('kesilmiş liste dışa aktarılınca durum satırında uyarı görünür', async () => {
    truncated = true;
    setup([...baseComponents, bar]);
    await waitFor(() => expect(disabled(button('export'))).toBe(false));
    fireEvent.click(button('export'));
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.tenant-page-action-status.is-warning')?.textContent).toContain('Liste ilk 1 satırla sınırlı'));
  });

  it('moreButtons içinde eylemi kullanılamayan düğme sayfada kalır', async () => {
    const orphan = { id: 'b3', type: 'button', props: { text: 'Yetim', actionType: 'query', queryId: 'yok' } };
    setup([...baseComponents, orphan, { ...bar, props: { ...bar.props, moreButtons: ['b1', 'b3'] } }]);
    expect(await screen.findByRole('button', { name: 'Yetim' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Onayla' })).toHaveLength(0);
  });

  it('önizlemede sorgu düğmesi her zaman onay sorar (tehlike tonu) ve confirmWrite gönderir', async () => {
    setup(baseComponents, 'draft1');
    fireEvent.click(await screen.findByRole('button', { name: 'Kalan' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('taslak önizlemesinde');
    expect(dialog.className).toContain('is-danger');
    expect(writes).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').find((item) => /Onayla/.test(item.textContent ?? ''))!);
    await waitFor(() => expect(writes).toEqual(['qi']));
    const write = api.mock.calls.find(([endpoint]) => /queries\/qi\/run/.test(endpoint as string));
    expect(JSON.parse((write![2] as { body: string }).body).confirmWrite).toBe(true);
  });
});
