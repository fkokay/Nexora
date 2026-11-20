import { cleanup, fireEvent, render as renderPlain, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';
import { api } from '../erpApi';
import { setPageParams } from '../pageNavigation';
import { FilterBar } from './FilterBar';
import { applyFirstChoices, filterChoices, formatFilterEntry, loadFilterValues, parseFilterEntries, saveFilterValues, type ResolvedFilter } from './filterBarModel';

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const W1 = 'w-1', W2 = 'w-2', W3 = 'w-3';
const warehouses = [{ id: W1, code: 'D01', name: 'Merkez' }, { id: W2, code: 'D02', name: 'Ankara Şube' }, { id: W3, code: 'D03', name: 'İzmir' }];
const resolved = (entry: string, choices: ResolvedFilter['choices'] = []): ResolvedFilter =>
  ({ ...parseFilterEntries([entry])[0], kind: 'select', label: 'Depo', choices });

describe('aranabilir seçim ve ilk seçenek: süzgeç modeli', () => {
  it('bayrak bölümünü ve açıklama sütununu okur, aynı biçimde yazar; bozuk bayraklı öğeyi atlar', () => {
    const entries = ['warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst', 'isActive|select|row||Durum||defaultFirst',
      'a|select|row||A|q|aranabilir', 'b|select|row||B|q|searchable,searchable', 'c|text|row||C||searchable', 'd|select|row|||q|'];
    const specs = parseFilterEntries(entries);
    expect(specs).toEqual([
      { key: 'warehouseId', kind: 'select', place: 'row', param: 'warehouseId', label: 'Depo',
        options: { query: 'depolar', valueColumn: 'id', labelColumn: 'code', descriptionColumn: 'name' }, searchable: true, defaultFirst: true },
      { key: 'isActive', kind: 'select', place: 'row', label: 'Durum', defaultFirst: true },
      { key: 'd', kind: 'select', place: 'row', options: { query: 'q' } },
    ]);
    expect(specs.map(formatFilterEntry)).toEqual([entries[0], entries[1], 'd|select|row|||q']);
  });

  it('açıklama sütunu seçeneği "kod · ad" yapar', () => {
    const spec = parseFilterEntries(['warehouseId|select|row|||depolar:id:code:name'])[0];
    expect(filterChoices(spec, { optionRows: [...warehouses, { id: 'w-4', code: 'D04', name: null }], rows: [] }).map((choice) => choice.label))
      .toEqual(['D01 · Merkez', 'D02 · Ankara Şube', 'D03 · İzmir', 'D04']);
  });

  it('ilk seçenek bir kez, yalnız anahtarı olmayan süzgece yazılır', () => {
    const applied = new Set<string>();
    const filter = resolved('warehouseId|select|row|warehouseId|Depo||defaultFirst', [{ value: '', label: 'Tümü' }, { value: W1, label: 'D01' }, { value: W2, label: 'D02' }]);
    const empty = { search: '', values: {} };
    // Seçenekler yüklenmeden işaretlenmez.
    expect(applyFirstChoices(empty, [{ ...filter, choices: [] }], applied)).toBe(empty);
    expect(applied.size).toBe(0);
    expect(applyFirstChoices(empty, [filter], applied).values).toEqual({ warehouseId: W1 });
    // İkinci kez (seçenek sorgusu yeniden çalıştı, kullanıcı Tümü seçti): değişmez.
    const cleared = { search: '', values: {} };
    expect(applyFirstChoices(cleared, [{ ...filter, choices: [{ value: W2, label: 'D02' }] }], applied)).toBe(cleared);
    // Saklanan / sayfa parametresinden gelen değer ve açık "Tümü" (boş metin) ezilmez.
    for (const value of [W2, '']) {
      const own = { search: '', values: { warehouseId: value } };
      expect(applyFirstChoices(own, [filter], new Set())).toBe(own);
    }
    // Bayraksız süzgece dokunulmaz.
    expect(applyFirstChoices(empty, [resolved('warehouseId|select|row', filter.choices)], new Set())).toBe(empty);
  });

  it('açık "Tümü" (boş metin) saklanır ve geri okunur', () => {
    saveFilterValues('k', { search: '', values: { warehouseId: '', plain: '', other: { min: '', max: '' } } }, ['warehouseId']);
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ search: '', values: { warehouseId: '' } });
    expect(loadFilterValues('k', parseFilterEntries(['warehouseId|select|row||||defaultFirst'])).values).toEqual({ warehouseId: '' });
    localStorage.removeItem('k');
  });
});

