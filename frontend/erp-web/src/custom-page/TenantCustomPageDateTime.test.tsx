import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Saat dilimi modüller yüklenmeden sabitlenir (UTC+3, yaz saati yok): UTC'de çalışan CI'da da kayma sınanır.
vi.hoisted(() => { process.env.TZ = 'Europe/Istanbul'; });

import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

// Tarih + saat girişi (E1): kaynak ISO değeri yerel gösterilir; yazma gövdesine saat dilimli UTC ISO gider.
const queries = [
  { id: 'kart', name: 'kart', kind: 'read', runOn: 'load', parameters: [] },
  { id: 'kaydet', name: 'kaydet', kind: 'insert', runOn: 'manual', operation: 'takip.kaydet',
    parameters: [{ name: 'nextActivityAt', binding: '{{takip.value}}', type: 'datetime' }] },
];
const saveOperation = {
  name: 'takip.kaydet', label: 'Takip kaydet', module: 'Test', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/follow-ups',
  parameters: [{ name: 'nextActivityAt', in: 'body', type: 'datetime', required: false }], result: { shape: 'record', rowsPath: null, columns: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-21', deprecated: false, allowed: true,
};
const components = [
  { id: 'kc', type: 'formCard', props: { title: 'Takip', inputs: ['takip'] } },
  { id: 'takip', type: 'input', name: 'takip', props: { inputType: 'datetime', label: 'Sonraki takip', defaultValue: '{{kart.rows[0].nextActivityAt}}' } },
  { id: 'bar', type: 'actionBar', props: { saveSequence: ['kaydet'] } },
];

let writes: Record<string, unknown>[] = [];
function setup(nextActivityAt: string | null) {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (!endpoint.includes('/queries/') && endpoint.includes('/published')) {
      return { id: 'p', code: 'p', name: 'Takip', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    if (endpoint.includes('/queries/kart/run')) return { columns: [], rows: [{ nextActivityAt }], rowCount: 1, truncated: false };
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [saveOperation] };
    if (endpoint !== '/api/follow-ups') throw new Error(`unexpected ${endpoint}`);
    writes.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>);
    return { id: 'f1' };
  });
  return render(<CommandProvider><ActionBar locale="tr" /><KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews><ConfirmDialogHost /></CommandProvider>);
}
const save = () => fireEvent.click(screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>('[data-command="save"]')!);
const field = () => screen.getByLabelText('Sonraki takip') as HTMLInputElement;

beforeEach(() => { writes = []; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('datetime input (E1)', () => {
  it('renders datetime-local with the stored instant in local time and saves it unchanged (no shift)', async () => {
    setup('2026-11-21T09:30:45+00:00');
    await waitFor(() => expect(field().value).toBe('2026-11-21T12:30'));
    expect(field().type).toBe('datetime-local');
    save();
    await waitFor(() => expect(writes).toHaveLength(1));
    // Dokunulmamış değer aynı anı saniyesiyle korur.
    expect(writes[0].nextActivityAt).toBe('2026-11-21T09:30:45.000Z');
  });

  it('converts the typed local time to UTC with offset', async () => {
    setup(null);
    await screen.findByLabelText('Sonraki takip');
    fireEvent.change(field(), { target: { value: '2026-12-01T14:05' } });
    save();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].nextActivityAt).toBe('2026-12-01T11:05:00.000Z');
  });

  it('sends null when the field is empty', async () => {
    setup('2026-11-21T09:30:00Z');
    await waitFor(() => expect(field().value).toBe('2026-11-21T12:30'));
    fireEvent.change(field(), { target: { value: '' } });
    save();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].nextActivityAt ?? null).toBeNull();
  });
});
