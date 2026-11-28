import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Saat dilimi modüller yüklenmeden sabitlenir (UTC+3, yaz saati yok): "Sonraki takip" yerel saatle yazılır.
vi.hoisted(() => { process.env.TZ = 'Europe/Istanbul'; });

import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './crmOpportunitiesOperations.fixture.json';

// "CRM Fırsatları" standart tanımı (crm-opportunities.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'crm-opportunities';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const O1 = '33333333-0000-0000-0000-000000000001';
const O2 = '33333333-0000-0000-0000-000000000002';
const O3 = '33333333-0000-0000-0000-000000000003';
const O4 = '33333333-0000-0000-0000-000000000004';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const opportunity = (id: string, code: string, name: string, stage: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, customerId: 'c1', customerName: 'Akdeniz Gıda', stage, estimatedValue: 125000, currencyCode: 'TRY', probabilityPercent: 50,
  expectedCloseDate: '2026-12-15', nextActivityAt: '2026-11-21T09:30:00+00:00', notes: null, createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z', rowVersion: `rv-${code}`, ...extra,
});
const rows = () => [
  opportunity(O1, 'FRS-001', 'Depo otomasyonu', 'Prospecting'),
  opportunity(O2, 'FRS-002', 'Yıllık bakım', 'Won', { nextActivityAt: null }),
  opportunity(O3, 'FRS-003', 'Soğuk zincir', 'Negotiation', { customerId: null, customerName: null }),
  opportunity(O4, 'FRS-004', 'Filo yenileme', 'Lost', { notes: 'Fiyat yüksek bulundu.' }),
];
let summary: Record<string, unknown> = {};
const baseSummary = () => ({ totalCount: 4, prospectingCount: 1, qualifiedCount: 0, proposalCount: 0, negotiationCount: 1, wonCount: 7, lostCount: 1,
  openCount: 2, overdueCount: 3, openValueAmount: 250000, openValueCurrencyCode: 'TRY', otherCurrencyCount: 0 });

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/crm/opportunities') return { items: rows(), page: 1, pageSize: 50, total: 4, totalCount: 4 };
    if (path === '/api/crm/opportunities/summary') return summary;
  } else if (method === 'POST' && /^\/api\/crm\/opportunities\/[^/]+\/stage$/.test(path)) {
    return rows()[0];
  } else if (method === 'DELETE' && /^\/api\/crm\/opportunities\/[^/]+$/.test(path)) {
    return null;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
// Liste kalıbı: komutlar kabuğun "İşlemler" çubuğundadır; "⋯" = "Diğer işlemler".
const command = (id: string) => {
  const shell = screen.getByRole('toolbar', { name: 'İşlemler' });
  return (id === 'more' ? within(shell).getByRole('button', { name: 'Diğer işlemler' }) : shell.querySelector<HTMLElement>(`[data-command="${id}"]`))!;
};
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td' }, T);
const rowOf = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td' }).closest('tr')!;
const menuNames = async () => {
  fireEvent.click(command('more'));
  await screen.findAllByRole('menuitem', {}, T);
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  return names;
};
const select = async (name: string) => {
  fireEvent.click(await cell(name));
  await waitFor(() => expect(rowOf(name).getAttribute('aria-selected') === 'true' || rowOf(name).classList.contains('is-selected')
    || rowOf(name).getAttribute('aria-current') === 'true').toBe(true), T);
};

beforeEach(() => {
  calls = []; navigations = []; summary = baseSummary(); api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams('crm-opportunity-create', {});
});

describe('CRM Fırsatları standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 50 and the metrics with one summary request', async () => {
    setup();
    await cell('Depo otomasyonu');
    const list = gets('/api/crm/opportunities');
    expect(list.length).toBeGreaterThan(0);
    expect(query(list[0].url).get('page')).toBe('1');
    expect(query(list[0].url).get('pageSize')).toBe('50');
    await waitFor(() => expect(gets('/api/crm/opportunities/summary')).toHaveLength(1), T);
    const text = () => document.body.textContent ?? '';
    await waitFor(() => expect(text()).toContain('Takibi geçmiş'), T);
    expect(text()).toContain('Açık fırsat');
    expect(text()).toContain('tüm kayıtlar · TRY');
    expect(text()).not.toContain('dövizde');
    // Aşama etiketleri Türkçe; sonraki takip yerel tarih + saat; boş takip boş hücre.
    expect(screen.getAllByText('İlk temas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Müzakere').length).toBeGreaterThan(0);
    expect(within(rowOf('Depo otomasyonu')).getByText('21.11.2026 12:30')).toBeTruthy();
    expect(within(rowOf('Depo otomasyonu')).getByText('FRS-001')).toBeTruthy();
  });

  it('the open value is one indicator: the other-currency count adds no extra hint', async () => {
    summary = { ...baseSummary(), otherCurrencyCount: 2 };
    setup();
    await waitFor(() => expect(document.body.textContent).toContain('tüm kayıtlar · TRY'), T);
    expect(document.body.textContent).not.toContain('dövizde');
  });

  it('the stage selection filters the list with the stage parameter', async () => {
    setup();
    await cell('Depo otomasyonu');
    const before = gets('/api/crm/opportunities').length;
    // Aşama, Süzgeç alanındaki seçim süzgecidir (filterBar `stage`).
    const stage = within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Aşama') as HTMLSelectElement;
    fireEvent.change(stage, { target: { value: 'Won' } });
    await waitFor(() => expect(gets('/api/crm/opportunities').length).toBeGreaterThan(before), T);
    const last = gets('/api/crm/opportunities').at(-1)!;
    expect(query(last.url).get('stage')).toBe('Won');
    expect(query(last.url).get('page')).toBe('1');
  });

  it('Aç opens the card standard with opportunityId; Yeni opens an empty card; a closed one cannot be opened', async () => {
    setup();
    await select('Depo otomasyonu');
    await ready('open');
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'crm-opportunity-create', params: { opportunityId: O1 } });
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'crm-opportunity-create', params: {} });

    await select('Yıllık bakım');
    await waitFor(() => expect(command('open').getAttribute('aria-disabled')).toBe('true'), T);
    // Pasif komutun nedeni üzerine gelince ipucu olarak çıkar.
    fireEvent.mouseEnter(command('open'));
    expect((await screen.findByRole('tooltip', {}, T)).textContent).toContain('Kapanmış fırsat düzenlenemez');
  });

  // Aşama düğmeleri satır eylemidir: her satır yalnız sıradaki aşamayı ve (açıksa) Kaybedildi'yi çizer.
  const rowButtons = (text: string) => within(rowOf(text)).queryAllByRole('button').map((button) => button.textContent?.trim() ?? '');
  const rowButton = (text: string, name: RegExp) => within(rowOf(text)).getByRole('button', { name });

  it('each row offers only its next stage and Kaybedildi; closed rows offer none', async () => {
    setup();
    await cell('Depo otomasyonu');
    expect(rowButtons('Depo otomasyonu')).toEqual(expect.arrayContaining(['Nitelikliye taşı', 'Kaybedildi']));
    expect(rowButtons('Depo otomasyonu')).not.toContain('Teklife taşı');
    expect(rowButtons('Soğuk zincir')).toEqual(expect.arrayContaining(['Kazanıldı', 'Kaybedildi']));
    expect(rowButtons('Yıllık bakım')).toEqual([]);
    expect(rowButtons('Filo yenileme')).toEqual([]);
    // Aşama düğmeleri çubuğun "⋯" menüsünde değil satırdadır.
    expect((await menuNames()).some((name) => /taşı|Kaybedildi/.test(name))).toBe(false);
  });

  it('Aşamayı ilerlet posts the fixed stage body and refreshes the list and the summary', async () => {
    setup();
    await select('Depo otomasyonu');
    await waitFor(() => expect(gets('/api/crm/opportunities/summary')).toHaveLength(1), T);
    const lists = gets('/api/crm/opportunities').length;
    fireEvent.click(rowButton('Depo otomasyonu', /^Nitelikliye taşı/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/crm/opportunities/${O1}/stage` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ stage: 'Qualified' });
    // Motor başarı iletisine etkilenen kayıt sayısını ekler.
    expect(await screen.findByText(/^Depo otomasyonu: Nitelikli aşamasına taşındı\./, {}, T)).toBeTruthy();
    await waitFor(() => expect(gets('/api/crm/opportunities/summary').length).toBeGreaterThan(1), T);
    expect(gets('/api/crm/opportunities').length).toBeGreaterThan(lists);
  });

  it('Kazanıldı is disabled without a customer', async () => {
    setup();
    await cell('Soğuk zincir');
    const item = rowButton('Soğuk zincir', /^Kazanıldı/) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toContain('önce bir müşteri carisi bağlayın');
  });

  it('Kaybedildi asks first, then posts the Lost stage', async () => {
    setup();
    await cell('Soğuk zincir');
    fireEvent.click(rowButton('Soğuk zincir', /^Kaybedildi/));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('Soğuk zincir');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/crm/opportunities/${O3}/stage` });
    expect(JSON.parse(writes()[0].body!)).toEqual({ stage: 'Lost' });
  });

  it('Sil asks first, then deletes the selected opportunity', async () => {
    setup();
    await select('Depo otomasyonu');
    await ready('delete');
    fireEvent.click(command('delete'));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    // Onay kaydı adlandırır (deleteConfirmText).
    expect(within(dialog).getByRole('heading').textContent).toBe('FRS-001 · Depo otomasyonu fırsatı silinsin mi?');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'DELETE', url: `/api/crm/opportunities/${O1}` });
  });

  it('detail card: key values, local follow-up time, stage path for open and a note for lost opportunities', async () => {
    setup();
    await cell('Depo otomasyonu');
    // Liste kalıbı: seçim yokken detay çizilmez; panel düğmesi yok.
    expect(screen.queryByRole('button', { name: 'Detay paneli' })).toBeNull();
    expect(document.querySelector('.list-template-detail')).toBeNull();
    await select('Depo otomasyonu');
    await waitFor(() => expect(document.body.textContent).toContain('Kazanma olasılığı'), T);
    const text = () => document.body.textContent ?? '';
    expect(text()).toContain('Sonraki takip');
    expect(text()).toContain('21.11.2026 12:30');
    expect(text()).toContain('Akdeniz Gıda');
    expect(text()).not.toContain('Kaybedildi · aşama geçmişi tutulmuyor');
    await select('Filo yenileme');
    await waitFor(() => expect(text()).toContain('Kaybedildi · aşama geçmişi tutulmuyor'), T);

  });
});
