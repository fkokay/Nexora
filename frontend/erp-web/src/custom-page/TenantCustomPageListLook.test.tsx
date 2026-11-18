import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage, { PageInput, QueryTable } from '../TenantCustomPage';
import { parseColumnFormats } from './cellFormat';
import { FormCard } from './LayoutComponents';
import type { QueryState } from './usePageQueries';

// Proje 4 liste görünümü: tek satır form kartı, koşullu genişlik, zorunlu işareti, sabit seçenekli açılır liste,
// sütun başlığı/birim/değer etiketi ve dar tabloda kod/metin hücre sınıfları.

const definition = {
  schemaVersion: 2,
  components: [
    { id: 'panel', type: 'input', name: 'panel', props: { inputType: 'checkbox', label: 'Detay paneli', defaultValue: 'true' } },
    { id: 'baslik', type: 'heading', props: { text: 'Liste', width: 12, widthWhen: '8=panel.value == true' } },
  ],
  queries: [],
};

vi.mock('../erpApi', () => ({
  api: vi.fn(async (endpoint: string) => endpoint.includes('/published')
    ? { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], definitionJson: JSON.stringify(definition) }
    : { entity: { name: 'x', fields: [] }, items: [], total: 0 }),
}));

afterEach(cleanup);

const state = (rows: Record<string, unknown>[], columns: { code: string; label: string; dataType?: string }[]): QueryState =>
  ({ rows, rowCount: rows.length, columns, truncated: false, loading: false, error: '', ran: true });
const component = (id: string) => ({ id, type: 'input', name: id });

