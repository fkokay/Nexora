import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageDateScope } from '../custom-page/pageBindings';
import catalog from './hrAttendanceOperations.fixture.json';
import { createHarness, T } from './purchasingStandardHarness';

// "Puantaj" standart tanımı (hr-attendance.json): ay başından bugüne açılır; kayıt penceresi 480 / 0 dakikayla başlar,
// düzeltme kaydı ik.puantaj.getir ile okuyup ik.puantaj.duzelt ile yazar (onay kalkar), onay dört göz kuralına bağlıdır.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'hr-attendance';
const A1 = '77777777-0000-0000-0000-000000000001';
const A2 = '77777777-0000-0000-0000-000000000002';
const E1 = '44444444-0000-0000-0000-000000000001';
const h = createHarness(KEY, catalog);

const record = (id: string, employee: string, extra: Record<string, unknown> = {}) => ({
  id, employeeId: E1, employee, workDate: '2026-11-20', workedMinutes: 480, overtimeMinutes: 30, note: 'Gece vardiyası', recordedByUserId: 'u2',
  approvalStatus: 'PendingApproval', approvedByUserId: null, approvedAt: null, createdAt: '2026-11-20T18:00:00Z', rowVersion: `rv-${id.slice(-1)}`,
  canApprove: true, ...extra,
});
const rows = () => [record(A1, 'Ayşe Yılmaz'), record(A2, 'Mehmet Kaya', { canApprove: false, recordedByUserId: 'u1' })];
const employees = [{ id: E1, personnelCode: 'P-0001', fullName: 'Ayşe Yılmaz', department: 'Depo', jobTitle: null, employmentCategory: null,
  workEmail: null, hireDate: '2024-03-01', terminationDate: null, status: 'Active', userId: null, rowVersion: 'e1' }];
const respond = (path: string, method: string) => {
  if (method === 'GET' && path === '/api/hr/attendance') return { items: rows(), page: 1, pageSize: 50, totalCount: 2 };
  if (method === 'GET' && path === `/api/hr/attendance/${A1}`) return rows()[0];
  if (method === 'GET' && path === `/api/hr/attendance/${A2}`) return rows()[1];
  if (method === 'GET' && path === '/api/hr/employees') return { items: employees, page: 1, pageSize: 50, totalCount: 1 };
  if (method === 'POST' && path === '/api/hr/attendance') return { id: 'new', workDate: '2026-11-23' };
  if (method === 'PUT' && path === `/api/hr/attendance/${A1}`) return rows()[0];
  if (method === 'POST' && /^\/api\/hr\/attendance\/[^/]+\/approve$/.test(path)) return { id: A1, status: 'Approved' };
  return undefined;
};
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const lists = () => h.gets('/api/hr/attendance');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const creates = () => h.writes().filter((call) => call.method === 'POST' && call.url === '/api/hr/attendance');
const puts = () => h.writes().filter((call) => call.method === 'PUT');
const pick = async (element: HTMLInputElement, option: string) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};

beforeEach(() => h.before());
afterEach(() => h.after());

describe('Puantaj standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('loads from the first of the month to today, first page of 50; minutes columns and approval labels', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    const first = query(lists()[0].url);
    expect([first.get('from'), first.get('to')]).toEqual([pageDateScope().ayBasi, today()]);
    expect(first.get('page')).toBe('1');
    expect(first.get('pageSize')).toBe('50');
    expect(first.get('approvalStatus')).toBeNull();
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Personel', 'İş günü', 'Çalışılan (dk)', 'Fazla mesai (dk)', 'Not', 'Onay']) expect(headers).toContain(label);
    expect(within(await h.row('Ayşe Yılmaz')).getByText('Onay bekliyor')).toBeTruthy();
    // Kayıt okuması satır seçilmeden yapılmaz.
    expect(h.gets(`/api/hr/attendance/${A1}`)).toEqual([]);
  });

  it('Puantaj kaydı: defaults 480 / 0 and today, empty personnel; the dialog stays open after a save', async () => {
    h.setup(respond);
    await h.cell('Ayşe Yılmaz');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Puantaj kaydı' }, T);
    expect(input('kayitCalisma').value).toBe('480');
    expect(input('kayitMesai').value).toBe('0');
    expect(input('kayitGunu').value).toBe(today());
    expect(input('kayitPersoneli').value).toBe('');
    expect(dialog.textContent).toContain('Çalışılan + fazla mesai en çok 1440 dk');
    await pick(input('kayitPersoneli'), 'Ayşe Yılmaz');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(creates()).toHaveLength(1), T);
    expect(h.bodyOf(creates()[0])).toMatchObject({ employeeId: E1, workDate: today(), workedMinutes: 480, overtimeMinutes: 0 });
    await h.settle(100);
    expect(screen.queryByRole('dialog', { name: 'Puantaj kaydı' })).toBeTruthy();
  });

  it('Düzelt reads the record, warns that it goes back to approval, and PUTs with the source rowVersion', async () => {
    h.setup(respond);
    await h.select('Ayşe Yılmaz');
    await h.ready('open');
    fireEvent.click(h.command('open'));
    const dialog = await screen.findByRole('dialog', { name: /^Puantajı düzelt/ }, T);
    expect(dialog.textContent).toContain('Kayıt yeniden onaya düşer.');
    await waitFor(() => expect(input('duzeltCalisma').value).toBe('480'), T);
    expect(input('duzeltMesai').value).toBe('30');
    expect(input('duzeltGunu').value).toBe('2026-11-20');
    fireEvent.change(input('duzeltMesai'), { target: { value: '60' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Düzeltmeyi kaydet' }));
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    expect(puts()[0].url).toBe(`/api/hr/attendance/${A1}`);
    expect(h.bodyOf(puts()[0])).toMatchObject({ workDate: '2026-11-20', workedMinutes: 480, overtimeMinutes: 60, note: 'Gece vardiyası',
      rowVersion: 'rv-1' });
  });

  it('Onayla posts the rowVersion; disabled with the reason when canApprove is false', async () => {
    h.setup(respond);
    await h.select('Mehmet Kaya');
    const disabled = await h.menuItem(/^Onayla/);
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.outerHTML).toContain('başka bir yönetici onaylamalı');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await h.select('Ayşe Yılmaz');
    fireEvent.click(await h.menuItem(/^Onayla/));
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/hr/attendance/${A1}/approve` });
    expect(h.bodyOf(h.writes()[0])).toEqual({ rowVersion: 'rv-1' });
  });
});
