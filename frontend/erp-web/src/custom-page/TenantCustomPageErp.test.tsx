import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const insertOp = {
  name: 'stok.kart.ekle', label: 'Stok kartı ekle', module: 'Stok', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/stock/items',
  parameters: [{ name: 'name', in: 'body', type: 'text', required: true }], result: { shape: 'record', rowsPath: null, columns: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true,
};
const definition = {
  schemaVersion: 2,
  components: [
    { id: 'in1', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad' } },
    { id: 'b1', type: 'button', props: { text: 'Kaydet', actionType: 'query', queryId: 'qi' } },
  ],
  queries: [{ id: 'qi', name: 'ekle', kind: 'insert', runOn: 'manual', operation: 'stok.kart.ekle', parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }] }],
};

afterEach(() => { cleanup(); api.mockReset(); });

describe('TenantCustomPage ERP işlemleri', () => {
  it('shows the server field error under the bound input', async () => {
    api.mockImplementation(async (endpoint: string) => {
      if (endpoint.endsWith('/published')) {
        return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true }, definitionJson: JSON.stringify(definition) };
      }
      if (endpoint === '/api/custom-pages/erp-operations') return { operations: [insertOp] };
      throw Object.assign(new Error('Ad zorunlu.'), { status: 400, fieldErrors: { Name: ['Zorunlu.'] } });
    });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/custom-pages/erp-operations', 't'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(container.querySelector('.tenant-page-input-error')?.textContent).toBe('Zorunlu.'));
    expect(api).toHaveBeenCalledWith('/api/stock/items', 't', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":""}' });
  });

  it('does not fetch the catalog for SQL-only pages', async () => {
    api.mockImplementation(async (endpoint: string) => endpoint.endsWith('/published')
      ? { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true }, definitionJson: JSON.stringify({ ...definition, queries: [{ ...definition.queries[0], operation: undefined }] }) }
      : { affectedRows: 0 });
    render(<TenantCustomPage code="p" token="t" />);
    await screen.findByRole('button', { name: 'Kaydet' });
    expect(api).not.toHaveBeenCalledWith('/api/custom-pages/erp-operations', 't');
  });
});
