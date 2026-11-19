import { cleanup, fireEvent, render as renderPlain, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';
import { api } from '../erpApi';
import { FilterBar } from './FilterBar';
import { parseFilterEntries, type ResolvedFilter } from './filterBarModel';

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

// Sayfa: SQL sorgusu `tur` parametresini süzgeç alanından alır (sunucuda süzülür); Ad süzgeci ve arama sayfada uygulanır.
const definition = {
  schemaVersion: 2,
  queries: [{ id: 'q1', name: 'musteriler', kind: 'read', runOn: 'load', sql: 'SELECT Code, Name, Type FROM CustomerAccounts WHERE (@tur IS NULL OR Type = @tur)', parameters: [{ name: 'tur', binding: '{{suzgec.tur}}', type: 'text' }] }],
  components: [
    { id: 'f1', type: 'filterBar', name: 'suzgec', props: { table: 't1', search: true, searchPlaceholder: 'Kod ile ara', searchColumns: ['Code'], filters: ['Type|select|row|tur|Tür', 'Name|text|more||Ad'] } },
    { id: 't1', type: 'dataTable', name: 'liste', props: { query: 'q1', title: 'Cariler', columns: ['Code', 'Name', 'Type'], valueLabels: ['Type:A=Alıcı', 'Type:S=Satıcı'] } },
  ],
};
const rows = [{ Code: 'C001', Name: 'Ayşe Ltd', Type: 'A' }, { Code: 'C002', Name: 'Mehmet AŞ', Type: 'S' }, { Code: 'X003', Name: 'Ayten Tic', Type: 'A' }];

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const runCalls = () => mockedApi.mock.calls.filter(([endpoint]) => String(endpoint).includes('/queries/q1/run'))
  .map(([, , init]) => (JSON.parse(String((init as RequestInit).body)) as { parameters: Record<string, unknown> }).parameters);

beforeEach(() => {
  localStorage.clear();
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true } } as never;
    if (endpoint.includes('/queries/q1/run')) return { columns: [{ code: 'Code', label: 'Kod' }, { code: 'Name', label: 'Ad' }, { code: 'Type', label: 'Tür' }], rows, rowCount: rows.length, truncated: false } as never;
    return { items: [], total: 0 } as never;
  });
});
afterEach(cleanup);

const bar = () => within(screen.getByRole('region', { name: 'Süzgeçler' }));
const filter = (entry: string, kind: ResolvedFilter['kind'], label: string, choices: ResolvedFilter['choices'] = []): ResolvedFilter => ({ ...parseFilterEntries([entry])[0], kind, label, choices });

describe('FilterBar', () => {
  it('satırdaki süzgeçler, Daha fazla süzgeç paneli, çipler ve Tümünü temizle', () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(<FilterBar style={{}} search={{ placeholder: 'Kod veya stok adıyla ara', hint: 'Stok kodu, Stok adı içinde arar' }}
      values={{ search: '', values: { status: 'low', qty: { min: '10', max: '500' }, inactive: true } }}
      filters={[filter('status|select|row', 'select', 'Durum', [{ value: 'low', label: 'Minimum altı' }]), filter('inactive|toggle|row', 'toggle', 'Pasifler dahil'),
        filter('qty|range|more', 'range', 'Depo bakiyesi'), filter('created|date|more', 'date', 'Oluşturma tarihi')]}
      onSearch={() => {}} onChange={onChange} onClearAll={onClearAll} />);
    expect(screen.getByPlaceholderText('Kod veya stok adıyla ara')).toBeTruthy();
    expect(screen.getByTitle('Stok kodu, Stok adı içinde arar')).toBeTruthy();
    expect((screen.getByLabelText('Durum') as HTMLSelectElement).value).toBe('low');
    // Daha fazla süzgeç: sayısıyla, tıklayınca panel açılır.
    const more = screen.getByRole('button', { name: '＋ Daha fazla süzgeç (2)' });
    expect(screen.queryByRole('dialog', { name: 'Daha fazla süzgeç' })).toBeNull();
    fireEvent.click(more);
    const panel = screen.getByRole('dialog', { name: 'Daha fazla süzgeç' });
    fireEvent.change(within(panel).getByLabelText('Oluşturma tarihi başlangıç'), { target: { value: '2026-01-01' } });
    expect(onChange).toHaveBeenCalledWith('created', { min: '2026-01-01', max: '' });
    const chips = screen.getByRole('group', { name: 'Etkin süzgeçler' });
    expect(chips.textContent).toContain('Durum:Minimum altı');
    expect(chips.textContent).toContain('Depo bakiyesi:10 – 500');
    fireEvent.click(within(chips).getByRole('button', { name: 'Pasifler dahil süzgecini kaldır' }));
    expect(onChange).toHaveBeenCalledWith('inactive', undefined);
    fireEvent.click(within(chips).getByRole('button', { name: 'Tümünü temizle' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('etkin süzgeç yokken çip satırı çizilmez', () => {
    render(<FilterBar style={{}} search={null} values={{ search: '', values: {} }} filters={[filter('a|text|row', 'text', 'A')]} onSearch={() => {}} onChange={() => {}} onClearAll={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Etkin süzgeçler' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Daha fazla süzgeç/ })).toBeNull();
  });
});

describe('süzgeç alanı sayfada', () => {
  it('parametreli süzgeç değeri sorguya gider; parametresiz süzgeç ve arama yüklenen satırlara uygulanır', async () => {
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Mehmet AŞ');
    expect(runCalls()[0]).toEqual({ tur: null });
    // Seçenekler listenin değer etiketlerinden gelir; seçim sorguyu tur=S ile yeniden çalıştırır.
    fireEvent.change(bar().getByLabelText('Tür'), { target: { value: 'S' } });
    await waitFor(() => expect(runCalls().at(-1)).toEqual({ tur: 'S' }));
    expect(screen.getByRole('group', { name: 'Etkin süzgeçler' }).textContent).toContain('Tür:Satıcı');
    expect(JSON.parse(localStorage.getItem('nexora.filterBar.p.f1')!)).toEqual({ search: '', values: { Type: 'S' } });

    // Ad süzgeci (Daha fazla) ve arama sayfadaki satırlarda: sorgu yeniden çalışmaz.
    const calls = runCalls().length;
    fireEvent.click(screen.getByRole('button', { name: '＋ Daha fazla süzgeç (1)' }));
    fireEvent.change(within(screen.getByRole('dialog', { name: 'Daha fazla süzgeç' })).getByLabelText('Ad'), { target: { value: 'ay' } });
    await waitFor(() => expect(screen.queryByText('Mehmet AŞ')).toBeNull());
    expect(screen.getByText('Ayşe Ltd')).toBeTruthy();
    expect(screen.getByText('Ayten Tic')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Kod ile ara'), { target: { value: 'x0' } });
    await waitFor(() => expect(screen.queryByText('Ayşe Ltd')).toBeNull());
    expect(screen.getByText('Ayten Tic')).toBeTruthy();
    expect(screen.getByTitle('Kod içinde arar')).toBeTruthy();
    expect(runCalls()).toHaveLength(calls);
  });

  it('saklanan süzgeç değerleriyle açılır; ilk istek süzgeçle gider', async () => {
    localStorage.setItem('nexora.filterBar.p.f1', JSON.stringify({ search: '', values: { Type: 'A', Bilinmeyen: 'x' } }));
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Ayşe Ltd');
    expect(runCalls()).toEqual([{ tur: 'A' }]);
    expect((bar().getByLabelText('Tür') as HTMLSelectElement).value).toBe('A');
  });
});
