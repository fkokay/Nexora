import { cleanup, fireEvent, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const insertOp = {
  name: 'stok.kart.ekle', label: 'Stok kartı ekle', module: 'Stok', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/stock/items',
  parameters: [{ name: 'name', in: 'body', type: 'text', required: false }, { name: 'code', in: 'body', type: 'text', required: false }],
  result: { shape: 'record', rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true,
};
const definition = {
  schemaVersion: 2,
  components: [
    { id: 'in1', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad' } },
    { id: 'in2', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', readOnly: true, required: true, defaultValue: 'K1' } },
    { id: 'b1', type: 'button', props: { text: 'Kaydet', actionType: 'query', queryId: 'qi' } },
  ],
  queries: [{ id: 'qi', name: 'ekle', kind: 'insert', runOn: 'manual', operation: 'stok.kart.ekle',
    parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }, { name: 'code', binding: '{{kod.value}}', type: 'text' }] }],
};

afterEach(() => { cleanup(); api.mockReset(); });

describe('readOnly input', () => {
  it('readOnly input cannot be edited and is not validated as changed', async () => {
    api.mockImplementation(async (endpoint: string) => {
      if (endpoint.endsWith('/published')) return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true }, definitionJson: JSON.stringify(definition) };
      if (endpoint === '/api/custom-pages/erp-operations') return { operations: [insertOp] };
      return { id: 'x' };
    });
    render(<TenantCustomPage code="p" token="t" />);
    const kod = await screen.findByLabelText('Kod') as HTMLInputElement;
    const ad = screen.getByLabelText('Ad') as HTMLInputElement;
    expect(kod.disabled).toBe(true);
    expect(ad.disabled).toBe(false);
    expect(kod.value).toBe('K1');
    fireEvent.change(kod, { target: { value: 'ZZ' } });
    expect(kod.value).toBe('K1');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/stock/items', 't', expect.objectContaining({ method: 'POST' })));
  });
});
