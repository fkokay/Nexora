import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './manufacturingRecipesOperations.fixture.json';

// "Tanımlı reçeteler" standart tanımı: Yeni/Aç Belge ekranına gider; silme, etkinleştirme ve pasife alma listede kalır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; template?: { name: string }; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'manufacturing-recipes';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const B1 = '44444444-0000-0000-0000-000000000001';
const B2 = '44444444-0000-0000-0000-000000000002';
const B3 = '44444444-0000-0000-0000-000000000003';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const bom = (id: string, code: string, name: string, isActive: boolean, orderCount: number, lineCount: number, operationCount: number) => ({
  id, code, name, productStockItemId: 'st1', productName: 'Domates salçası 830 g', productTrackingMode: 'None', outputQuantity: 1, isActive,
  orderCount, rowVersion: `rv-${code}`, lines: [], operations: [], lineCount, operationCount,
});
const rows = () => [
  bom(B1, 'RC-014', 'Salça reçetesi', true, 2, 3, 2),
  bom(B2, 'RC-009', 'Ketçap reçetesi', true, 0, 4, 1),
  bom(B3, 'RC-003', 'Eski sos reçetesi', false, 0, 2, 0),
];

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path, search] = url.split('?');
  if (method === 'GET' && path === '/api/manufacturing/boms') {
    const active = new URLSearchParams(search ?? '').get('isActive');
    return rows().filter((item) => active == null || String(item.isActive) === active);
  }
  if (method === 'DELETE' && /^\/api\/manufacturing\/boms\/[^/]+$/.test(path)) return null;
  if (method === 'POST' && /^\/api\/manufacturing\/boms\/[^/]+\/(activate|deactivate)$/.test(path)) return null;
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
const command = (id: string) => id === 'more' ? screen.getByRole('button', { name: 'Diğer işlemler' })
  : screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = () => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === '/api/manufacturing/boms');
const writes = () => calls.filter((call) => call.method !== 'GET');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
const rowOf = (text: string) => screen.getByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }).closest('tr')!;
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name }, T);
};
const closeMenu = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
const menuNames = async () => {
  fireEvent.click(command('more'));
  await screen.findAllByRole('menuitem', {}, T);
  const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
  closeMenu();
  return names;
};
const select = async (name: string) => {
  fireEvent.click(await cell(name));
  await waitFor(() => expect(rowOf(name).getAttribute('aria-selected') === 'true' || rowOf(name).classList.contains('is-selected')
    || rowOf(name).getAttribute('aria-current') === 'true').toBe(true), T);
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Tanımlı reçeteler standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('lists every recipe without a status filter; content, usage and status columns', async () => {
    expect(standard.definition.template).toEqual({ name: 'list' });
    expect(standard.definition.components.find((component) => component.id === 'liste')?.props?.columns).toHaveLength(8);
    setup();
    await cell('Salça reçetesi');
    expect(gets().length).toBeGreaterThan(0);
    expect(query(gets()[0].url).get('isActive') ?? '').toBe('');
    expect(within(rowOf('Salça reçetesi')).getByText('RC-014')).toBeTruthy();
    expect(within(rowOf('Salça reçetesi')).getByText('Aktif')).toBeTruthy();
    expect(within(rowOf('Eski sos reçetesi')).getByText('Pasif')).toBeTruthy();
    expect(rowOf('Ketçap reçetesi').textContent).toContain('4');
  });

  it('the Durum selection filters the list with isActive', async () => {
    setup();
    await cell('Salça reçetesi');
    const before = gets().length;
    fireEvent.change(document.getElementById('page-input-durumSecimi') as HTMLSelectElement, { target: { value: 'false' } });
    await waitFor(() => expect(gets().length).toBeGreaterThan(before), T);
    expect(query(gets().at(-1)!.url).get('isActive')).toBe('false');
    await waitFor(() => expect(screen.queryByText('Salça reçetesi', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' })).toBeNull(), T);
    expect(await cell('Eski sos reçetesi')).toBeTruthy();
  });

  it('Aç opens the document with id; Yeni opens a blank document', async () => {
    setup();
    await select('Ketçap reçetesi');
    await ready('open');
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'manufacturing-recipe-document', params: { id: B2 } });
    fireEvent.click(command('new'));
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1]).toMatchObject({ page: 'manufacturing-recipe-document' });
    expect(navigations[1].params).toEqual({});
  });

  it('Sil is disabled for a recipe used by orders', async () => {
    setup();
    await select('Salça reçetesi');
    const item = await menuItem(/^Sil/);
    expect(item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true').toBe(true);
    closeMenu();
  });

  it('Sil asks with the code and name, then deletes and refreshes the list', async () => {
    setup();
    await select('Ketçap reçetesi');
    const lists = gets().length;
    const item = await menuItem(/^Sil/);
    expect(item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true').toBe(false);
    fireEvent.click(item);
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('RC-009 · Ketçap reçetesi reçetesi kalıcı olarak silinecek');
    expect(writes()).toEqual([]);
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'DELETE', url: `/api/manufacturing/boms/${B2}` });
    expect(await screen.findByText(/Ürün reçetesi silindi/, {}, T)).toBeTruthy();
    await waitFor(() => expect(gets().length).toBeGreaterThan(lists), T);
  });

  it('İşlemler offers Pasife al for an active and Etkinleştir for a passive recipe', async () => {
    setup();
    await select('Ketçap reçetesi');
    let names = await menuNames();
    expect(names.some((name) => name.includes('Pasife al'))).toBe(true);
    expect(names.some((name) => name.includes('Etkinleştir'))).toBe(false);
    fireEvent.click(await menuItem(/Pasife al/));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/manufacturing/boms/${B2}/deactivate` });
    expect(await screen.findByText(/Ürün reçetesi pasife alındı/, {}, T)).toBeTruthy();

    await select('Eski sos reçetesi');
    names = await menuNames();
    expect(names.some((name) => name.includes('Etkinleştir'))).toBe(true);
    expect(names.some((name) => name.includes('Pasife al'))).toBe(false);
    fireEvent.click(await menuItem(/Etkinleştir/));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toMatchObject({ method: 'POST', url: `/api/manufacturing/boms/${B3}/activate` });
  });
});
