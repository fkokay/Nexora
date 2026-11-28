import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { commandReason } from '../action-bar/commandReason';
import { CommandProvider } from '../commands/CommandProvider';
import ReportsPage from '../ReportsPage';
import { KeepAliveViews } from '../WorkspaceComponents';

const catalog = [
  {
    code: 'customers',
    label: 'Cari hesaplar',
    columns: [
      { code: 'code', label: 'Cari kodu', dataType: 'text' },
      { code: 'name', label: 'Cari adı', dataType: 'text' },
    ],
    aggregates: [{ code: 'count', label: 'Kayıt sayısı' }],
  },
];
const savedReport = {
  id: 'r1',
  name: 'Aktif cariler',
  source: 'customers',
  kind: 'Report',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  definitionRevision: 1,
  definition: { source: 'customers', columns: ['code', 'name'], filters: [], sortBy: 'code', descending: false, page: 1, pageSize: 50 },
};
const runResult = { source: 'customers', columns: [], rows: [{ code: 'C1', name: 'Ali' }], page: 1, pageSize: 50, totalCount: 1 };

let calls: { url: string; method: string }[] = [];

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  calls = [];
  // The result grid measures its rows.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url === '/api/reports/catalog') return respond(catalog);
    if (url.startsWith('/api/reports/?kind=')) return respond([savedReport]);
    if (url === '/api/reports/companies' || url === '/api/reports/sql-schema') return respond([]);
    if (url.endsWith('/history')) return respond([]);
    if (url.endsWith('/run')) return respond(runResult);
    if (url === '/api/reports/' && method === 'POST') return respond({ ...savedReport, id: 'r2', name: 'Yeni rapor' });
    return respond(null, 204);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(role = 'TenantAdmin', onNavigate = vi.fn()) {
  render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="crumb">Ana Sayfa</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="reports" openKeys={['reports']}>
          <ReportsPage token="t" role={role} onNavigate={onNavigate} />
        </KeepAliveViews>
      </ActionBarSlotProvider>
    </CommandProvider>,
  );
  return { onNavigate };
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const button = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const loaded = () => waitFor(() => expect(screen.getByText(/1 kayıtlı rapor/)).toBeTruthy());

describe('ReportsPage action bar', () => {
  it('sits under the report title and the header no longer repeats the commands', async () => {
    setup();
    await loaded();
    const slot = document.querySelector('[data-nx-action-bar-slot]')!;
    expect(slot.contains(bar())).toBe(true);
    expect(document.querySelector('.report-topbar')!.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /CSV indir/ })).toBeNull();
  });

  it('Kaydet explains why it is disabled, then saves the report', async () => {
    setup();
    await loaded();
    expect(isDisabled(button('save'))).toBe(true);
    await waitFor(() => expect(commandReason(button('save'))).toBe('Önce rapor adını girin'));
    fireEvent.change(screen.getByPlaceholderText(/Aktif müşteriler/), { target: { value: 'Yeni rapor' } });
    await waitFor(() => expect(isDisabled(button('save'))).toBe(false));
    fireEvent.click(button('save'));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/reports/' && c.method === 'POST')).toBe(true));
  });

  it('runs the report from Yenile, the İşlemler menu and F9; Excel needs a result', async () => {
    setup();
    await loaded();
    // The page may still be loading ("Yükleniyor…") right after the saved-report count shows.
    await waitFor(() => expect(commandReason(button('export'))).toBe('Önce raporu çalıştırın'));
    fireEvent.click(button('refresh'));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/reports/run')).toHaveLength(1));
    await waitFor(() => expect(isDisabled(button('export'))).toBe(false));
    fireEvent.click(button('more'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Raporu çalıştır/ }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/reports/run')).toHaveLength(2));
    await waitFor(() => expect(isDisabled(button('refresh'))).toBe(false));
    act(() => {
      fireEvent.keyDown(window, { key: 'F9' });
    });
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/reports/run')).toHaveLength(3));
  });

  it('Sil works on the opened saved report and stays admin-only', async () => {
    setup();
    await loaded();
    await waitFor(() => expect(commandReason(button('delete'))).toBe('Önce kayıtlı bir rapor açın'));
    fireEvent.click(screen.getAllByRole('button', { name: /Aktif cariler/ })[0]);
    await waitFor(() => expect(isDisabled(button('delete'))).toBe(false));
    expect(isDisabled(button('print'))).toBe(true);
    expect(isDisabled(button('open'))).toBe(true);
  });

  it('a developer cannot delete; AI ile keşfet is in İşlemler', async () => {
    const { onNavigate } = setup('TenantDeveloper');
    await loaded();
    await waitFor(() => expect(commandReason(button('delete'))).toBe('Silmek için yönetici yetkisi gerekir'));
    fireEvent.click(button('more'));
    fireEvent.click(screen.getByRole('menuitem', { name: /AI ile keşfet/ }));
    expect(onNavigate).toHaveBeenCalledWith('erp-assistant');
  });

  it('a viewer cannot start or save a design', async () => {
    setup('Viewer');
    await loaded();
    await waitFor(() => expect(commandReason(button('new'))).toBe('Rapor tasarlama yetkiniz yok'));
    await waitFor(() => expect(commandReason(button('save'))).toBe('Rapor tasarlama yetkiniz yok'));
  });
});
