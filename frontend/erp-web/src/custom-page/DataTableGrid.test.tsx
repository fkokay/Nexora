import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CommandProvider } from '../commands/CommandProvider';
import { ALL_GRID_TOOLS, DataTableGrid, gridToolsOf, type DataTableGridProps } from './DataTableGrid';

const xlsx = vi.hoisted(() => ({ sheets: [] as unknown[][][] }));
vi.mock('xlsx', () => ({
  utils: { book_new: () => ({}), aoa_to_sheet: (data: unknown[][]) => { xlsx.sheets.push(data); return {}; }, book_append_sheet: () => {} },
  writeFileXLSX: () => {},
}));
import type { QueryState } from './usePageQueries';
import type { RowAction } from '../TenantCustomPage';

afterEach(() => { cleanup(); localStorage.clear(); });
// jsdom'da yok: ızgara sıralamada kaydırmayı başa alır.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;

const rows = [
  { id: 'a', kod: 'K1', ad: 'Elma', durum: 'Aktif', miktar: 3, birim: 'Adet' },
  { id: 'b', kod: 'K2', ad: 'Armut', durum: 'Pasif', miktar: 5, birim: 'Kg' },
];
const state: QueryState = {
  rows, rowCount: rows.length, truncated: false, loading: false, error: '', ran: true,
  columns: [{ code: 'kod', label: 'Kod' }, { code: 'ad', label: 'Ad' }, { code: 'durum', label: 'Durum' }, { code: 'miktar', label: 'Miktar', dataType: 'decimal' }, { code: 'birim', label: 'Birim' }],
};

function Harness(props: Partial<DataTableGridProps> & { onSelected?: (row: Record<string, unknown> | null) => void }) {
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  return <CommandProvider>
    <DataTableGrid gridId="custom-page.p.t" state={state} columns={['ad', 'kod', 'durum', 'miktar']} title="Kartlar" description="" style={{}}
      columnLabels={{ ad: 'Ürün adı' }} columnUnits={{ miktar: 'birim' }} valueLabels={{ durum: { Pasif: 'Kapalı' } }}
      selected={selected} onSelect={(row) => { setSelected(row); props.onSelected?.(row); }} {...props} />
  </CommandProvider>;
}

const dataRows = () => Array.from(document.querySelectorAll<HTMLElement>('.tenant-page-data-grid tbody tr'));
const dataCells = (row: HTMLElement) => Array.from(row.querySelectorAll('td:not(.advanced-grid-select-cell)')).map((cell) => cell.textContent);