describe('liste görünümü', () => {
  it('widthWhen koşul tutunca sütun genişliğini değiştirir, tutmayınca width kalır', async () => {
    render(<TenantCustomPage code="p" token="t" />);
    const heading = await screen.findByRole('heading', { name: 'Liste' });
    await waitFor(() => expect(heading.style.gridColumn).toBe('span 8'));
    fireEvent.click(screen.getByLabelText('Detay paneli'));
    await waitFor(() => expect(heading.style.gridColumn).toBe('span 12'));
  });

  it('tek satır form kartı başlığı çizmez, bölgeye ad verir ve ızgara sütunu kullanmaz', () => {
    const { container } = render(<FormCard title="Süzgeçler" columns={3} style={{}} inline><span>a</span><span>b</span></FormCard>);
    const card = container.querySelector('.tenant-page-form-card')!;
    expect(card.classList.contains('is-inline')).toBe(true);
    expect(card.querySelector('h3')).toBeNull();
    expect(screen.getByRole('region', { name: 'Süzgeçler' })).toBe(card);
    const grid = card.querySelector('.tenant-page-form-card-grid')!;
    expect(grid.classList.contains('is-inline')).toBe(true);
    expect(grid.classList.contains('is-cols-3')).toBe(false);
    expect(grid.querySelectorAll('.tenant-page-form-card-cell')).toHaveLength(2);
  });

  it('ızgara form kartı başlığını ve sütun sınıfını korur', () => {
    const { container } = render(<FormCard title="Kimlik" columns={3} style={{}}><span>a</span></FormCard>);
    expect(container.querySelector('h3')?.textContent).toBe('Kimlik');
    expect(container.querySelector('.tenant-page-form-card-grid.is-cols-3')).toBeTruthy();
    expect(container.querySelector('.is-inline')).toBeNull();
  });

  it('zorunlu giriş "*" işareti sınıfı alır; erişilebilir ad değişmez; onay kutusu işaretlenmez', () => {
    const { container } = render(<>
      <PageInput component={component('kod')} props={{ inputType: 'text', label: 'Stok kodu', required: true }} raw="" onChange={() => {}} style={{}} />
      <PageInput component={component('kat')} props={{ inputType: 'lookup', label: 'Depo', required: true }} raw="" onChange={() => {}} style={{}} />
      <PageInput component={component('barkod')} props={{ inputType: 'text', label: 'Barkod' }} raw="" onChange={() => {}} style={{}} />
      <PageInput component={component('onay')} props={{ inputType: 'checkbox', label: 'Onay', required: true }} raw={false} onChange={() => {}} style={{}} />
    </>);
    const wrapper = (id: string) => container.querySelector(`#page-input-${id}`)!.closest('.tenant-page-input')!;
    expect(wrapper('kod').classList.contains('is-required')).toBe(true);
    expect(wrapper('kat').classList.contains('is-required')).toBe(true);
    expect(wrapper('barkod').classList.contains('is-required')).toBe(false);
    expect(wrapper('onay').classList.contains('is-required')).toBe(false);
    expect(screen.getByLabelText('Stok kodu')).toBe(container.querySelector('#page-input-kod'));
    const css = readFileSync(resolve(process.cwd(), 'src/tenant-custom-page.css'), 'utf8');
    expect(css).toMatch(/\.tenant-page-input\.is-required > label > span::after/);
    expect(css).toMatch(/\.tenant-page-input\.is-required \.tenant-page-lookup > label > span::after/);
  });

  it('açılır liste sabit seçenekleri sorgu satırlarından önce gösterir ve listede olmayan geçerli değeri korur', () => {
    const options = state([{ name: 'Kırtasiye' }], [{ code: 'name', label: 'Ad' }]);
    const { container, rerender } = render(<PageInput component={component('takip')} raw="Lot" onChange={() => {}} style={{}}
      props={{ inputType: 'select', label: 'Takip', staticOptions: ['None=Yok', 'Lot=Lot', 'Serial=Seri'] }} />);
    const labels = () => Array.from(container.querySelectorAll('option')).map((option) => `${option.value}|${option.textContent}`);
    expect(labels()).toEqual(['|Seçin', 'None|Yok', 'Lot|Lot', 'Serial|Seri']);
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('Lot');
    rerender(<PageInput component={component('kat')} raw="Eski kategori" onChange={() => {}} style={{}} optionsState={options}
      props={{ inputType: 'select', label: 'Kategori', optionsQuery: 'kategoriler', optionValueColumn: 'name', optionLabelColumn: 'name' }} />);
    expect(labels()).toEqual(['|Seçin', 'Kırtasiye|Kırtasiye', 'Eski kategori|Eski kategori']);
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('Eski kategori');
  });

  it('sütunlar seçim sırasıyla, columnLabels başlıklarıyla; birim ve değer etiketi hücreye yazılır', () => {
    const rows = [{ code: 'STK-0001', name: 'TEST ÜRÜN 1', qty: 5, unit: 'EA', value: 12.5, currency: 'TRY', mode: 'None', status: 'Yeterli' }];
    const columns = [
      { code: 'qty', label: 'Eldeki miktar', dataType: 'number' }, { code: 'name', label: 'Ad' }, { code: 'code', label: 'Kod' },
      { code: 'value', label: 'Değer', dataType: 'number' }, { code: 'mode', label: 'Takip' }, { code: 'unit', label: 'Birim' },
    ];
    const { container } = render(<QueryTable state={state(rows, columns)} columns={['code', 'name', 'qty', 'value', 'mode']} title="T" description="" style={{}}
      formats={parseColumnFormats(['code=code', 'qty=number', 'value=money'])}
      columnLabels={{ code: 'Stok kodu', qty: 'Depo bakiyesi' }} columnUnits={{ qty: 'unit', value: 'currency' }}
      valueLabels={{ mode: { None: 'Yok', Lot: 'Lot' } }} />);
    expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).toEqual(['Stok kodu', 'Ad', 'Depo bakiyesi', 'Değer', 'Takip']);
    const cells = Array.from(container.querySelectorAll('tbody td'));
    expect(cells.map((td) => td.textContent)).toEqual(['STK-0001', 'TEST ÜRÜN 1', '5 EA', '12,50 TRY', 'Yok']);
    // Dar tabloda harf harf kırılmaz: kod hücresi "code", metin hücresi "is-text", sayılar "num".
    expect(cells[0].className).toContain('code');
    expect(cells[1].className).toContain('is-text');
    expect(cells[2].className).toContain('num');
    expect(cells[2].className).not.toContain('is-text');
  });

  it('çalışma zamanı CSS: pencere arkası yarı saydam, kabuğun opak "-dialog" kuralını aşar', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/tenant-custom-page.css'), 'utf8');
    expect(css).toMatch(/\.tenant-page-dialog-backdrop \{[^}]*background: rgba\(15, 27, 45, \.35\)/);
    expect(css).toMatch(/#root \.app-shell \.tenant-page-dialog-backdrop[^{]*\{ background-color: rgba\(15, 27, 45, \.35\) !important;/);
    expect(css).toMatch(/\.tenant-page-table td\.code \{ min-width: 100px; white-space: nowrap;/);
  });
});
