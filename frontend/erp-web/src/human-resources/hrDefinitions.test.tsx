import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { authenticatedFetch } from '../authApi';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import HumanResourcesPage from '../HumanResourcesPage';

// Characterization tests of the İK tabs that move to the report (04), definition (04-alt) and list types:
// the request URLs and bodies stay as they were before the layout change.

const employee = (id: string, code: string, fullName: string) => ({
  id, personnelCode: code, fullName, department: 'Üretim', jobTitle: 'Operatör', employmentCategory: null, hireDate: '2024-01-01',
  terminationDate: null, status: 'Active', userId: null, managerEmployeeId: null, rowVersion: 'AA==', customFields: [],
});
const approval = { createdByUserId: 'other', approvedByUserId: null, createdAt: '2026-11-01T08:00:00Z', approvedAt: null };
const ruleSet = {
  id: 'r1', taxYear: '2026', effectiveFrom: '2026-01-01', effectiveTo: null, version: 1, rulesJson: '{"parameters":[]}',
  officialSourceUrl: 'https://www.gib.gov.tr/x', status: 'Draft', canApprove: true, rowVersion: 'Ug==', ...approval,
};
const assignment = {
  id: 'wa1', employeeId: 'e1', employee: 'Ayşe Demir', workplaceCode: 'IST-01', effectiveFrom: '2026-11-01', version: 1,
  status: 'PendingApproval', canApprove: true, rowVersion: 'Wg==', ...approval,
};
const calendar = {
  id: 'wc1', workplaceCode: 'IST-01', effectiveFrom: '2026-11-01', version: 2, weeklyMinutesJson: '{"Monday":450}',
  dateOverridesJson: '[]', policyReference: 'POL-1', status: 'PendingApproval', canApprove: true, rowVersion: 'Qw==', ...approval,
};
const override = {
  id: 'eo1', employeeId: 'e1', employee: 'Ayşe Demir', effectiveFrom: '2026-11-10', version: 1, weeklyMinutesJson: '{"Monday":240}',
  dateOverridesJson: '[]', policyReference: 'POL-2', status: 'PendingApproval', canApprove: true, rowVersion: 'Tw==', ...approval,
};
const run = {
  id: 'run1', periodKind: 'CalendarMonth', periodStart: '2026-10-01', periodEnd: '2026-10-31', profileCode: 'TR-4A', status: 'Blocked',
  employeeCount: 2, snapshotSha256: 'abcdef0123456789abcdef', blockersJson: '[]', createdAt: '2026-11-02T08:00:00Z', createdByUserId: 'u',
};

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/hr/employees/') return [employee('e1', 'P-001', 'Ayşe Demir')];
  if (path === '/api/hr/payroll/compensation/capabilities') return { canView: true, canChange: true, canApprove: true };
  if (path === '/api/hr/payroll/rule-sets/') return [ruleSet];
  if (path === '/api/hr/payroll/workplace-assignments/') return [assignment];
  if (path === '/api/hr/payroll/workplace-calendars/') return [calendar];
  if (path === '/api/hr/payroll/employee-calendar-overrides/') return [override];
  if (path === '/api/hr/payroll/runs/') return [run];
  if (path === '/api/hr/period-summary')
    return {
      from: '2026-10-01', to: '2026-10-31', employeesAtPeriodEnd: 12, attendanceRecordCount: 40, employeesWithAttendance: 9,
      workedMinutes: 19230, overtimeMinutes: 125, leaveRequestCount: 3, requestedLeaveDays: 7,
      leaveStatuses: [{ status: 'Approved', requestCount: 2, requestedDays: 5 }, { status: 'Requested', requestCount: 1, requestedDays: 2 }],
    };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return [];
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    url.startsWith('/api/screen-views/')
      ? new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } })
      : url.startsWith('/api/hr/period-summary.csv')
        ? new Response('a;b', { status: 200, headers: { 'Content-Type': 'text/csv' } })
        : new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:x';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.mocked(authenticatedFetch).mockClear();
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
const posts = () =>
  vi.mocked(authenticatedFetch).mock.calls
    .filter(([, , init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([url, , init]) => [String(url), (init as RequestInit).body ? JSON.parse(String((init as RequestInit).body)) : null]);
const gets = () => vi.mocked(authenticatedFetch).mock.calls.map(([url]) => String(url));
async function runMore(label: string) {
  fireEvent.click(command('more'));
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
}
const change = (scope: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
async function pickEmployee(scope: HTMLElement) {
  fireEvent.click(scope.querySelector<HTMLElement>('.searchable-record-trigger')!);
  fireEvent.click((await screen.findAllByRole('option', { name: /Ayşe Demir/ }))[0]);
}
async function openTab(name: RegExp) {
  renderScreen(<HumanResourcesPage token="t" role="TenantAdmin" />);
  await screen.findAllByText('Ayşe Demir');
  fireEvent.click(screen.getByRole('tab', { name }));
}
/** The host of a ModuleRecordForm by its title; on the definition screens Yeni (F2) opens it first. */
async function formOf(title: string) {
  if (!screen.queryByRole('heading', { name: title }) && enabled('new')) fireEvent.click(command('new'));
  const heading = await screen.findByRole('heading', { name: title });
  return heading.closest<HTMLElement>('.hrp-record-form-host')!;
}
const submitForm = (host: HTMLElement) => fireEvent.submit(host.querySelector('form')!);
/** The row of a definition list (not the record pane). */
async function rowOf(text: string, grid: string) {
  const table = await screen.findByRole('table', { name: grid });
  return within(table).getAllByText(text)[0].closest('tr')!;
}

describe('İK request bodies (characterization, layout independent)', () => {
  it('period summary URL', async () => {
    await openTab(/Dönem özeti/);
    change(document.body, 'Başlangıç', '2026-10-01');
    change(document.body, 'Bitiş', '2026-10-31');
    fireEvent.submit(screen.getByLabelText('Başlangıç').closest('form')!);
    await waitFor(() => expect(gets()).toContain('/api/hr/period-summary?from=2026-10-01&to=2026-10-31'));
  });
  it('rule set draft body', async () => {
    await openTab(/Bordro kural setleri/);
    const form = await formOf('Kaynaklı taslak oluştur');
    change(form, 'Vergi yılı', '2027');
    change(form, 'Geçerlilik başlangıcı', '2027-01-01');
    change(form, 'Kaynak URL (HTTPS)', 'https://www.resmigazete.gov.tr/a');
    change(form, 'Kural verisi (JSON)', '{"parameters":[]}');
    submitForm(form);
    await waitFor(() =>
      expect(posts()).toContainEqual([
        '/api/hr/payroll/rule-sets/',
        { taxYear: '2027', effectiveFrom: '2027-01-01', effectiveTo: null, officialSourceUrl: 'https://www.resmigazete.gov.tr/a', rules: { parameters: [] } },
      ]),
    );
  });
  it('workplace assignment, calendar and override bodies', async () => {
    await openTab(/İşyeri ve takvim/);
    let form = await formOf('Yürürlük tarihli işyeri atamaları');
    await pickEmployee(form);
    change(form, 'İşyeri kodu', 'ank-02');
    change(form, 'Yürürlük başlangıcı', '2026-12-01');
    submitForm(form);
    await waitFor(() =>
      expect(posts()).toContainEqual(['/api/hr/payroll/workplace-assignments/', { employeeId: 'e1', workplaceCode: 'ANK-02', effectiveFrom: '2026-12-01' }]),
    );
    const calendarTab = screen.queryByRole('tab', { name: /İşyeri takvimleri/ });
    if (calendarTab) fireEvent.click(calendarTab);
    form = await formOf('İşyeri çalışma takvimleri');
    change(form, 'İşyeri kodu', 'ist-02');
    change(form, 'Yürürlük başlangıcı', '2027-01-01');
    change(form, 'Politika belge/ref.', 'POL-9');
    change(form, 'Haftalık beklenen dakika JSON', '{"Monday":480}');
    change(form, 'Tarih istisnaları JSON', '[]');
    submitForm(form);
    await waitFor(() =>
      expect(posts()).toContainEqual([
        '/api/hr/payroll/workplace-calendars/',
        { workplaceCode: 'IST-02', effectiveFrom: '2027-01-01', weeklyMinutesJson: '{"Monday":480}', dateOverridesJson: '[]', policyReference: 'POL-9' },
      ]),
    );
    const overrideTab = screen.queryByRole('tab', { name: /Personel istisnaları/ });
    if (overrideTab) fireEvent.click(overrideTab);
    form = await formOf('Kişi bazlı takvim istisnaları');
    await pickEmployee(form);
    change(form, 'Yürürlük başlangıcı', '2026-12-15');
    change(form, 'Politika belge/ref.', 'POL-3');
    change(form, 'Haftalık beklenen dakika JSON', '{"Friday":0}');
    change(form, 'Tarih istisnaları JSON', '[]');
    submitForm(form);
    await waitFor(() =>
      expect(posts()).toContainEqual([
        '/api/hr/payroll/employee-calendar-overrides/',
        { employeeId: 'e1', effectiveFrom: '2026-12-15', weeklyMinutesJson: '{"Friday":0}', dateOverridesJson: '[]', policyReference: 'POL-3' },
      ]),
    );
  });
});

describe('İK Dönem özeti (report 04)', () => {
  it('runs the summary with the period and downloads the CSV from Excel', async () => {
    await openTab(/Dönem özeti/);
    change(document.body, 'Başlangıç', '2026-10-01');
    change(document.body, 'Bitiş', '2026-10-31');
    fireEvent.click(screen.getByRole('button', { name: /Raporu çalıştır/ }));
    await screen.findByText('12');
    expect(gets()).toContain('/api/hr/period-summary?from=2026-10-01&to=2026-10-31');
    // Parameter changes do not reload (each load is audited); the result says it is stale instead.
    const before = gets().filter((url) => url.startsWith('/api/hr/period-summary?')).length;
    change(document.body, 'Bitiş', '2026-10-30');
    expect(gets().filter((url) => url.startsWith('/api/hr/period-summary?')).length).toBe(before);
    expect(screen.getByText(/güncel değil/)).toBeTruthy();
    // F9 runs it again.
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(gets()).toContain('/api/hr/period-summary?from=2026-10-01&to=2026-10-30'));
    expect(enabled('new')).toBe(false);
    expect(enabled('save')).toBe(false);
    await waitFor(() => expect(enabled('export')).toBe(true));
    fireEvent.click(command('export'));
    await waitFor(() => expect(gets()).toContain('/api/hr/period-summary.csv?from=2026-10-01&to=2026-10-30'));
  });
});

describe.skip('İK Bordro kural setleri (definition 04-alt)', () => {
  it('shows the record read-only and approves from İşlemler', async () => {
    await openTab(/Bordro kural setleri/);
    const row = await rowOf('2026', 'Kural seti kayıtları');
    fireEvent.click(row);
    const record = await screen.findByRole('region', { name: 'Kural seti kaydı' });
    expect(within(record).getByText('{"parameters":[]}')).toBeTruthy();
    await runMore('Onayla');
    await waitFor(() => expect(posts()).toContainEqual(['/api/hr/payroll/rule-sets/r1/approve', { rowVersion: 'Ug==' }]));
  });
});

describe.skip('İK İşyeri ve takvim (three definitions)', () => {
  it('workplace assignment: approve and reject from İşlemler', async () => {
    await openTab(/İşyeri ve takvim/);
    fireEvent.click(await rowOf('IST-01', 'İşyeri ataması kayıtları'));
    await runMore('Onayla');
    await waitFor(() => expect(posts()).toContainEqual(['/api/hr/payroll/workplace-assignments/wa1/approve', { rowVersion: 'Wg==' }]));
    fireEvent.click(await rowOf('IST-01', 'İşyeri ataması kayıtları'));
    await runMore('Reddet');
    await waitFor(() => expect(posts()).toContainEqual(['/api/hr/payroll/workplace-assignments/wa1/reject', { rowVersion: 'Wg==' }]));
  });

  it('workplace calendar and employee override: approve / reject from İşlemler', async () => {
    await openTab(/İşyeri ve takvim/);
    fireEvent.click(await screen.findByRole('tab', { name: /İşyeri takvimleri/ }));
    fireEvent.click(await rowOf('IST-01', 'İşyeri takvimi kayıtları'));
    await runMore('Onayla');
    await waitFor(() => expect(posts()).toContainEqual(['/api/hr/payroll/workplace-calendars/wc1/approve', { rowVersion: 'Qw==' }]));
    fireEvent.click(await screen.findByRole('tab', { name: /Personel istisnaları/ }));
    fireEvent.click(await rowOf('Ayşe Demir', 'Personel takvim istisnası kayıtları'));
    await runMore('Reddet');
    await waitFor(() => expect(posts()).toContainEqual(['/api/hr/payroll/employee-calendar-overrides/eo1/reject', { rowVersion: 'Tw==' }]));
  });
});

describe.skip('İK Bordro taslakları (list type)', () => {
  it('row actions are in İşlemler for the current draft', async () => {
    await openTab(/Bordro taslakları/);
    const table = await screen.findByRole('table', { name: 'Bordro taslağı kayıtları' });
    fireEvent.click(within(table).getByText('TR-4A').closest('tr')!);
    await runMore('Girdileri incele');
    await waitFor(() => expect(gets()).toContain('/api/hr/payroll/runs/run1'));
    await runMore('Hesap önizlemesi');
    await waitFor(() => expect(posts().map(([url]) => url)).toContain('/api/hr/payroll/runs/run1/component-preview'));
    await runMore('Formül taslağını kaydet');
    await waitFor(() => expect(posts().map(([url]) => url)).toContain('/api/hr/payroll/runs/run1/calculate'));
    await runMore('Kayıtlı sonuçlar');
    await waitFor(() => expect(gets()).toContain('/api/hr/payroll/runs/run1/calculations'));
    expect(screen.getByText(/Gösterilen/)).toBeTruthy();
  });
});
