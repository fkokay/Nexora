import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Saat dilimi modüller yüklenmeden sabitlenir (UTC+3, yaz saati yok): "Sonraki takip" yerel ↔ UTC dönüşümü sınanır.
vi.hoisted(() => { process.env.TZ = 'Europe/Istanbul'; });

import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './crmOpportunityCreateOperations.fixture.json';

// "Fırsat kartı" standart tanımı (crm-opportunity-create.json): yeni ve düzenleme tek tanım. `{{sayfa.parametre.opportunityId}}`
// boşsa yeni fırsat (crm.firsat.olustur), doluysa o fırsat düzenlenir (crm.firsat.getir + crm.firsat.guncelle).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'crm-opportunity-create';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const O1 = '33333333-0000-0000-0000-000000000001';
const NEW = '33333333-0000-0000-0000-0000000000aa';
const C1 = '22222222-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

let stage = 'Proposal';
const card = (extra: Record<string, unknown> = {}) => ({
  id: O1, code: 'FRS-001', name: 'Depo otomasyonu', customerId: C1, customerName: 'Akdeniz Gıda', stage, estimatedValue: 125000, currencyCode: 'TRY',
  probabilityPercent: 50, expectedCloseDate: '2026-12-15', nextActivityAt: '2026-11-21T09:30:45+00:00', notes: 'İlk görüşme yapıldı.',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', rowVersion: 'rv-1', ...extra,
});
const customer = { id: C1, code: 'C-1001', name: 'Akdeniz Gıda', type: 'Customer', isActive: true, taxNumber: null, createdAt: '2026-01-01T00:00:00Z', rowVersion: 'c1' };

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/customers') return { items: [customer], page: 1, pageSize: 25, totalCount: 1 };
    if (path === `/api/crm/opportunities/${O1}`) return card();
  } else {
    if (path === '/api/crm/opportunities' && method === 'POST') return { ...card(), id: NEW };
    if (path === `/api/crm/opportunities/${O1}` && method === 'PUT') return card();
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(opportunityId?: string) {
  setPageParams(KEY, opportunityId ? { opportunityId } : {});
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
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const ready = (id: string) => waitFor(() => expect(command(id)?.getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const posts = () => writes().filter((call) => call.method === 'POST' && call.url === '/api/crm/opportunities');
const puts = () => writes().filter((call) => call.method === 'PUT');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const title = () => document.querySelector('.tenant-custom-page-header h1, .list-v2-title h1')?.textContent;
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const openNew = async () => {
  setup();
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await ready('save');
};
const openCard = async () => {
  setup(O1);
  await waitFor(() => expect(input('ad').value).toBe('Depo otomasyonu'), T);
};

beforeEach(() => {
  calls = []; navigations = []; stage = 'Proposal'; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Fırsat kartı standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('the follow-up parameter is a datetime on both writes (not a day-only date)', () => {
    for (const name of ['crm.firsat.olustur', 'crm.firsat.guncelle']) {
      const operation = catalog.operations.find((item) => item.name === name)!;
      expect(operation.parameters.find((parameter) => parameter.name === 'nextActivityAt')?.type).toBe('datetime');
    }
  });

  it('new: title, defaults, no card read; the customer picker asks for active customers (Customer,Both)', async () => {
    await openNew();
    expect(title()).toBe('Yeni fırsat');
    expect(calls.filter((call) => call.url.startsWith(`/api/crm/opportunities/${O1}`))).toEqual([]);
    expect(input('dovizYeni').value).toBe('TRY');
    expect(input('olasilikYeni').value).toBe('10');
    expect(input('takip').type).toBe('datetime-local');
    await waitFor(() => expect(calls.some((call) => call.method === 'GET' && call.url.split('?')[0] === '/api/customers')).toBe(true), T);
    const lookup = calls.find((call) => call.method === 'GET' && call.url.split('?')[0] === '/api/customers')!;
    expect(query(lookup.url).get('type')).toBe('Customer,Both');
    expect(query(lookup.url).get('status')).toBe('Active');
  });

  it('new: Not is a multi-line field and a blank code is left to the server', async () => {
    await openNew();
    expect(input('not').tagName).toBe('TEXTAREA');
    expect(input('kod').required).toBe(false);
    expect(input('kod').placeholder).toBe('Boşsa kayıtta otomatik verilir');
    type('ad', 'Kodsuz fırsat');
    type('not', 'Birinci satır\nİkinci satır');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body.code ?? '').toBe('');
    expect(body.notes).toBe('Birinci satır\nİkinci satır');
  });

  it('new: probability preset, local follow-up time as UTC, then back to the list with refresh', async () => {
    await openNew();
    type('ad', 'Depo otomasyonu');
    type('kod', 'frs-2026-001');
    type('tutar', '125000');
    type('kapanis', '2026-12-15');
    type('takip', '2026-11-24T14:00');
    // Hazır değerler alanın kendi grubunda: seçili olan basılı görünür.
    const presets = screen.getByRole('group', { name: 'Kazanma olasılığı (%): hazır değerler' });
    expect(input('olasilikYeni').closest('.tenant-page-input')!.contains(presets)).toBe(true);
    fireEvent.click(within(presets).getByRole('button', { name: '%75' }));
    await waitFor(() => expect(input('olasilikYeni').value).toBe('75'), T);
    expect(within(presets).getByRole('button', { name: '%75' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(presets).getByRole('button', { name: '%10' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ code: 'FRS-2026-001', name: 'Depo otomasyonu', estimatedValue: 125000, currencyCode: 'TRY', probabilityPercent: 75,
      expectedCloseDate: '2026-12-15', nextActivityAt: '2026-11-24T11:00:00.000Z' });
    expect(body.customerId ?? null).toBeNull();
    expect(puts()).toEqual([]);
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'crm-opportunities', params: {}, replace: true, refresh: true });
  });

  it('new: an empty follow-up is sent as null', async () => {
    await openNew();
    type('ad', 'Takipsiz');
    type('kod', 'FRS-2');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    expect(JSON.parse(posts()[0].body!).nextActivityAt ?? null).toBeNull();
  });

  it('Kaydet ve yeni (new only) creates twice and stays on an empty card', async () => {
    await openNew();
    type('ad', 'Birinci');
    type('kod', 'FRS-A');
    // Kaydet ve yeni is a bar button next to Kaydet.
    fireEvent.click(await waitFor(() => { const button = screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>('[data-command="save-and-new"]'); expect(button).not.toBeNull(); return button!; }));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    expect(navigations.filter((request) => request.page === 'crm-opportunities')).toEqual([]);
    type('ad', 'İkinci');
    type('kod', 'FRS-B');
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    await waitFor(() => expect(posts()).toHaveLength(2), T);
    expect(JSON.parse(posts()[1].body!)).toMatchObject({ code: 'FRS-B', name: 'İkinci' });
  });

  it('edit: loads the card, shows the follow-up in local time and an unchanged save keeps the same instant', async () => {
    await openCard();
    await waitFor(() => expect(title()).toBe('Depo otomasyonu'), T);
    expect(input('kod').value).toBe('FRS-001');
    expect(input('doviz').value).toBe('TRY');
    expect(input('olasilik').value).toBe('50');
    expect(input('takip').value).toBe('2026-11-21T12:30');
    expect(document.body.textContent).toContain('FRS-001 · Akdeniz Gıda');
    expect(screen.getAllByText('Teklif').length).toBeGreaterThan(0);
    await ready('save');
    type('ad', 'Depo otomasyonu II');
    fireEvent.click(screen.getByRole('button', { name: '%90' }));
    await waitFor(() => expect(input('olasilik').value).toBe('90'), T);
    fireEvent.click(command('save')!);
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    expect(puts()[0].url).toBe(`/api/crm/opportunities/${O1}`);
    const body = JSON.parse(puts()[0].body!);
    expect(body).toMatchObject({ code: 'FRS-001', name: 'Depo otomasyonu II', customerId: C1, currencyCode: 'TRY', probabilityPercent: 90,
      expectedCloseDate: '2026-12-15', notes: 'İlk görüşme yapıldı.' });
    // Dokunulmamış takip zamanı kaymaz (saniyesi dahil aynı an).
    expect(new Date(body.nextActivityAt as string).toISOString()).toBe('2026-11-21T09:30:45.000Z');
    expect(posts()).toEqual([]);
  });

  it('edit: a changed follow-up is converted from local time', async () => {
    await openCard();
    await ready('save');
    type('takip', '2026-11-25T09:15');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    expect(JSON.parse(puts()[0].body!).nextActivityAt).toBe('2026-11-25T06:15:00.000Z');
  });

  it('edit: a cleared follow-up writes null instead of keeping the stored time', async () => {
    await openCard();
    await ready('save');
    type('takip', '');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    const body = JSON.parse(puts()[0].body!);
    expect(body).toHaveProperty('nextActivityAt', null);
  });

  it('edit: no Kaydet ve yeni', async () => {
    await openCard();
    await ready('save');
    // Kaydet ve yeni was the only İşlemler item: on an edit card there is no menu at all.
    expect(command('more')).toBeNull();
  });

  it('closed opportunity: warning shown and no save', async () => {
    stage = 'Won';
    await openCard();
    await waitFor(() => expect(document.body.textContent).toContain('Kapanmış fırsat düzenlenemez'), T);
    expect(screen.getAllByText('Kazanıldı').length).toBeGreaterThan(0);
    const save = command('save');
    expect(save === null || save.getAttribute('aria-disabled') === 'true').toBe(true);
    fireEvent.keyDown(window, { key: 'F2' });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await new Promise((done) => setTimeout(done, 100));
    expect(writes()).toEqual([]);
  });
});
