import { cleanup, fireEvent, render as renderPlain, screen, waitFor, within } from '@testing-library/react';
import { CommandProvider } from '../commands/CommandProvider';
// Gelişmiş ızgara (dataTable) sayfa komutlarını kaydeder; uygulamadaki gibi CommandProvider içinde çizilir.
const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';
import { lookupOptions } from './LookupInput';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const warehouses = [
  { Kod: 'D1', Ad: 'Merkez Depo', Sehir: 'İstanbul' },
  { Kod: 'D2', Ad: 'Ankara Depo', Sehir: 'Ankara' },
  { Kod: 'D3', Ad: 'İzmir Depo', Sehir: 'İzmir' },
];
const columns = [{ code: 'Kod', label: 'Kod' }, { code: 'Ad', label: 'Ad' }, { code: 'Sehir', label: 'Şehir' }];

let runs: { id: string; parameters: Record<string, unknown> }[] = [];

function setup(components: unknown[], queries: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: { body?: string }) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? endpoint;
    const parameters = (init?.body ? JSON.parse(init.body).parameters : {}) as Record<string, unknown>;
    runs.push({ id, parameters });
    return { columns, rows: warehouses, rowCount: warehouses.length, truncated: false };
  });
  return render(<TenantCustomPage code="p" token="t" />);
}

const lookupComponent = (props: Record<string, unknown> = {}) => ({
  id: 'lk', type: 'input', name: 'depo',
  props: { inputType: 'lookup', label: 'Depo', optionsQuery: 'qo', optionValueColumn: 'Kod', optionLabelColumn: 'Ad', optionDescriptionColumn: 'Sehir', ...props },
});
const optionsQuery = (parameters: unknown[] = []) => ({ id: 'qo', name: 'Depolar', kind: 'read', runOn: 'load', parameters });
const probe = { id: 'h', type: 'heading', props: { title: 'V:{{depo.value}}|S:{{depo.search}}|R:{{depo.seciliSatir.Sehir}}' } };
const heading = () => document.querySelector('.tenant-page-heading')?.textContent;
const combobox = () => screen.getByRole('combobox', { name: 'Depo' }) as HTMLInputElement;
const optionTexts = () => within(screen.getByRole('listbox')).queryAllByRole('option').map((option) => option.querySelector('span')?.textContent);

beforeEach(() => { runs = []; api.mockReset(); });
afterEach(cleanup);

