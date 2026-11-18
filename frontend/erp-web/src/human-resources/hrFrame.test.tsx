import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import HumanResourcesPage from '../HumanResourcesPage';
import { hrStatusLabel, hrStatusTone } from './hrStatus';
import { commandReason } from '../action-bar/commandReason';

const employee = (id: string, code: string, fullName: string, status: string) => ({
  id, personnelCode: code, fullName, department: 'Üretim', jobTitle: 'Operatör', employmentCategory: null, hireDate: '2024-01-01',
  terminationDate: null, status, userId: null, managerEmployeeId: null, rowVersion: 'AA==', customFields: [],
});
const employees = [employee('e1', 'P-001', 'Ayşe Demir', 'Active'), employee('e2', 'P-002', 'Mehmet Kaya', 'OnLeave')];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/hr/employees/') return employees;
  if (path === '/api/hr/leave-requests/')
    return [
      { id: 'l1', employeeId: 'e2', employee: 'Mehmet Kaya', leaveType: 'Annual', startDate: '2026-11-16', endDate: '2026-11-20', requestedDays: 5,
        note: null, status: 'Requested', requestedByUserId: 'other', reviewedByUserId: null, createdAt: '2026-11-10', reviewedAt: null, reviewNote: null,
        canCancel: true, rowVersion: 'AA==' },
    ];
  if (path === '/api/hr/payroll/compensation/capabilities') return { canView: false, canChange: false, canApprove: false };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  // No published screen views: the page keeps its default columns.
  authenticatedFetch: vi.fn(async (url: string) =>
    url.startsWith('/api/screen-views/')
      ? new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const command = (id: string) =>
  screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';

describe('İnsan kaynakları frame', () => {
  it('moves the tab create button to Yeni (F2) and shows statuses as tags', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
    const cell = await screen.findByText('Mehmet Kaya');
    const row = cell.closest('tr')!;
    // OnLeave is translated now (was shown raw).
    expect(within(row).getByText('İzinde').className).toContain('nx-status-tag is-warn');
    expect(screen.queryByRole('button', { name: 'Personel ekle' })).toBeNull();
    await waitFor(() => expect(enabled('new')).toBe(true));
    fireEvent.click(command('new'));
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeTruthy());
  });

  it('a user without admin role has no Yeni on Personel', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantUser" />);
    await screen.findByText('Ayşe Demir');
    await waitFor(() => expect(enabled('refresh')).toBe(true));
    expect(command('new')).toBeNull();
  });
});

describe('İnsan kaynakları lists (list type)', () => {
  const menu = () => {
    fireEvent.click(command('more'));
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
    fireEvent.click(command('more'));
    return items;
  };
  const reason = (id: string) => commandReason(command(id)) ?? '';

  it('Personel: single click selects and shows the panel; no Düzenle buttons; Aç opens the edit form', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
    const cell = await screen.findByText('Ayşe Demir');
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    await waitFor(() => expect(reason('open')).toBe('Önce bir kayıt seçin'));
    fireEvent.click(cell);
    const panel = await screen.findByRole('complementary', { name: 'Personel özeti' });
    expect(within(panel).getByText('P-001')).toBeTruthy();
    expect(reason('delete')).toBe('Personel kaydı silinemez; durumunu düzenleme formundan değiştirin.');
    fireEvent.click(command('open'));
    expect(await screen.findByText('Personel bilgilerini düzenle')).toBeTruthy();
  });

  it('Personel (bulk edit on): double-clicking an editable cell only edits it, the form does not open', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
    const cell = (await screen.findByText('P-001')).closest('td')!;
    expect(cell.className).toContain('advanced-grid-editable');
    fireEvent.doubleClick(cell);
    expect(await within(cell).findByRole('textbox')).toBeTruthy();
    expect(screen.queryByText('Personel bilgilerini düzenle')).toBeNull();
  });

  it('İzinler: the row menu actions are in İşlemler; the create form gives way to the panel', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
    await screen.findByText('Ayşe Demir');
    fireEvent.click(screen.getByRole('tab', { name: /İzinler/ }));
    const row = (await screen.findAllByText('Mehmet Kaya')).find((node) => node.closest('tr'))!;
    expect(document.getElementById('hr-leave-create')).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByRole('complementary', { name: 'İzin talebi özeti' })).toBeTruthy();
    expect(document.getElementById('hr-leave-create')).toBeNull();
    await waitFor(() => expect(menu()).toEqual(['Onayla', 'Reddet', 'İptal et', 'CSV olarak dışa aktar']));
    expect(reason('delete')).toBe("İzin talebi silinemez; İşlemler'den iptal edin.");
    fireEvent.click(command('new'));
    await waitFor(() => expect(document.getElementById('hr-leave-create')).toBeTruthy());
  });

  it('İzinler: selecting a row while the create form holds a draft says so in the panel', async () => {
    renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
    await screen.findByText('Ayşe Demir');
    fireEvent.click(screen.getByRole('tab', { name: /İzinler/ }));
    const row = (await screen.findAllByText('Mehmet Kaya')).find((node) => node.closest('tr'))!;
    const form = document.getElementById('hr-leave-create')!;
    fireEvent.change(within(form).getByRole('combobox', { name: 'İzin türü' }), { target: { value: 'Health' } });
    fireEvent.click(row);
    const panel = await screen.findByRole('complementary', { name: 'İzin talebi özeti' });
    expect(within(panel).getByText('Kaydedilmemiş izin talebi var — Yeni (F2)')).toBeTruthy();
    // The draft is kept: Yeni brings the form back with the changed value.
    fireEvent.click(command('new'));
    await waitFor(() => expect(document.getElementById('hr-leave-create')).toBeTruthy());
    expect((within(document.getElementById('hr-leave-create')!).getByRole('combobox', { name: 'İzin türü' }) as HTMLSelectElement).value).toBe('Health');
  });
});

describe('İK status helpers', () => {
  it('labels and tones', () => {
    expect(hrStatusLabel('OnLeave', false)).toBe('İzinde');
    expect(hrStatusLabel('OnLeave', true)).toBe('On leave');
    expect(hrStatusTone('Requested')).toBe('warn');
    expect(hrStatusTone('Rejected')).toBe('bad');
    expect(hrStatusTone('Terminated')).toBe('off');
  });
  it('the new label has an English entry', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    expect(localizedUiText('İzinde')).not.toBe('İzinde');
  });
});
