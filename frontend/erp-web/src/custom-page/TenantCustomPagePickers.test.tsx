import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

// Genel motor ekleri (SQL sorgulu sayfa): autoId, ızgara seçim sütunu (satır kapsamlı seçenekler), optionsWhen, clearsOnChange,
// minRows ve istem açıklaması / uzunluk sınırı.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let failWrites = 0;

const q = (id: string, kind: string, parameters: [string, string, string][] = [], runOn = 'load') =>
  ({ id, name: id, kind, runOn, parameters: parameters.map(([name, binding, type]) => ({ name, binding, type })) });
const runCalls = (id: string) => calls.filter((call) => call.url === `/api/custom-pages/p/queries/${id}/run`);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ROWS: Record<string, (parameters: Record<string, unknown>) => Record<string, unknown>[]> = {
  urunler: () => [{ id: 'P1', kod: 'KLM', ad: 'Kalem', aktif: true }, { id: 'P2', kod: 'DFT', ad: 'Defter', aktif: true }, { id: 'P3', kod: 'ESK', ad: 'Eski', aktif: false }],
  birimler: (parameters) => (parameters.urun === 'P1' ? [{ kod: 'KOLI' }] : parameters.urun === 'P2' ? [{ kod: 'PAKET' }] : []),
  depolar: () => [{ id: 'D1', ad: 'Merkez', aktif: true }, { id: 'D2', ad: 'Şube', aktif: true }, { id: 'D3', ad: 'Kapalı', aktif: false }],
};

function setup(components: unknown[], queries: unknown[]) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url: endpoint, method, body });
    const id = /\/queries\/([^/]+)\/run$/.exec(endpoint)?.[1] ?? '';
    const parameters = (body?.parameters ?? {}) as Record<string, unknown>;
    if (ROWS[id]) {
      const rows = ROWS[id](parameters);
      return { columns: Object.keys(rows[0] ?? { id: '' }).map((code) => ({ code, label: code })), rows, rowCount: rows.length, truncated: false };
    }
    if (failWrites > 0) { failWrites -= 1; throw Object.assign(new Error('Geçici hata'), { status: 409, serverError: 'Geçici hata' }); }
    return { affectedRows: 1 };
  });
  return render(
    <CommandProvider>
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 5000 };
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const cell = (row: number, code: string) => document.getElementById(`page-grid-g-yeni-${row}-${code}`) as HTMLInputElement;
const optionTexts = () => within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
const pick = async (element: HTMLInputElement, option: RegExp) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const writes = (id: string) => runCalls(id).map((call) => call.body!.parameters as Record<string, unknown>);

beforeEach(() => { calls = []; failWrites = 0; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

const grid = (props: Record<string, unknown> = {}) => ({ id: 'g', type: 'editableGrid', name: 'g', props: {
  gridMode: 'list', title: 'Satırlar', gridColumns: ['urun|Ürün|lookup:urunler:id:kod:ad|required', 'birim|Birim|lookup:birimler:kod:kod', 'miktar|Miktar|number'],
  columnOptionsWhen: ['urun=satir.aktif == true'], columnStaticOptions: ['birim==Ana birim'], ...props } });
const kaydet = { id: 'kaydet', type: 'button', name: 'kaydet', props: { text: 'Kaydet', actionType: 'query', queryId: 'yaz' } };

describe('grid picker columns', () => {
  it('row-scoped options run once per distinct row value; page-level options filter with columnOptionsWhen', async () => {
    setup([grid(), kaydet], [q('urunler', 'read'), q('birimler', 'read', [['urun', '{{g.satir.urun}}', 'text']]),
      q('yaz', 'insert', [['satirlar', '{{g.satirlar}}', 'list']], 'manual')]);
    await waitFor(() => expect(runCalls('urunler')).toHaveLength(1), T);
    // The row-scoped query never runs at page level.
    expect(runCalls('birimler')).toEqual([]);
    for (let row = 0; row < 3; row += 1) fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.click(cell(1, 'urun'));
    expect(optionTexts()).toEqual(['KLMKalem', 'DFTDefter']);
    fireEvent.click(screen.getByRole('option', { name: /^KLM/ }));
    await pick(cell(2, 'urun'), /^DFT/);
    await pick(cell(3, 'urun'), /^KLM/);
    await waitFor(() => expect(runCalls('birimler').map((call) => (call.body!.parameters as Record<string, unknown>).urun).sort()).toEqual(['P1', 'P2']), T);
    await settle(50);
    expect(runCalls('birimler')).toHaveLength(2);
    fireEvent.click(cell(2, 'birim'));
    await waitFor(() => expect(optionTexts()).toEqual(['Ana birim', 'PAKET']), T);
    fireEvent.blur(cell(2, 'birim'));
    await pick(cell(3, 'birim'), /^KOLI/);
    expect(cell(1, 'urun').value).toBe('KLM · Kalem');
    expect(cell(1, 'birim').value).toBe('Ana birim');
    expect(cell(3, 'birim').value).toBe('KOLI');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(1), T);
    // Empty picker cells (the static "Ana birim" value) are left out of the wire rows.
    expect(writes('yaz')[0].satirlar).toEqual([{ urun: 'P1' }, { urun: 'P2' }, { urun: 'P1', birim: 'KOLI' }]);
  });

  it('minRows blocks the write with a grid message', async () => {
    setup([grid({ minRows: 1 }), kaydet], [q('urunler', 'read'), q('birimler', 'read', [['urun', '{{g.satir.urun}}', 'text']]),
      q('yaz', 'insert', [['satirlar', '{{g.satirlar}}', 'list']], 'manual')]);
    await waitFor(() => expect(runCalls('urunler')).toHaveLength(1), T);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('En az 1 kalem girin.', {}, T);
    await settle(50);
    expect(runCalls('yaz')).toEqual([]);
  });

  it('{{grid.satirSayisi}} counts the rows', async () => {
    setup([grid(), { id: 'say', type: 'text', props: { text: 'Satır: {{g.satirSayisi}}' } }], [q('urunler', 'read'),
      q('birimler', 'read', [['urun', '{{g.satir.urun}}', 'text']])]);
    await screen.findByText('Satır: 0', {}, T);
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    await screen.findByText('Satır: 1', {}, T);
  });
});

describe('autoId', () => {
  const page = () => setup([{ id: 'rid', type: 'input', name: 'rid', props: { inputType: 'text', label: 'Kimlik', hidden: true, autoId: true } }, kaydet],
    [q('yaz', 'insert', [['requestId', '{{rid.value}}', 'guid']], 'manual')]);

  it('keeps the id across a failed write and renews it after a successful one', async () => {
    page();
    failWrites = 1;
    const button = await screen.findByRole('button', { name: 'Kaydet' }, T);
    fireEvent.click(button);
    await screen.findByText(/Geçici hata/, {}, T);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(2), T);
    await screen.findByText(/İşlem tamamlandı/, {}, T);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(3), T);
    const [first, retry, next] = writes('yaz').map((parameters) => parameters.requestId as string);
    expect(first).toMatch(GUID);
    expect(retry).toBe(first);
    expect(next).toMatch(GUID);
    expect(next).not.toBe(first);
    expect(input('rid')).toBeNull();
  });

  it('a dialog opened with resetOnOpen gets a new id', async () => {
    setup([{ id: 'ac', type: 'button', props: { text: 'Aç', actionType: 'openDialog', dialogId: 'p1' } },
      { id: 'p1', type: 'dialog', name: 'p1', props: { title: 'Pencere', contains: ['rid'], saveQuery: 'yaz', closeOnSave: false } },
      { id: 'rid', type: 'input', name: 'rid', props: { inputType: 'text', hidden: true, autoId: true } }],
    [q('yaz', 'insert', [['requestId', '{{rid.value}}', 'guid']], 'manual')]);
    failWrites = 2;
    fireEvent.click(await screen.findByRole('button', { name: 'Aç' }, T));
    const dialog = await screen.findByRole('dialog', { name: 'Pencere' }, T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(1), T);
    await within(dialog).findByText(/Geçici hata/, {}, T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Pencere' }, T)).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(2), T);
    const [first, second] = writes('yaz').map((parameters) => parameters.requestId as string);
    expect(second).toMatch(GUID);
    expect(second).not.toBe(first);
  });
});

