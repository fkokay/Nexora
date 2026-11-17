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

const employee = (id: string, code: string, fullName: string, status: string) => ({
  id, personnelCode: code, fullName, department: 'Üretim', jobTitle: 'Operatör', employmentCategory: null, hireDate: '2024-01-01',
  terminationDate: null, status, userId: null, managerEmployeeId: null, rowVersion: 'AA==', customFields: [],
});
const employees = [employee('e1', 'P-001', 'Ayşe Demir', 'Active'), employee('e2', 'P-002', 'Mehmet Kaya', 'OnLeave')];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/hr/employees/') return employees;
  if (path === '/api/hr/payroll/compensation/capabilities') return { canView: false, canChange: false, canApprove: false };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
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
    expect(enabled('new')).toBe(false);
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