describe('DataTableGrid (gelişmiş ızgara)', () => {
  it('sütunları tasarımcı sırasıyla, etiket, birim ve değer etiketleriyle gelişmiş ızgarada çizer', () => {
    render(<Harness />);
    const grid = document.querySelector('.tenant-page-data-grid .advanced-grid');
    expect(grid).not.toBeNull();
    const headers = Array.from(document.querySelectorAll('.tenant-page-data-grid thead th:not(.advanced-grid-select-cell)')).map((cell) => cell.textContent);
    expect(headers).toEqual(['Ürün adı', 'Kod', 'Durum', 'Miktar']);
    expect(dataCells(dataRows()[0])).toEqual(['Elma', 'K1', 'Aktif', '3 Adet']);
    expect(dataCells(dataRows()[1])[2]).toBe('Kapalı');
    // Yerleşik listelerdeki araçlar: sütun filtreleri, sütun seçici ve pivot.
    expect(screen.getAllByText('Sütun filtreleri').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sütunlar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pivot görünümü').length).toBeGreaterThan(0);
  });

  it('başlık tıklaması sıralar', () => {
    render(<Harness />);
    const header = Array.from(document.querySelectorAll<HTMLElement>('.tenant-page-data-grid thead th')).find((cell) => cell.textContent?.startsWith('Ürün adı'))!;
    fireEvent.click(header);
    expect(dataRows().map((row) => dataCells(row)[0])).toEqual(['Armut', 'Elma']);
    expect(header.getAttribute('aria-sort')).toBe('ascending');
  });

  it('satır tıklaması sayfa seçimini (güncel satır) değiştirir; onay kutusu seçimi değiştirmez', () => {
    const onSelected = vi.fn();
    render(<Harness onSelected={onSelected} />);
    fireEvent.click(dataRows()[1]);
    expect(onSelected).toHaveBeenCalledTimes(1);
    expect(onSelected).toHaveBeenLastCalledWith(rows[1]);
    expect(dataRows()[1].getAttribute('aria-current')).toBe('true');
    // Aynı satıra yeniden tıklama seçimi kaldırır.
    fireEvent.click(dataRows()[1]);
    expect(onSelected).toHaveBeenLastCalledWith(null);
    expect(dataRows()[1].getAttribute('aria-current')).toBeNull();
    // Onay kutusu ızgara içi çoklu seçimdir.
    onSelected.mockClear();
    const box = within(dataRows()[0]).getByRole('checkbox');
    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(dataRows()[0].getAttribute('aria-selected')).toBe('true');
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('satır işlemi kendi satırıyla çalışır ve satır seçimini değiştirmez', () => {
    const run = vi.fn();
    const onSelected = vi.fn();
    const action: RowAction = { id: 'ac', label: 'Aç', visible: (row) => row.id !== 'b', disabled: () => null, run };
    render(<Harness onSelected={onSelected} rowActions={[action]} />);
    expect(within(dataRows()[1]).queryByRole('button', { name: 'Aç' })).toBeNull();
    fireEvent.click(within(dataRows()[0]).getByRole('button', { name: 'Aç' }));
    expect(run).toHaveBeenCalledWith(rows[0], expect.any(HTMLElement));
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('çift tıklama ve Enter satırı açar', () => {
    const open = vi.fn();
    render(<Harness onOpenRow={open} />);
    fireEvent.doubleClick(dataRows()[0]);
    expect(open).toHaveBeenLastCalledWith(rows[0]);
    fireEvent.keyDown(dataRows()[1], { key: 'Enter' });
    expect(open).toHaveBeenLastCalledWith(rows[1]);
    expect(dataRows()[1].getAttribute('aria-current')).toBe('true');
  });

  it('görünüm ayarlarını sayfa ve bileşen kimliğinden türeyen anahtarla saklar', () => {
    render(<Harness />);
    expect(localStorage.getItem('nexora.grid.custom-page.p.t')).not.toBeNull();
  });

  it('toolbarToggles: Sütunlar menüsünün yanında aria-pressed düğme çizer; tıklama ve klavye (Enter) değiştirir', () => {
    function ToggleHarness() {
      const [open, setOpen] = useState(false);
      return <Harness toolbarToggles={[{ id: 'detayPaneli', label: 'Detay paneli', pressed: open, onToggle: () => setOpen((value) => !value) }]} />;
    }
    render(<ToggleHarness />);
    const toggle = screen.getByRole('button', { name: 'Detay paneli' });
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.classList.contains('active')).toBe(false);
    expect(toggle.closest('.advanced-grid-toolbar')).toBeTruthy();
    // Görünüm menüsüne toplanmaz (data-grid-tool değil): dar çubukta ve tam ekranda da çubukta kalır.
    expect(toggle.hasAttribute('data-grid-tool')).toBe(false);
    expect(toggle.previousElementSibling?.querySelector('summary')?.textContent).toBe('Sütunlar');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Detay paneli' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Detay paneli' }).classList.contains('active')).toBe(true);
    // Yerel <button>: Enter/Boşluk tarayıcıda tıklama üretir; odaklanabilir olması yeterlidir.
    screen.getByRole('button', { name: 'Detay paneli' }).focus();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Detay paneli' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detay paneli' }));
    expect(screen.getByRole('button', { name: 'Detay paneli' }).getAttribute('aria-pressed')).toBe('false');
    // Tam ekranda da çubukta kalır.
    fireEvent.click(screen.getByTitle('Tam ekran'));
    expect(screen.getByRole('button', { name: 'Detay paneli' })).toBeTruthy();
  });

  it('toolbarToggles verilmezse düğme çizilmez', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Detay paneli' })).toBeNull();
  });

  it('gridToolsOf: showCsv ve showSelectedExport yoksa açık, yalnız false kapatır', () => {
    expect(gridToolsOf(undefined)).toEqual(ALL_GRID_TOOLS);
    expect(gridToolsOf({ showCsv: false, showSelectedExport: false })).toMatchObject({ export: true, csv: false, selectedExport: false });
    expect(gridToolsOf({ showCsv: true, showSelectedExport: 'hayır' })).toMatchObject({ csv: true, selectedExport: true });
  });

  it('onay kutusuyla seçim varken "Excel (seçilenler)" yalnız seçili satırları görünen sütun ve biçimlerle aktarır', async () => {
    render(<Harness />);
    expect(screen.queryByRole('toolbar', { name: 'Toplu işlemler' })).toBeNull();
    xlsx.sheets.length = 0;
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'));
    const bulk = screen.getByRole('toolbar', { name: 'Toplu işlemler' });
    fireEvent.click(within(bulk).getByRole('button', { name: 'Excel (seçilenler)' }));
    await waitFor(() => expect(xlsx.sheets).toHaveLength(1));
    expect(xlsx.sheets[0]).toEqual([['Ürün adı', 'Kod', 'Durum', 'Miktar'], ['Armut', 'K2', 'Kapalı', '5 Kg']]);
  });

  it('satır kümesi aynı sayıyla yenilenince işaretler kalkar: "Seçilenleri sil" başka kayıtlara ulaşmaz', () => {
    const run = vi.fn(async () => true);
    const view = (current: QueryState) => <CommandProvider><DataTableGrid gridId="g" state={current} columns={['kod', 'ad']} title="T" description="" style={{}}
      bulkDelete={{ disabledReason: null, run }} /></CommandProvider>;
    const { rerender } = render(view(state));
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'));
    expect(document.querySelectorAll('tbody input[type=checkbox]:checked')).toHaveLength(1);
    // Aynı satır kümesiyle yeniden çizim işareti korur.
    rerender(view(state));
    expect(document.querySelectorAll('tbody input[type=checkbox]:checked')).toHaveLength(1);
    // Yenileme: aynı satır sayısı, başka kayıtlar (r1 artık başka satırdır).
    const refreshed = [{ id: 'c', kod: 'K3', ad: 'Ayva', durum: 'Aktif', miktar: 1, birim: 'Adet' }, { id: 'd', kod: 'K4', ad: 'Nar', durum: 'Aktif', miktar: 2, birim: 'Adet' }];
    rerender(view({ ...state, rows: refreshed }));
    expect(document.querySelectorAll('tbody input[type=checkbox]:checked')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Seçilenleri sil' })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('showSelectedExport: false seçimde toplu aktarım çubuğunu çizmez', () => {
    render(<Harness tools={{ ...ALL_GRID_TOOLS, selectedExport: false }} />);
    fireEvent.click(within(dataRows()[0]).getByRole('checkbox'));
    expect(screen.queryByRole('button', { name: 'Excel (seçilenler)' })).toBeNull();
  });

  it('CSV düğmesi UTF-8 BOM ve virgül ayraçla görünen sütunları indirir (seçim varsa yalnız seçilenler); showCsv: false gizler', async () => {
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { blobs.push(blob as Blob); return 'blob:x'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const { unmount } = render(<Harness />);
      fireEvent.click(within(dataRows()[0]).getByRole('checkbox'));
      fireEvent.click(screen.getAllByRole('button', { name: 'CSV' })[0]);
      expect(blobs).toHaveLength(1);
      const bytes = new Uint8Array(await blobs[0].arrayBuffer());
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(bytes.slice(3));
      expect(text).toBe('"Ürün adı","Kod","Durum","Miktar"\r\n"Elma","K1","Aktif","3 Adet"');
      unmount();
      render(<Harness tools={{ ...ALL_GRID_TOOLS, csv: false }} />);
      expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'XLSX' }).length).toBeGreaterThan(0);
    } finally { create.mockRestore(); revoke.mockRestore(); click.mockRestore(); }
  });

  it('toplamlar ızgaranın altında çizilir; boş sonuçta boş metin görünür', () => {
    const { rerender } = render(<Harness totals={['miktar']} />);
    expect(document.querySelector('.tenant-page-grid-totals')?.textContent).toContain('8');
    rerender(<CommandProvider><DataTableGrid gridId="g" state={{ ...state, rows: [], rowCount: 0 }} columns={[]} title="T" description="" style={{}} emptyText="Kayıt yok." /></CommandProvider>);
    expect(screen.getByText('Kayıt yok.')).toBeTruthy();
  });
});
