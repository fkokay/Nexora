import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './manufacturingCostVarianceOperations.fixture.json';

// "Üretim maliyet analizi" standart tanımı (manufacturing-cost-variance.json): plan tarihi aralığı sunucu parametresidir;
// göstergeler yanıtın düz sayfa toplamlarından, kapsam notu `limitations` alanından gelir. API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'manufacturing-cost-variance';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const order = (orderCode: string, status: string, extra: Record<string, unknown> = {}) => ({
  orderCode, plannedDate: '2026-11-18', status, plannedQuantity: 1200, operationCount: 2, currencyCode: 'TRY', plannedLaborBase: 300, actualLaborBase: 320,
  plannedOverheadBase: 100, actualOverheadBase: 110, plannedEnergyBase: 50, actualEnergyBase: 55, plannedMaterialBase: 1250, actualMaterialBase: 1300,
  plannedConversionBase: 450, actualConversionBase: 485, conversionVarianceBase: 35, actualTotalCostBase: 1785, totalVarianceBase: 85, ...extra,
});
let limitations: string | null = 'Fiilî malzeme yalnız tamamlanan emirlerde hesaplanır.';
function report(params: URLSearchParams) {
  return {
    from: params.get('from'), to: params.get('to'), periodBasis: 'plannedDate', baseCurrencyCode: 'TRY', page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 100), totalCount: 2,
    orders: [
      order('URE-001', 'Completed'),
      order('URE-002', 'Planned', { actualLaborBase: null, actualOverheadBase: null, actualEnergyBase: null, actualMaterialBase: null,
        actualConversionBase: null, conversionVarianceBase: null, actualTotalCostBase: null, totalVarianceBase: null }),
    ],
    pageTotals: { orderCount: 2, plannedLaborBase: 600, actualLaborBase: 320, plannedOverheadBase: 200, actualOverheadBase: 110, plannedEnergyBase: 100,
      plannedMaterialBase: 2500, actualEnergyBase: 55, actualConversionBase: 485, actualMaterialBase: 1300 },
    limitations,
    pagePlannedMaterialBase: 2500, pagePlannedConversionBase: 900, pageActualMaterialBase: 1300,
  };
}

type Call = { url: string; method: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path, search] = url.split('?');
  if (method === 'GET' && path === '/api/reports/manufacturing-cost-variance') return report(new URLSearchParams(search ?? ''));
  throw new Error(`unexpected ${method} ${url}`);
}

function setup() {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: false, update: false, delete: false },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantUser')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const reports = () => calls.filter((call) => call.url.split('?')[0] === '/api/reports/manufacturing-cost-variance');
const last = () => new URLSearchParams(reports().at(-1)!.url.split('?')[1] ?? '');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
const rowOf = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }).closest('tr')!;
const text = () => document.body.textContent ?? '';

beforeEach(() => { calls = []; limitations = 'Fiilî malzeme yalnız tamamlanan emirlerde hesaplanır.'; api.mockReset(); localStorage.clear(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Üretim maliyet analizi standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads today .. today, the first page of 50; page metrics come from the flat totals', async () => {
    setup();
    await cell('URE-001');
    const first = new URLSearchParams(reports()[0].url.split('?')[1] ?? '');
    expect([first.get('from'), first.get('to')]).toEqual([today(), today()]);
    expect(first.get('page')).toBe('1');
    expect(first.get('pageSize')).toBe('50');
    expect(input('baslangic').value).toBe(today());
    expect(input('bitis').value).toBe(today());
    await waitFor(() => expect(text()).toContain('2.500,00'), T);
    expect(text()).toContain('900,00');
    expect(text()).toContain('1.300,00');
    expect(text()).toContain('bu sayfa · fire dahil · TRY');
    expect(text()).toContain('bu sayfa · işçilik + genel gider + enerji');
  });

  it('status labels and empty actual costs as a dash', async () => {
    setup();
    await cell('URE-002');
    expect(within(rowOf('URE-001')).getByText('Tamamlandı')).toBeTruthy();
    expect(within(rowOf('URE-002')).getByText('Planlandı')).toBeTruthy();
    expect(within(rowOf('URE-002')).getAllByText('—').length).toBeGreaterThan(0);
    expect(rowOf('URE-001').textContent).toContain('1.785,00');
  });

  it('a changed date range reloads the report', async () => {
    setup();
    await cell('URE-001');
    const before = reports().length;
    fireEvent.change(input('baslangic'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(reports().length).toBeGreaterThan(before), T);
    await waitFor(() => expect(last().get('from')).toBe('2026-01-01'), T);
    expect(last().get('to')).toBe(today());
  });

  it('shows the scope note from limitations and hides it without one', async () => {
    setup();
    await cell('URE-001');
    await waitFor(() => expect(text()).toContain('Fiilî malzeme yalnız tamamlanan emirlerde hesaplanır.'), T);
    cleanup();
    calls = [];
    limitations = null;
    setup();
    await cell('URE-001');
    expect(text()).not.toContain('Rapor kapsamı');
  });
});
