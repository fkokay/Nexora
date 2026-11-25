import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';

// Bir ERP yazma işleminin 400/409 ProblemDetails yanıtı (`detail`, yoksa genel olmayan `title`, ya da `{ error }`) gerçek
// `api` ile sayfanın hata uyarısına değişmeden ulaşır; yapılandırılmış hata mesajı varsa sunucu nedeni parantez içinde kalır.

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../authApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../authApi')>()), authenticatedFetch: fetchMock }));
// ERP işlem kataloğu ilk çizimden hazırdır: gerçek yükleme yanıtı düğme tıklamasından sonra gelebilir ve yazma
// "katalog henüz yüklenmedi" hatasıyla biterdi (CI'da ara sıra kırılan yarış). Yazma isteği yine gerçek `api` ile gider.
vi.mock('./useErpOperations', () => ({ useErpOperations: () => ({ operations: catalog, error: '' }) }));

const cancelOp = {
  name: 'satinalma.malKabul.iptal', label: 'Mal kabul iptal', module: 'Satınalma', kind: 'write', pageKind: 'update', method: 'POST',
  route: '/api/purchasing/receipts/void',
  parameters: [{ name: 'note', in: 'body', type: 'text', required: false }], result: { shape: 'record', rowsPath: null, columns: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-21', deprecated: false, allowed: true,
};
const { catalog } = vi.hoisted(() => ({ catalog: new Map<string, unknown>() }));
catalog.set(cancelOp.name, cancelOp);
const definition = (buttonProps: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  components: [{ id: 'in1', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } }, { id: 'b1', type: 'button', props: { text: 'İptal et', actionType: 'query', queryId: 'qi', ...buttonProps } }],
  queries: [{ id: 'qi', name: 'iptal', kind: 'update', runOn: 'manual', operation: cancelOp.name, parameters: [{ name: 'note', binding: '{{not.value}}', type: 'text' }] }],
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } });
function serve(failure: { status: number; body: unknown }, buttonProps?: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/published')) {
      return json({ id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true }, definitionJson: JSON.stringify(definition(buttonProps)) });
    }
    if (url === '/api/purchasing/receipts/void') return json(failure.body, failure.status);
    throw new Error(`unexpected ${url}`);
  });
}
async function clickAndReadAlert() {
  render(<TenantCustomPage code="p" token="t" />, { wrapper: CommandProvider });
  fireEvent.click(await screen.findByRole('button', { name: 'İptal et' }));
  return (await screen.findByRole('alert', {}, { timeout: 5000 })).textContent ?? '';
}

afterEach(() => { cleanup(); fetchMock.mockReset(); });

describe('ERP yazma hatası ProblemDetails', () => {
  it('409 shows the ProblemDetails detail, not the generic title', async () => {
    serve({ status: 409, body: { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Faturalanmış mal kabul iptal edilemez; önce faturayı iptal edin.', traceId: 'tr-1' } });
    const text = await clickAndReadAlert();
    expect(text).toContain('Faturalanmış mal kabul iptal edilemez; önce faturayı iptal edin.');
    expect(text).not.toContain('Conflict');
  });

  it('400 with only a specific title shows the title', async () => {
    serve({ status: 400, body: { title: 'Fatura tarihi kapalı döneme düşüyor.', status: 400 } });
    expect(await clickAndReadAlert()).toContain('Fatura tarihi kapalı döneme düşüyor.');
  });

  it('409 with an { error } body shows the error text', async () => {
    serve({ status: 409, body: { error: 'Mal kabul başka bir işlemde değiştirildi.' } });
    expect(await clickAndReadAlert()).toContain('Mal kabul başka bir işlemde değiştirildi.');
  });

  it('a configured error message keeps the 409 server reason', async () => {
    serve({ status: 409, body: { title: 'Conflict', status: 409, detail: 'Mal kabul zaten iptal edilmiş.' } }, { errorMessage: 'Mal kabul iptal edilemedi.' });
    expect(await clickAndReadAlert()).toContain('Mal kabul iptal edilemedi. (Mal kabul zaten iptal edilmiş.)');
  });
});