describe('aranabilir seçim süzgeci (FilterBar)', () => {
  afterEach(cleanup);
  const choices = [{ value: W1, label: 'D01 · Merkez' }, { value: W2, label: 'D02 · Ankara Şube' }, { value: W3, label: 'D03 · İzmir' }];

  it('kapalıyken seçili seçeneğin metni; yazınca seçenekler süzülür, seçim onChange ile gider', () => {
    const onChange = vi.fn();
    render(<FilterBar style={{}} search={null} values={{ search: '', values: { warehouseId: W1 } }}
      filters={[resolved('warehouseId|select|row|warehouseId|Depo||searchable', choices)]} onSearch={() => {}} onChange={onChange} onClearAll={() => {}} />);
    const box = screen.getByRole('combobox', { name: 'Depo' }) as HTMLInputElement;
    expect(box.value).toBe('D01 · Merkez');
    fireEvent.click(box);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Tümü', 'D01 · Merkez', 'D02 · Ankara Şube', 'D03 · İzmir']);
    fireEvent.change(box, { target: { value: 'ANK' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['D02 · Ankara Şube']);
    fireEvent.click(screen.getByRole('option', { name: 'D02 · Ankara Şube' }));
    expect(onChange).toHaveBeenCalledWith('warehouseId', W2);
    // "Tümü" boş değerdir: süzgeç kaldırılır.
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('option', { name: 'Tümü' }));
    expect(onChange).toHaveBeenLastCalledWith('warehouseId', undefined);
  });

  it('Daha fazla süzgeç panelinde etiket çizilmez, giriş adını korur', () => {
    render(<FilterBar style={{}} search={null} values={{ search: '', values: {} }}
      filters={[{ ...resolved('warehouseId|select|more|||q|searchable', choices) }]} onSearch={() => {}} onChange={() => {}} onClearAll={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '＋ Daha fazla süzgeç (1)' }));
    const panel = screen.getByRole('dialog', { name: 'Daha fazla süzgeç' });
    expect((within(panel).getByRole('combobox', { name: 'Depo' }) as HTMLInputElement).value).toBe('Tümü');
  });
});

// Sayfa: depo süzgeci sunucuya gider (`{{suzgec.warehouseId}}`); seçenekler depolar sorgusundan "kod · ad".
const filterDefinition = (entry: string) => ({
  schemaVersion: 2,
  queries: [
    { id: 'q0', name: 'depolar', kind: 'read', runOn: 'load', sql: 'SELECT id, code, name FROM Warehouses', parameters: [] },
    { id: 'q1', name: 'konumlar', kind: 'read', runOn: 'load', sql: 'SELECT code FROM Locations WHERE WarehouseId = @warehouseId',
      parameters: [{ name: 'warehouseId', binding: '{{suzgec.warehouseId}}', type: 'text' }] },
  ],
  components: [
    { id: 'f1', type: 'filterBar', name: 'suzgec', props: { table: 't1', filters: [entry] } },
    { id: 't1', type: 'dataTable', name: 'liste', props: { query: 'q1', title: 'Konumlar', columns: ['code'] } },
  ],
});
let definition: object = {};
const runsOf = (id: string) => mockedApi.mock.calls.filter(([endpoint]) => String(endpoint).includes(`/queries/${id}/run`))
  .map(([, , init]) => (JSON.parse(String((init as RequestInit).body)) as { parameters: Record<string, unknown> }).parameters);