describe('LookupInput', () => {
  it('server search binds search text', async () => {
    setup([lookupComponent({ minChars: 2 }), probe], [optionsQuery([{ name: 'arama', binding: '{{depo.search}}', type: 'text' }])]);
    await waitFor(() => expect(runs.length).toBe(1));
    expect(runs[0].parameters.arama).toBeNull();
    fireEvent.change(combobox(), { target: { value: 'ab' } });
    expect(heading()).toBe('V:|S:ab|R:');
    // Tek 300 ms sorgu bekleme süresinden sonra arama metniyle yeniden çalışır.
    await waitFor(() => expect(runs.at(-1)?.parameters.arama).toBe('ab'));
    fireEvent.change(combobox(), { target: { value: 'a' } });
    expect(heading()).toBe('V:|S:|R:');
    await waitFor(() => expect(runs.at(-1)?.parameters.arama).toBeNull());
    // Sunucu aramasında satırlar istemcide süzülmez.
    await waitFor(() => expect(optionTexts()).toEqual(['Merkez Depo', 'Ankara Depo', 'İzmir Depo']));
  });

  it('client filter for query without search binding', async () => {
    setup([lookupComponent()], [optionsQuery()]);
    await waitFor(() => expect(runs.length).toBe(1));
    fireEvent.change(combobox(), { target: { value: 'İZM' } });
    await waitFor(() => expect(optionTexts()).toEqual(['İzmir Depo']));
    // Açıklama sütunu da aranır (tr-TR küçük harf).
    fireEvent.change(combobox(), { target: { value: 'ankara' } });
    expect(optionTexts()).toEqual(['Ankara Depo']);
    fireEvent.change(combobox(), { target: { value: 'yok' } });
    expect(within(screen.getByRole('listbox')).getByText('Sonuç bulunamadı.')).toBeTruthy();
    expect(runs.length).toBe(1);
  });

  it('static empty option selects empty value', async () => {
    setup([lookupComponent({ staticOptions: ['=Tüm depolar'], defaultValue: 'D2' }), probe], [optionsQuery()]);
    await waitFor(() => expect(combobox().value).toBe('Ankara Depo'));
    expect(heading()).toBe('V:D2|S:|R:Ankara');
    fireEvent.click(combobox());
    expect(optionTexts()).toEqual(['Tüm depolar', 'Merkez Depo', 'Ankara Depo', 'İzmir Depo']);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Tüm depolar'));
    expect(combobox().value).toBe('Tüm depolar');
    expect(heading()).toBe('V:|S:|R:');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keyboard select and escape', async () => {
    setup([lookupComponent(), probe], [optionsQuery()]);
    await waitFor(() => expect(runs.length).toBe(1));
    const input = combobox();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(optionTexts()).toHaveLength(3));
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Ankara Depo');
    expect(heading()).toBe('V:D2|S:|R:Ankara');
    expect(screen.queryByRole('listbox')).toBeNull();
    // Escape listeyi kapatır ve yazılan metin yerine seçili etiketi geri getirir; değer değişmez.
    fireEvent.change(input, { target: { value: 'Mer' } });
    expect(input.value).toBe('Mer');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('Ankara Depo');
    expect(heading()).toBe('V:D2|S:|R:Ankara');
    // Bulanıklaşma da listeyi kapatır.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('allowClear clears value and row', async () => {
    setup([lookupComponent({ allowClear: true }), probe], [optionsQuery()]);
    await waitFor(() => expect(runs.length).toBe(1));
    expect(screen.queryByRole('button', { name: 'Temizle' })).toBeNull();
    fireEvent.click(combobox());
    fireEvent.click(await within(screen.getByRole('listbox')).findByText('İzmir Depo'));
    expect(heading()).toBe('V:D3|S:|R:İzmir');
    fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
    expect(combobox().value).toBe('');
    expect(heading()).toBe('V:|S:|R:');
    expect(screen.queryByRole('button', { name: 'Temizle' })).toBeNull();
  });

  it('lookup keeps preset value label', async () => {
    setup([lookupComponent({ defaultValue: 'D9', required: true }), probe], [optionsQuery()]);
    await waitFor(() => expect(runs.length).toBe(1));
    await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
    expect(combobox().value).toBe('D9');
    expect(heading()).toBe('V:D9|S:|R:');
    fireEvent.blur(combobox());
    // İlk sonuç sayfasında olmayan değer temizlenmez ve geçersiz sayılmaz.
    expect(combobox().value).toBe('D9');
    expect(document.querySelector('.tenant-page-input-error')).toBeNull();
    expect(document.querySelector('.tenant-page-input-lookup.is-invalid')).toBeNull();
  });

  it('preset value beyond the 50-option cap keeps its row label and row', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ Kod: `K${index}`, Ad: `Depo ${index}`, Sehir: `Şehir ${index}` }));
    setup([lookupComponent({ defaultValue: 'K55' }), probe], [optionsQuery()]);
    const answer = api.getMockImplementation()!;
    api.mockImplementation(async (endpoint: string, ...rest: unknown[]) => endpoint.includes('/queries/')
      ? { columns, rows: many, rowCount: many.length, truncated: false } : answer(endpoint, ...rest));
    await waitFor(() => expect(combobox().value).toBe('Depo 55'));
    expect(heading()).toBe('V:K55|S:|R:Şehir 55');
    fireEvent.click(combobox());
    const shown = optionTexts();
    expect(shown).toHaveLength(50);
    expect(shown.at(-1)).toBe('Depo 55');
  });

  it('required lookup bound through seciliSatir blocks the write', async () => {
    const insert = { id: 'qi', name: 'Ekle', kind: 'insert', runOn: 'manual', parameters: [{ name: 'sehir', binding: '{{depo.seciliSatir.Sehir}}', type: 'text' }] };
    setup([lookupComponent({ required: true }), { id: 'b', type: 'button', props: { text: 'Kaydet', actionType: 'query', queryId: 'qi' } }], [optionsQuery(), insert]);
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(document.querySelector('.tenant-page-input-lookup .tenant-page-input-error')?.textContent).toBe('Bu alan zorunludur.'));
    expect(runs.some((run) => run.id === 'qi')).toBe(false);
  });

  it('selected label survives remount after visibleWhen toggle', async () => {
    // Arama zorunlu sorgu: arama metni yokken satır dönmez; seçimden sonra seçenekler boşalır.
    const toggle = { id: 'g', type: 'input', name: 'goster', props: { inputType: 'checkbox', label: 'Göster', defaultValue: 'true' } };
    setup([toggle, lookupComponent({ visibleWhen: 'goster.value == true' })], [optionsQuery([{ name: 'arama', binding: '{{depo.search}}', type: 'text' }])]);
    const answer = api.getMockImplementation()!;
    api.mockImplementation(async (endpoint: string, token: string, init?: { body?: string }) => {
      const result = await answer(endpoint, token, init);
      const arama = init?.body ? JSON.parse(init.body).parameters?.arama : undefined;
      return endpoint.includes('/queries/') ? { ...result, rows: arama ? warehouses.filter((row) => row.Ad.includes(arama)) : [], rowCount: arama ? 1 : 0 } : result;
    });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Depo' }), { target: { value: 'Ankara' } });
    fireEvent.click(await within(screen.getByRole('listbox')).findByText('Ankara Depo'));
    await waitFor(() => expect(runs.at(-1)?.parameters.arama).toBeNull());
    await waitFor(() => expect(screen.queryByText('Yükleniyor…')).toBeNull());
    expect(combobox().value).toBe('Ankara Depo');
    const checkbox = screen.getByRole('checkbox', { name: 'Göster' });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Depo' })).toBeNull());
    fireEvent.click(checkbox);
    // Yeniden bağlanan giriş, seçenekler artık içermese de seçili etiketi gösterir (ham değeri değil).
    expect((await screen.findByRole('combobox', { name: 'Depo' }) as HTMLInputElement).value).toBe('Ankara Depo');
  });

  it('shows searching text while options load', async () => {
    setup([lookupComponent()], [optionsQuery()]);
    const answer = api.getMockImplementation()!;
    let release: () => void = () => undefined;
    api.mockImplementation((endpoint: string, ...rest: unknown[]) => endpoint.includes('/queries/')
      ? new Promise((resolve) => { release = () => resolve(answer(endpoint, ...rest)); })
      : answer(endpoint, ...rest));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Depo' }));
    expect(within(screen.getByRole('listbox')).getByText('Aranıyor…')).toBeTruthy();
    release();
    await waitFor(() => expect(optionTexts()).toHaveLength(3));
  });
});

describe('lookupOptions', () => {
  const state = { rows: warehouses, rowCount: 3, columns, truncated: false, loading: false, error: '', ran: true };
  const props = { optionValueColumn: 'Kod', optionLabelColumn: 'Ad', staticOptions: ['=Tüm depolar', 'X=Dış depo'] };
  it('static options come first and are filtered client-side even for server search', () => {
    expect(lookupOptions(props, state, '', true).map((option) => option.value)).toEqual(['', 'X', 'D1', 'D2', 'D3']);
    expect(lookupOptions(props, state, 'dış', true).map((option) => option.value)).toEqual(['X', 'D1', 'D2', 'D3']);
    expect(lookupOptions(props, state, 'dış', false).map((option) => option.value)).toEqual(['X']);
  });
  it('shows at most 50 options', () => {
    const many = { ...state, rows: Array.from({ length: 60 }, (_, index) => ({ Kod: `K${index}`, Ad: `Depo ${index}` })) };
    expect(lookupOptions(props, many, '', false)).toHaveLength(50);
  });
});
