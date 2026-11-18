import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CommandProvider } from '../commands/CommandProvider';
import { DataTableGrid, type DataTableGridProps } from './DataTableGrid';
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

  it('toplamlar ızgaranın altında çizilir; boş sonuçta boş metin görünür', () => {
    const { rerender } = render(<Harness totals={['miktar']} />);
    expect(document.querySelector('.tenant-page-grid-totals')?.textContent).toContain('8');
    rerender(<CommandProvider><DataTableGrid gridId="g" state={{ ...state, rows: [], rowCount: 0 }} columns={[]} title="T" description="" style={{}} emptyText="Kayıt yok." /></CommandProvider>);
    expect(screen.getByText('Kayıt yok.')).toBeTruthy();
  });
});