describe('optionsWhen and clearsOnChange', () => {
  it('hides option rows that fail the condition, keeps the current value, and clears dependent inputs on a user change', async () => {
    setup([
      { id: 'kaynak', type: 'input', name: 'kaynak', props: { inputType: 'lookup', label: 'Kaynak', optionsQuery: 'depolar', optionValueColumn: 'id',
        optionLabelColumn: 'ad', minChars: 0, defaultFirst: true, optionsWhen: 'satir.aktif == true', clearsOnChange: ['not', 'g.miktar'] } },
      { id: 'hedef', type: 'input', name: 'hedef', props: { inputType: 'select', label: 'Hedef', optionsQuery: 'depolar', optionValueColumn: 'id',
        optionLabelColumn: 'ad', optionsWhen: 'satir.aktif == true && satir.id != kaynak.value' } },
      { id: 'not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } },
      grid(),
    ], [q('depolar', 'read'), q('urunler', 'read'), q('birimler', 'read', [['urun', '{{g.satir.urun}}', 'text']])]);
    await waitFor(() => expect(input('kaynak').value).toBe('Merkez'), T);
    const hedef = screen.getByLabelText('Hedef') as HTMLSelectElement;
    expect([...hedef.options].map((option) => option.textContent)).toEqual(['Seçin', 'Şube']);
    fireEvent.change(hedef, { target: { value: 'D2' } });
    fireEvent.change(input('not'), { target: { value: 'yazı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    fireEvent.change(cell(1, 'miktar'), { target: { value: '3' } });
    // The source lists active depots only; choosing Şube clears the dependent input and grid column.
    fireEvent.click(input('kaynak'));
    expect(optionTexts()).toEqual(['Merkez', 'Şube']);
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Şube' }));
    await waitFor(() => expect(input('not').value).toBe(''), T);
    expect(cell(1, 'miktar').value).toBe('');
    // The target's current value (now equal to the source) still renders although the condition hides it.
    expect([...hedef.options].map((option) => option.textContent)).toEqual(['Seçin', 'Merkez', 'Şube']);
    expect(hedef.value).toBe('D2');
  });
});

describe('prompt description', () => {
  it('shows promptText under the prompt and caps the answer with promptMaxLength', async () => {
    setup([{ id: 'sil', type: 'button', name: 'sil', props: { text: 'İptal et', actionType: 'query', queryId: 'yaz', promptLabel: 'Neden',
      promptRequired: true, promptMaxLength: 20, promptText: 'Kayıt {{kod.value}} iptal edilecek.' } },
    { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', defaultValue: 'K-1' } }],
    [q('yaz', 'update', [['reason', '{{sil.yanit}}', 'text']], 'manual')]);
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }, T));
    const prompt = await screen.findByRole('alertdialog', {}, T);
    expect(prompt.textContent).toContain('Kayıt K-1 iptal edilecek.');
    const field = within(prompt).getByRole('textbox');
    expect(field.getAttribute('maxlength')).toBe('20');
    fireEvent.change(field, { target: { value: 'Yanlış' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => expect(runCalls('yaz')).toHaveLength(1), T);
    expect(writes('yaz')[0]).toEqual({ reason: 'Yanlış' });
  });
});
