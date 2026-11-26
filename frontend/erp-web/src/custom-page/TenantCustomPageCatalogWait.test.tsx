import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';

// Sayfa açılır açılmaz ERP işlemine bağlı düğmeye basılırsa yazma, işlem kataloğu gelene kadar bekler;
// "katalog henüz yüklenmedi" hatası vermez. Katalog yüklenemezse yazma o hatayla sonlanır.

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../authApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../authApi')>()), authenticatedFetch: fetchMock }));

const cancelOp = {
  name: 'satinalma.malKabul.iptal', label: 'Mal kabul iptal', module: 'Satınalma', kind: 'write', pageKind: 'update', method: 'POST',
  route: '/api/purchasing/receipts/void',
  parameters: [{ name: 'note', in: 'body', type: 'text', required: false }], result: { shape: 'record', rowsPath: null, columns: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-21', deprecated: false, allowed: true,
};
const definition = {
  schemaVersion: 2,
  components: [{ id: 'in1', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } }, { id: 'b1', type: 'button', props: { text: 'İptal et', actionType: 'query', queryId: 'qi' } }],
  queries: [{ id: 'qi', name: 'iptal', kind: 'update', runOn: 'manual', operation: cancelOp.name, parameters: [{ name: 'note', binding: '{{not.value}}', type: 'text' }] }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Katalog yanıtı `release` çağrılana kadar bekletilir. */
function serve(catalog: () => Response) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/published')) {
      return json({ id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true }, definitionJson: JSON.stringify(definition) });
    }
    if (url === '/api/custom-pages/erp-operations') { await gate; return catalog(); }
    if (url === '/api/purchasing/receipts/void') return json({ title: 'Conflict', status: 409, detail: 'Faturalanmış mal kabul iptal edilemez.' }, 409);
    throw new Error(`unexpected ${url}`);
  });
  return release;
}

afterEach(() => { cleanup(); fetchMock.mockReset(); });

describe('ERP işlem kataloğu yüklenmeden basılan düğme', () => {
  it('waits for the catalog and then runs the write', async () => {
    const release = serve(() => json({ operations: [cancelOp] }));
    render(<TenantCustomPage code="p" token="t" />, { wrapper: CommandProvider });
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    await Promise.resolve();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/purchasing/receipts/void')).toBe(false);
    release();
    const text = (await screen.findByRole('alert', {}, { timeout: 5000 })).textContent ?? '';
    expect(text).toContain('Faturalanmış mal kabul iptal edilemez.');
    expect(text).not.toContain('henüz yüklenmedi');
  });

  it('ends with the catalog error when the catalog cannot be loaded', async () => {
    const release = serve(() => json({ error: 'Katalog sunucusu yanıt vermedi.' }, 500));
    render(<TenantCustomPage code="p" token="t" />, { wrapper: CommandProvider });
    fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
    release();
    const text = (await screen.findByRole('alert', {}, { timeout: 5000 })).textContent ?? '';
    expect(text).not.toContain('henüz yüklenmedi');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/purchasing/receipts/void')).toBe(false);
  });
});
