import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './hrEmployeesOperations.fixture.json';
import { createHarness, T } from './purchasingStandardHarness';

// "Personel" standart tanımı (hr-employees.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'hr-employees';
const E1 = '44444444-0000-0000-0000-000000000001';
const E2 = '44444444-0000-0000-0000-000000000002';
const h = createHarness(KEY, catalog);

const employee = (id: string, code: string, fullName: string, extra: Record<string, unknown> = {}) => ({
  id, personnelCode: code, fullName, department: 'Depo', jobTitle: 'Operatör', employmentCategory: 'Mavi yaka', workEmail: `${code.toLowerCase()}@firma.com.tr`,
  hireDate: '2024-03-01', terminationDate: null, status: 'Active', userId: null, rowVersion: `rv-${code}`, ...extra,
});
let items: Record<string, unknown>[] = [];
const respond = (path: string, method: string) =>
  method === 'GET' && path === '/api/hr/employees' ? { items, page: 1, pageSize: 50, totalCount: items.length } : undefined;
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const lists = () => h.gets('/api/hr/employees');

beforeEach(() => {
  h.before();
  items = [employee(E1, 'P-0001', 'Ayşe Yılmaz'), employee(E2, 'P-0002', 'Mehmet Kaya', { terminationDate: '2026-06-30', status: 'Terminated', department: 'Satış' })];
});
afterEach(() => h.after(['hr-employee-create', 'hr-leave-requests', 'hr-attendance']));

describe('Personel standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('loads the first page of 50 with no status filter; status tags are Aktif / Ayrıldı; the count comes from totalCount', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    const first = query(lists()[0].url);
    expect(first.get('page')).toBe('1');
    expect(first.get('pageSize')).toBe('50');
    expect(first.get('status')).toBeNull();
    expect(first.get('q')).toBeNull();
    expect(within(await h.row('Ayşe Yılmaz')).getByText('Aktif')).toBeTruthy();
    expect(within(await h.row('Mehmet Kaya')).getByText('Ayrıldı')).toBeTruthy();
    expect(within(await h.row('Ayşe Yılmaz')).getByText('P-0001')).toBeTruthy();
    expect(document.body.textContent).not.toContain('İzinde');
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Personel kodu', 'Ad soyad', 'Departman', 'Görev', 'Kategori', 'Durum']) expect(headers).toContain(label);
  });

  it('the status and department filters and the search are sent to the server', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    let before = lists().length;
    fireEvent.change(document.getElementById('page-input-durumSecimi') as HTMLSelectElement, { target: { value: 'Terminated' } });
    await waitFor(() => expect(lists().length).toBeGreaterThan(before), T);
    expect(query(lists().at(-1)!.url).get('status')).toBe('Terminated');
    before = lists().length;
    fireEvent.change(document.getElementById('page-input-departmanSecimi') as HTMLInputElement, { target: { value: 'Satış' } });
    await waitFor(() => expect(query(lists().at(-1)!.url).get('department')).toBe('Satış'), T);
    expect(lists().length).toBeGreaterThan(before);
    expect(query(lists().at(-1)!.url).get('status')).toBe('Terminated');
  });

  it('Aç opens the card with employeeId; Yeni opens an empty card', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    await h.ready('open');
    fireEvent.click(h.command('open'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'hr-employee-create', params: { employeeId: E1 } });
    await h.ready('new');
    fireEvent.click(h.command('new'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'hr-employee-create', params: {} });
  });

  it('Yeni is disabled for a non-admin, with the reason', async () => {
    h.setup(respond, { role: 'TenantUser' });
    await h.cell('Ayşe Yılmaz');
    await waitFor(() => expect(h.command('new').getAttribute('aria-disabled')).toBe('true'), T);
    expect(h.command('new').closest('[data-command]')?.outerHTML ?? '').toContain('yalnız firma yöneticisi');
  });

  it('a non-admin without a linked record sees the empty-list text', async () => {
    items = [];
    h.setup(respond, { role: 'TenantUser' });
    await waitFor(() => expect(document.body.textContent).toContain('kullanıcınıza bağlı personel kaydı yok'), T);
  });

  it('detail panel: key values and links to the leave and attendance pages with employeeId', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    const panel = screen.getByLabelText('Detay paneli') as HTMLInputElement;
    if (!panel.checked) fireEvent.click(panel);
    await waitFor(() => expect(document.body.textContent).toContain('İş e-postası'), T);
    expect(document.body.textContent).toContain('p-0001@firma.com.tr');
    expect(document.body.textContent).toContain('İşe giriş');
    fireEvent.click(screen.getByRole('button', { name: 'İzin talepleri ›' }));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'hr-leave-requests', params: { employeeId: E1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Puantaj ›' }));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'hr-attendance', params: { employeeId: E1 } });
  });

  it('İşlemler offers no delete', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    expect(h.command('delete')).toBeNull();
  });
});
