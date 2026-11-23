import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './hrLeaveRequestsOperations.fixture.json';
import { createHarness, T } from './purchasingStandardHarness';

// "İzin talepleri" standart tanımı (hr-leave-requests.json): bekleyen talepler varsayılan süzgeçtir; talep penceresi, sabit
// gövdeli onay / ret (rowVersion seçili satırdan) ve talep edenin iptali sınanır.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'hr-leave-requests';
const L1 = '66666666-0000-0000-0000-000000000001';
const L2 = '66666666-0000-0000-0000-000000000002';
const L3 = '66666666-0000-0000-0000-000000000003';
const E1 = '44444444-0000-0000-0000-000000000001';
const h = createHarness(KEY, catalog);

const leave = (id: string, employee: string, extra: Record<string, unknown> = {}) => ({
  id, employeeId: E1, employee, leaveType: 'Annual', startDate: '2026-12-01', endDate: '2026-12-03', requestedDays: 3, note: 'Aile ziyareti',
  status: 'Requested', requestedByUserId: 'u2', reviewedByUserId: null, createdAt: '2026-11-20T08:00:00Z', reviewedAt: null, reviewNote: null,
  rowVersion: `rv-${id.slice(-1)}`, canCancel: false, department: 'Depo', canReview: true, ...extra,
});
const rows = () => [
  leave(L1, 'Ayşe Yılmaz'),
  leave(L2, 'Mehmet Kaya', { leaveType: 'Health', canReview: false, requestedByUserId: 'u1', canCancel: true }),
  leave(L3, 'Can Öz', { status: 'Approved', canReview: false, leaveType: 'Excuse' }),
];
const employees = [{ id: E1, personnelCode: 'P-0001', fullName: 'Ayşe Yılmaz', department: 'Depo', jobTitle: null, employmentCategory: null,
  workEmail: null, hireDate: '2024-03-01', terminationDate: null, status: 'Active', userId: null, rowVersion: 'e1' }];
const respond = (path: string, method: string) => {
  if (method === 'GET' && path === '/api/hr/leave-requests') return { items: rows(), page: 1, pageSize: 50, totalCount: 3 };
  if (method === 'GET' && path === '/api/hr/employees') return { items: employees, page: 1, pageSize: 50, totalCount: 1 };
  if (method === 'POST' && path === '/api/hr/leave-requests') return { id: 'new', status: 'Requested' };
  if (method === 'POST' && /^\/api\/hr\/leave-requests\/[^/]+\/(review|cancel)$/.test(path)) return { id: L1, status: 'Approved' };
  return undefined;
};
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const lists = () => h.gets('/api/hr/leave-requests');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const dialog = () => screen.getByRole('dialog', { name: 'İzin talebi' });
const creates = () => h.writes().filter((call) => call.url === '/api/hr/leave-requests');
const pick = async (element: HTMLInputElement, option: string) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};

beforeEach(() => h.before());
afterEach(() => h.after());

describe('İzin talepleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('opens with the Bekliyor status filter in the list request; leave types and statuses have Turkish labels', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    const first = query(lists()[0].url);
    expect(first.get('status')).toBe('Requested');
    expect(first.get('page')).toBe('1');
    expect(first.get('pageSize')).toBe('50');
    expect(within(await h.row('Ayşe Yılmaz')).getByText('Yıllık')).toBeTruthy();
    expect(within(await h.row('Ayşe Yılmaz')).getByText('Bekliyor')).toBeTruthy();
    expect(within(await h.row('Mehmet Kaya')).getByText('Sağlık')).toBeTruthy();
    expect(within(await h.row('Can Öz')).getByText('Onaylandı')).toBeTruthy();
    // Not sütunu listede varsayılan gizli.
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    expect(headers).not.toContain('Not');
    expect(headers).toContain('Departman');
  });

  it('İzin talebi: dialog defaults, active personnel lookup, body without requestedDays when empty', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    await screen.findByRole('dialog', { name: 'İzin talebi' }, T);
    expect(input('talepTuru').value).toBe('Annual');
    expect(input('talepBaslangic').value).toBe(today());
    expect(input('talepBitis').value).toBe(today());
    expect(input('talepGun').value).toBe('');
    expect(input('talepGun').placeholder).toBe('Boşsa takvim günü');
    expect(input('talepPersoneli').value).toBe('');
    await pick(input('talepPersoneli'), 'Ayşe Yılmaz');
    const lookups = h.gets('/api/hr/employees').map((call) => query(call.url));
    expect(lookups.some((params) => params.get('status') === 'Active')).toBe(true);
    fireEvent.change(input('talepBitis'), { target: { value: '2099-01-02' } });
    fireEvent.change(input('talepBaslangic'), { target: { value: '2099-01-01' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Talep et' }));
    await waitFor(() => expect(creates()).toHaveLength(1), T);
    const body = h.bodyOf(creates()[0]);
    expect(body).toMatchObject({ employeeId: E1, leaveType: 'Annual', startDate: '2099-01-01', endDate: '2099-01-02' });
    expect(body.requestedDays ?? null).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'İzin talebi' })).toBeNull(), T);
  });

  it('Onayla posts {approve:true, rowVersion} for the selected row', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    fireEvent.click(await h.menuItem(/^Onayla/));
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/hr/leave-requests/${L1}/review` });
    expect(h.bodyOf(h.writes()[0])).toEqual({ approve: true, rowVersion: 'rv-1' });
  });

  it('Reddet asks for an optional note, then posts {approve:false, note, rowVersion}', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    fireEvent.click(await h.menuItem(/^Reddet/));
    const prompt = await screen.findByRole('alertdialog', {}, T);
    expect(prompt.textContent).toContain('Ret notu');
    expect(h.writes()).toEqual([]);
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yoğun dönem' } });
    fireEvent.click(within(prompt).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/hr/leave-requests/${L1}/review` });
    expect(h.bodyOf(h.writes()[0])).toEqual({ approve: false, note: 'Yoğun dönem', rowVersion: 'rv-1' });
  });

  it('Onayla / Reddet are disabled with the reason when canReview is false; İptal et shows only for canCancel', async () => {
    h.setup(respond);
    await h.select('Mehmet Kaya');
    const approve = await h.menuItem(/^Onayla/);
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.outerHTML).toContain('Başka bir yönetici onaylamalı');
    const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
    expect(names.some((name) => name.startsWith('İptal et'))).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(await h.menuItem(/^İptal et/));
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/hr/leave-requests/${L2}/cancel` });
    expect(h.bodyOf(h.writes()[0])).toEqual({ rowVersion: 'rv-2' });
  });

  it('an approved request offers neither Onayla nor İptal et', async () => {
    h.setup(respond);
    await h.select('Can Öz');
    fireEvent.click(h.command('more'));
    await screen.findAllByRole('menuitem', {}, T);
    const names = screen.queryAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '');
    expect(names.some((name) => name.startsWith('Onayla'))).toBe(false);
    expect(names.some((name) => name.startsWith('İptal et'))).toBe(false);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  });
});