describe('ilk seçenek varsayılanı sayfada', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedApi.mockReset();
    mockedApi.mockImplementation(async (endpoint: string) => {
      if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true } } as never;
      if (endpoint.includes('/queries/q0/run')) return { columns: [{ code: 'id', label: 'Id' }, { code: 'code', label: 'Kod' }, { code: 'name', label: 'Ad' }], rows: warehouses, rowCount: 3, truncated: false } as never;
      if (/\/queries\/q[12]\/run/.test(endpoint)) return { columns: [{ code: 'code', label: 'Kod' }], rows: [{ code: 'A-01' }], rowCount: 1, truncated: false } as never;
      return { items: [], total: 0 } as never;
    });
  });
  afterEach(() => { cleanup(); setPageParams('custom-page:p', {}); });

  const ENTRY = 'warehouseId|select|row|warehouseId|Depo|q0:id:code:name|searchable,defaultFirst';
  const depo = () => within(screen.getByRole('region', { name: 'Süzgeçler' })).getByRole('combobox', { name: 'Depo' }) as HTMLInputElement;

  it('değer yokken depolar yüklenince ilk depo seçilir; "Tümü" seçimi saklanır ve yeniden açılışta ezilmez', async () => {
    definition = filterDefinition(ENTRY);
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(runsOf('q1').at(-1)).toEqual({ warehouseId: W1 }));
    expect(depo().value).toBe('D01 · Merkez');
    fireEvent.click(depo());
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Depo' })).getByRole('option', { name: 'Tümü' }));
    await waitFor(() => expect(runsOf('q1').at(-1)).toEqual({ warehouseId: null }));
    expect(JSON.parse(localStorage.getItem('nexora.filterBar.p.f1')!)).toEqual({ search: '', values: { warehouseId: '' } });
    cleanup();
    mockedApi.mockClear();
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('A-01');
    await waitFor(() => expect(depo().value).toBe('Tümü'));
    expect(runsOf('q1').every((parameters) => parameters.warehouseId === null)).toBe(true);
  });

  it('sayfa parametresi ve saklanan değer ilk seçeneğin önüne geçer', async () => {
    definition = filterDefinition(ENTRY);
    setPageParams('custom-page:p', { warehouseId: W3 });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('A-01');
    await waitFor(() => expect(depo().value).toBe('D03 · İzmir'));
    expect(runsOf('q1').every((parameters) => parameters.warehouseId === W3)).toBe(true);
    cleanup();
    setPageParams('custom-page:p', {});
    mockedApi.mockClear();
    localStorage.setItem('nexora.filterBar.p.f1', JSON.stringify({ search: '', values: { warehouseId: W2 } }));
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('A-01');
    await waitFor(() => expect(depo().value).toBe('D02 · Ankara Şube'));
    expect(runsOf('q1').every((parameters) => parameters.warehouseId === W2)).toBe(true);
  });

  it('bayraksız süzgeç eskisi gibi düz açılır liste ve Tümü ile başlar', async () => {
    definition = filterDefinition('warehouseId|select|row|warehouseId|Depo|q0:id:code:name');
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('A-01');
    const select = within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Depo') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    await waitFor(() => expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Tümü', 'D01 · Merkez', 'D02 · Ankara Şube', 'D03 · İzmir']));
    expect(select.value).toBe('');
    expect(runsOf('q1').every((parameters) => parameters.warehouseId === null)).toBe(true);
  });

  it('giriş: aranabilir açılır liste ilk seçenekle başlar, varsayılan değer ve kullanıcı seçimi önce gelir', async () => {
    const inputDefinition = (props: Record<string, unknown>) => ({
      schemaVersion: 2,
      queries: [
        { id: 'q0', name: 'depolar', kind: 'read', runOn: 'load', sql: 'SELECT id, code, name FROM Warehouses', parameters: [] },
        { id: 'q2', name: 'bakiyeler', kind: 'read', runOn: 'load', sql: 'SELECT code FROM Balances WHERE WarehouseId = @w', parameters: [{ name: 'w', binding: '{{depo.value}}', type: 'text' }] },
      ],
      components: [
        { id: 'i1', type: 'input', name: 'depo', props: { inputType: 'select', label: 'Depo', optionsQuery: 'q0', optionValueColumn: 'id', optionLabelColumn: 'code', optionDescriptionColumn: 'name', ...props } },
        { id: 't2', type: 'dataTable', name: 'bakiye', props: { query: 'q2', title: 'Bakiyeler', columns: ['code'] } },
      ],
    });
    definition = inputDefinition({ searchable: true, defaultFirst: true });
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(runsOf('q2').at(-1)).toEqual({ w: W1 }));
    const box = screen.getByRole('combobox', { name: 'Depo' }) as HTMLInputElement;
    expect(box.value).toBe('D01 · Merkez');
    fireEvent.click(box);
    fireEvent.change(box, { target: { value: 'izm' } });
    fireEvent.click(screen.getByRole('option', { name: 'D03 · İzmir' }));
    await waitFor(() => expect(runsOf('q2').at(-1)).toEqual({ w: W3 }));
    cleanup();

    mockedApi.mockClear();
    definition = inputDefinition({ defaultFirst: true, defaultValue: W2 });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('A-01');
    const select = screen.getByLabelText('Depo') as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(W2));
    expect(runsOf('q2').every((parameters) => parameters.w === W2)).toBe(true);
  });
});
