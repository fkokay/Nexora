import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from '../system-pages/customersOperations.fixture.json';

// Kalıpsız (eski) sayfaların çizimi anlık görüntüyle sabitlenir: kalıp desteği eklenirken eski sayfalar değişmemeli.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const loadStandard = (key: string) => JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${key}.json`), 'utf8')) as { title: string; definition: unknown };
const KEY = 'customers';
const standard = loadStandard(KEY);
const jwt = `x.${btoa(JSON.stringify({ sub: 'u1', role: 'TenantAdmin' })).replace(/=+$/, '')}.y`;

const customer = (id: string, code: string, name: string) => ({
  id, code, name, type: 'Both', taxNumber: '1234567890', isActive: true, createdAt: '2026-01-01T00:00:00Z', rowVersion: `rv-${code}`,
  groupId: null, groupName: 'Bayiler', currencyCode: 'TRY', riskLimit: 250000, paymentTermDays: 30, identityNumber: null, taxOffice: 'Konya VD',
  parentCompanyId: null, parentCompanyName: null, subsidiaryCount: 0, customFields: {}, isEInvoiceRegistered: true, eInvoiceRecipientAlias: null,
  phone: '0 332 000 00 00', email: 'info@ornek.test', website: null, contactName: 'Ali Veli', contactPhone: null, contactEmail: null,
  priceListCode: null, receivableAccountCode: '120.01', payableAccountCode: null, bankName: null, bankBranchCode: null, iban: null,
});

const legacy = {
  schemaVersion: 2,
  components: [
    { id: 'bar', type: 'actionBar', props: {} },
    { id: 'tablo', type: 'dataTable', name: 'tablo', props: { title: 'Kayıtlar', columns: ['code', 'name'] } },
    { id: 'toplam', type: 'metric', props: { title: 'Toplam', value: '42', description: 'kayıt' } },
  ],
  queries: [],
};

const published = (code: string, name: string, definition: unknown, extra: Record<string, unknown> = {}) =>
  ({ id: code, code, name, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true }, definitionJson: JSON.stringify(definition), ...extra });

function setup(definition: unknown, system = false, key = KEY, title = standard.title) {
  api.mockImplementation(async (endpoint: string) => {
    const [path] = endpoint.split('?');
    if (endpoint.includes('/published')) {
      return system
        ? published(`@${key}`, title, definition, { screenKey: key, source: 'standard', standardVersion: 1 })
        : published('legacy', 'Eski sayfa', definition);
    }
    if (path === '/api/custom-pages/erp-operations') return catalog;
    if (path === '/api/customers') return { items: [customer('1', 'C-1001', 'FATİH KOKAY'), customer('2', 'C-1002', 'ÖRNEK TEKSTİL')], page: 1, pageSize: 25, totalCount: 2 };
    if (path === '/api/customers/counts') {
      return { totalCount: 128, activeCount: 121, inactiveCount: 7, customerCount: 80, supplierCount: 31, bothCount: 17, dealerCount: 0, employeeCount: 0, eInvoiceRegisteredCount: 14, riskLimitDefinedCount: 9 };
    }
    return { entity: { name: 'x', fields: [] }, items: [], total: 0 };
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        {system ? <TenantCustomPage systemScreenKey={key} token={jwt} onOpenLegacy={() => {}} /> : <TenantCustomPage code="legacy" token={jwt} />}
      </KeepAliveViews>
    </CommandProvider>,
  );
}

beforeEach(() => { api.mockReset(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-25T09:00:00Z') }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const T = { timeout: 10000 };
// React useId kimlikleri (_r_1k_) çizim sırasına bağlıdır; ilk görülme sırasıyla numaralanır ki anlık görüntü kararlı olsun.
const markup = (container: HTMLElement) => {
  const seen = new Map<string, string>();
  return container.innerHTML.replace(/_r_[0-9a-z]+_/g, (id) => { if (!seen.has(id)) seen.set(id, `_r_${seen.size}_`); return seen.get(id)!; });
};
const settle = async () => { await new Promise((done) => setTimeout(done, 300)); };

describe('kalıpsız sayfalar değişmeden çizilir', { timeout: 30000 }, () => {
  it('legacy custom page renders the same markup as before', async () => {
    const { container } = setup(legacy);
    await screen.findByText('Toplam', undefined, T);
    await settle();
    expect(markup(container)).toMatchSnapshot();
  });

  it('customers system standard renders unchanged', async () => {
    const { container } = setup(standard.definition, true);
    await screen.findByText('FATİH KOKAY', { selector: '.tenant-page-data-grid td' }, T);
    await waitFor(() => expect(document.body.textContent).toContain('tüm kayıtlar · 121 aktif'), T);
    await settle();
    expect(markup(container)).toMatchSnapshot();
  });

  it('customer-create system standard renders unchanged', async () => {
    const create = loadStandard('customer-create');
    const { container } = setup(create.definition, true, 'customer-create', create.title);
    await screen.findByText('Cari kimliği', undefined, T);
    // ERP işlem kataloğu yerleşene kadar beklenir (yük altında 300 ms yetmez): kataloğa bağlı bütün iletiler çizilmiş,
    // yükleme göstergesi kalkmış olmalı.
    await waitFor(() => {
      for (const text of ['ERP işlemi bulunamadı: cari.gruplar', 'ERP işlemi bulunamadı: cari.anaFirmaSecenekleri', 'ERP işlemi bulunamadı: cari.iller',
        'ERP işlemi bulunamadı: cari.ozelAlanTanimlari', 'Önizleme işlemi bulunamadı.']) expect(container.textContent).toContain(text);
      expect(container.textContent).not.toContain('Yükleniyor…');
      expect((container.querySelector('#page-input-ilce') as HTMLInputElement | null)?.value).toBe('Seçin');
    }, T);
    await settle();
    expect(markup(container)).toMatchSnapshot();
  });

  it('legacy page with formCard tabs and inputs renders unchanged', async () => {
    const card = {
      schemaVersion: 2,
      components: [
        { id: 'bar', type: 'actionBar', props: {} },
        { id: 'kimlik', type: 'formCard', name: 'kimlik', props: { title: 'Kimlik', columns: 3, inputs: ['tur', 'tarih'] } },
        { id: 'tur', type: 'input', name: 'tur', props: { inputType: 'select', label: 'Tür', staticOptions: ['A=Alıcı', 'B=Satıcı'], defaultFirst: true } },
        { id: 'tarih', type: 'input', name: 'tarih', props: { inputType: 'date', label: 'Tarih' } },
        { id: 'sekmeler', type: 'tabs', name: 'sekmeler', props: { tabs: ['Genel=ozet', 'Notlar=not'] } },
        { id: 'ozet', type: 'metric', props: { title: 'Özet', value: '7', description: 'adet' } },
        { id: 'not', type: 'label', props: { text: 'Not metni' } },
      ],
      queries: [],
    };
    const { container } = setup(card);
    await screen.findByText('Kimlik', undefined, T);
    await settle();
    expect(markup(container)).toMatchSnapshot();
  });

  it('page with slot props but no template renders as legacy', async () => {
    const withSlots = {
      ...legacy,
      components: legacy.components.map((component) => ({ ...component, props: { ...component.props, slot: 'header', slotOrder: 1 } })),
    };
    const plain = setup(legacy);
    await screen.findByText('Toplam', undefined, T);
    await settle();
    const expected = markup(plain.container);
    cleanup();
    api.mockReset();
    const slotted = setup(withSlots);
    await screen.findByText('Toplam', undefined, T);
    await settle();
    expect(markup(slotted.container)).toBe(expected);
  });
});
