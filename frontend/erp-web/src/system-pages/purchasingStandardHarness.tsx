import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, type Mock } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { api } from '../erpApi';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';

// Shared harness of the purchasing standard tests: the standard JSON is drawn by the real runtime and `api` (mocked by the
// test file with `vi.mock('../erpApi', () => ({ api: vi.fn() }))`) answers from the test's responder.

export type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
export type Standard = { title: string; version: number; definition: Definition };
export type Call = { url: string; method: string; body?: string };
export type Responder = (path: string, method: string, url: string, body: unknown) => unknown;

export const T = { timeout: 10000 };
export const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;
export const page = <R,>(items: R[], totalCount = items.length) => ({ items, page: 1, pageSize: 25, totalCount });

export const loadStandard = (key: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${key}.json`), 'utf8')) as Standard;

export function createHarness(key: string, catalog: { operations: { name: string }[] }) {
  const standard = loadStandard(key);
  const state = { calls: [] as Call[], navigations: [] as WorkspaceOpenRequest[] };
  const onNavigate = (event: Event) => { state.navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

  function setup(respond: Responder, options: { role?: string; params?: Record<string, string> } = {}) {
    if (options.params) setPageParams(key, options.params);
    (api as unknown as Mock).mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
      if (endpoint === `/api/system-pages/${key}/published`) {
        return { id: 'sp', code: `@${key}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
          screenKey: key, source: 'standard', standardVersion: standard.version, definitionJson: JSON.stringify(standard.definition) };
      }
      if (endpoint === '/api/custom-pages/erp-operations') return catalog;
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      state.calls.push({ url: endpoint, method, body });
      const result = respond(endpoint.split('?')[0], method, endpoint, body ? JSON.parse(body) : undefined);
      if (result === undefined) throw new Error(`unexpected ${method} ${endpoint}`);
      return result;
    });
    return render(
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={key} token={jwt(options.role ?? 'TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
        <ConfirmDialogHost />
      </CommandProvider>,
    );
  }

  const before = () => {
    state.calls = []; state.navigations = []; (api as unknown as Mock).mockReset(); localStorage.clear();
    window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
  };
  const after = (pages: string[] = []) => {
    for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
    cleanup();
    window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
    for (const target of [key, ...pages]) setPageParams(target, {});
  };

  const gets = (path: string) => state.calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
  const writes = () => state.calls.filter((call) => call.method !== 'GET');
  const bodyOf = (call: Call) => JSON.parse(call.body ?? 'null') as Record<string, unknown>;
  const toolbar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
  const command = (id: string) => toolbar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
  const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
  /** The first grid cell (or cell part) showing `text`; a RegExp also finds a value combined with another in one cell. */
  const cell = async (text: string | RegExp) => (await screen.findAllByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T))[0];
  const row = async (text: string | RegExp) => (await cell(text)).closest('tr') as HTMLElement;
  const select = async (text: string | RegExp) => { fireEvent.click(await cell(text)); };
  const menuItem = async (name: RegExp) => {
    fireEvent.click(command('more'));
    return screen.findByRole('menuitem', { name }, T);
  };
  const settle = (ms = 50) => act(() => new Promise((done) => setTimeout(done, ms)));
  /** Answers the prompt / confirm dialog: types `text` (if given) and presses the button named `confirm`. */
  const answer = async (confirm: RegExp | string, text?: string) => {
    const dialog = await screen.findByRole('alertdialog', {}, T);
    if (text !== undefined) fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: text } });
    fireEvent.click(within(dialog).getByRole('button', { name: confirm }));
    return dialog;
  };
  const usesOnlyCatalog = () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  };

  return { standard, state, setup, before, after, gets, writes, bodyOf, command, ready, cell, row, select, menuItem, settle, answer, usesOnlyCatalog };
}
