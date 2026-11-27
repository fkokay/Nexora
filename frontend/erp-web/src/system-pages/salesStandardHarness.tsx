import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, type Mock } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';

// Satış standart testlerinin ortak düzeneği: standart tanım (Standards/<key>.json) gerçek çalışma zamanıyla çizilir,
// `api` sahte yanıtlar döner, yazmalar ve gezinmeler kaydedilir. Her test dosyası `vi.mock('../erpApi')` yapar.

export type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
export type Call = { url: string; method: string; body?: string };
export type Catalog = { operations: { name: string }[] };

export const T = { timeout: 10000 };
export const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;
export const page = <R,>(items: R[], extra: Record<string, unknown> = {}) => ({ items, page: 1, pageSize: 25, totalCount: items.length, ...extra });
export const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

// Vitest runs from frontend/erp-web.
export function readStandard(key: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${key}.json`), 'utf8')) as
    { screenKey: string; title: string; version: number; stage: string; definition: Definition };
}

export function salesHarness(key: string, api: Mock, catalog: Catalog, respond: (url: string, method: string, body?: string) => unknown) {
  const standard = readStandard(key);
  const state = { calls: [] as Call[], navigations: [] as WorkspaceOpenRequest[] };
  const onNavigate = (event: Event) => { state.navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

  const setup = (role = 'TenantAdmin') => {
    api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
      if (endpoint === `/api/system-pages/${key}/published`) {
        return { id: 'sp', code: `@${key}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
          screenKey: key, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
      }
      if (endpoint === '/api/custom-pages/erp-operations') return { operations: catalog.operations };
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      state.calls.push({ url: endpoint, method, body });
      return respond(endpoint, method, body);
    });
    return render(
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={key} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
        <ConfirmDialogHost />
      </CommandProvider>,
    );
  };

  const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
  const gets = (path: string) => state.calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
  const writes = () => state.calls.filter((call) => call.method !== 'GET');
  const lastGet = (path: string) => gets(path).at(-1)!;
  const menuItems = () => {
    fireEvent.click(command('more'));
    const items = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    return items;
  };
  /**
   * İşlemler menüsünün öğeleri, `path` okuması geldikten ve sayfa durulduktan sonra. Menüyü açıp kapatmak DOM'u değiştirir:
   * `waitFor` içinde çağrılırsa gözlemci her değişiklikte yeniden çalıştırır ve test kilitlenir.
   */
  const menuAfter = async (path: string) => {
    await waitFor(() => expect(gets(path).length).toBeGreaterThan(0), T);
    await act(async () => { await new Promise((done) => setTimeout(done, 150)); });
    return menuItems();
  };
  const menuItem = async (name: RegExp) => {
    fireEvent.click(command('more'));
    return screen.findByRole('menuitem', { name }, T);
  };
  /**
   * Liste satırını tek tıkla seçer (detay sorguları seçili satıra bağlıdır). Yavaş makinede tıklama, liste yeniden çizilirken
   * eski satıra düşebilir; satır seçili görünene kadar bekler, seçili değilse yeniden tıklar (seçili satıra tıklamak seçimi kaldırır).
   */
  const selectRow = async (code: string) => {
    const cell = () => screen.getByText(code, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' });
    await screen.findByText(code, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    await waitFor(() => {
      const row = cell().closest('tr');
      if (!row?.classList.contains('is-selected')) fireEvent.click(cell());
      expect(cell().closest('tr')?.classList.contains('is-selected')).toBe(true);
    }, T);
  };
  const dialog = (name: RegExp) => screen.findByRole('dialog', { name }, T);
  /** Onay penceresinin onay düğmesi (son düğme). */
  const confirm = async (contains?: string) => {
    const prompt = await screen.findByRole('alertdialog', {}, T);
    if (contains) expect(prompt.textContent).toContain(contains);
    fireEvent.click(within(prompt).getAllByRole('button').at(-1)!);
  };
  const waitWrites = (count: number) => waitFor(() => expect(writes()).toHaveLength(count), T);

  return {
    standard, state, setup, command, gets, writes, lastGet, menuItems, menuAfter, menuItem, selectRow, dialog, confirm, waitWrites,
    listen: () => window.addEventListener(OPEN_PAGE_EVENT, onNavigate),
    reset: () => {
      for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
      window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
      state.calls = []; state.navigations = [];
    },
  };
}
