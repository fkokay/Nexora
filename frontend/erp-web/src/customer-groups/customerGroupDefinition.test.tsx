import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { CustomerGroupsPage } from '../CustomerGroupsPage';
import { commandReason } from '../action-bar/commandReason';
import { CUSTOMER_GROUPS_CHANGED_EVENT } from './customerGroupsEvents';

// Cari Grupları as a definition screen (mockup 04 "2 · Tanım ekranı"): the group list (Kod, Ad, Durum) on the left,
// the selected group's form (Kod *, Ad *) on the right; the bar offers Yeni, Kaydet and Sil.

type Group = { id: string; code: string; name: string; isActive: boolean };
let groups: Group[] = [];
let conflicts: Record<string, string> = {};

function respond(url: string, init?: RequestInit): Response {
  const path = url.split('?')[0];
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const conflict = conflicts[`${method} ${path}`];
  if (conflict) return json({ error: conflict }, 409);
  if (path === '/api/customer-groups/' && method === 'POST') {
    const row = { id: 'g-new', code: String(body.code).toUpperCase(), name: body.name, isActive: true };
    groups = [...groups, row];
    return json(row, 201);
  }
  if (path === '/api/customer-groups/') return json(groups);
  const one = path.match(/^\/api\/customer-groups\/([^/]+)$/);
  if (one && method === 'PUT') {
    const row = { ...groups.find((g) => g.id === one[1])!, code: String(body.code).toUpperCase(), name: body.name };
    groups = groups.map((g) => (g.id === row.id ? row : g));
    return json(row);
  }
  if (one && method === 'DELETE') {
    groups = groups.filter((g) => g.id !== one[1]);
    return new Response(null, { status: 204 });
  }
  return json({ items: [], page: 1, pageSize: 50, totalCount: 0 });
}

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: fetchMock,
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  conflicts = {};
  groups = [
    { id: 'g1', code: 'BAY', name: 'Bayiler', isActive: true },
    { id: 'g2', code: 'KUR', name: 'Kurumsal müşteriler', isActive: true },
    { id: 'g3', code: 'ESK', name: 'Eski grup', isActive: false },
  ];
  fetchMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <CustomerGroupsPage token="t" />
      </KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const enabled = (id: string) => command(id)!.getAttribute('aria-disabled') !== 'true';
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const listRegion = () => document.querySelector<HTMLElement>('.nx-def-list .advanced-grid-scroll')!;
const listRows = () => within(listRegion()).getAllByRole('row').slice(1);
const rowOf = (code: string) => listRows().find((row) => row.textContent?.includes(code))!;
const pane = () => document.querySelector<HTMLElement>('.nx-def-pane')!;
const field = (label: RegExp) => within(pane()).getByLabelText(label) as HTMLInputElement;
const calls = (method: string, pattern: RegExp) =>
  fetchMock.mock.calls.filter(([url, , init]) => (init?.method ?? 'GET') === method && pattern.test(String(url).split('?')[0]));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));
async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
}
async function ctrlS() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
  });
  await settle();
}

describe('Cari Grupları definition screen', () => {
  it('lists the groups with Kod, Ad and Durum and loads the selected one into the form', async () => {
    renderPage();
    await settle();
    const headers = within(listRegion()).getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Kod', 'Ad', 'Durum']));
    expect(listRows()).toHaveLength(3);
    expect(within(rowOf('BAY')).getByText('Bayiler')).toBeTruthy();
    expect(within(rowOf('BAY')).getByText('Aktif').className).toContain('is-ok');
    expect(within(rowOf('ESK')).getByText('Pasif').className).toContain('is-off');
    expect(within(pane()).getByText('Bir grup seçin ya da F2 ile yeni grup ekleyin.')).toBeTruthy();
    // The bar of the approved mockup: Yeni and Sil (Kaydet comes with the open form).
    expect(command('new')).toBeTruthy();
    expect(enabled('delete')).toBe(false);
    expect(commandReason(command('delete'))).toBe('Önce bir kayıt seçin');
    expect(command('open')).toBeNull();
    await click(rowOf('KUR'));
    expect(rowOf('KUR').getAttribute('aria-current')).toBe('true');
    expect(field(/^Kod/).value).toBe('KUR');
    expect(field(/^Ad/).value).toBe('Kurumsal müşteriler');
    expect(command('save')).toBeTruthy();
    expect(enabled('save')).toBe(false);
    expect(commandReason(command('save'))).toBe('Kaydedilecek değişiklik yok');
    expect(enabled('delete')).toBe(true);
  });

  it('Yeni opens an empty form and Kaydet POSTs { code, name }', async () => {
    const changed = vi.fn();
    window.addEventListener(CUSTOMER_GROUPS_CHANGED_EVENT, changed);
    renderPage();
    await settle();
    await click(command('new')!);
    expect(field(/^Kod/).value).toBe('');
    fireEvent.change(field(/^Kod/), { target: { value: 'b2b' } });
    fireEvent.change(field(/^Ad/), { target: { value: 'B2B müşteriler' } });
    expect(field(/^Kod/).value).toBe('B2B');
    field(/^Ad/).focus();
    await ctrlS();
    const posts = calls('POST', /^\/api\/customer-groups\/$/);
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({ code: 'B2B', name: 'B2B müşteriler' });
    expect(rowOf('B2B')).toBeTruthy();
    // The form stays open on the saved group.
    expect(rowOf('B2B').getAttribute('aria-current')).toBe('true');
    expect(field(/^Ad/).value).toBe('B2B müşteriler');
    expect(screen.getByRole('status').textContent).toContain('Cari grubu oluşturuldu.');
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(CUSTOMER_GROUPS_CHANGED_EVENT, changed);
  });

  it('editing a group PUTs { code, name } to its id', async () => {
    renderPage();
    await settle();
    await click(rowOf('BAY'));
    fireEvent.change(field(/^Ad/), { target: { value: 'Bayi ağı' } });
    expect(within(pane()).getByText('Önceki: Bayiler')).toBeTruthy();
    expect(enabled('save')).toBe(true);
    expect(commandReason(command('delete'))).toBe('Önce değişiklikleri kaydedin veya vazgeçin');
    await click(command('save')!);
    const puts = calls('PUT', /^\/api\/customer-groups\/g1$/);
    expect(puts).toHaveLength(1);
    expect(bodyOf(puts[0])).toEqual({ code: 'BAY', name: 'Bayi ağı' });
    expect(within(rowOf('BAY')).getByText('Bayi ağı')).toBeTruthy();
    expect(enabled('save')).toBe(false);
  });

  it('a duplicate code (409) is shown in the form and the changes stay', async () => {
    conflicts['PUT /api/customer-groups/g1'] = 'Bu grup kodu bu firmada zaten kullanılıyor.';
    renderPage();
    await settle();
    await click(rowOf('BAY'));
    fireEvent.change(field(/^Kod/), { target: { value: 'KUR' } });
    await click(command('save')!);
    expect(within(pane()).getByText('Bu grup kodu bu firmada zaten kullanılıyor.')).toBeTruthy();
    expect(field(/^Kod/).value).toBe('KUR');
    expect(within(rowOf('BAY')).getByText('Bayiler')).toBeTruthy();
  });

  it('Sil asks first and DELETEs the group; a group in use (409) stays with the reason in the form', async () => {
    renderPage();
    await settle();
    await click(rowOf('ESK'));
    await click(command('delete')!);
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('“Eski grup” grubu silinsin mi?');
    // Vazgeç keeps the group.
    await click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    expect(calls('DELETE', /customer-groups/)).toHaveLength(0);
    expect(listRows()).toHaveLength(3);

    await click(command('delete')!);
    dialog = await screen.findByRole('alertdialog');
    await click(within(dialog).getByRole('button', { name: /^Grubu sil/ }));
    expect(calls('DELETE', /^\/api\/customer-groups\/g3$/)).toHaveLength(1);
    expect(listRows()).toHaveLength(2);
    expect(listRows().some((row) => row.textContent?.includes('ESK'))).toBe(false);
    expect(within(pane()).getByText('Bir grup seçin ya da F2 ile yeni grup ekleyin.')).toBeTruthy();

    const inUse = 'Bu gruba bağlı cari kartları var. Önce bu kartları başka bir gruba taşıyın veya grup alanını boşaltın.';
    conflicts['DELETE /api/customer-groups/g1'] = inUse;
    await click(rowOf('BAY'));
    await click(command('delete')!);
    await click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Grubu sil/ }));
    expect(within(pane()).getByText(inUse)).toBeTruthy();
    expect(rowOf('BAY')).toBeTruthy();
    expect(field(/^Kod/).value).toBe('BAY');
  });
});
