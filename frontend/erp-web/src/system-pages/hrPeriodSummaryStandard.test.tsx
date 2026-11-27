import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageDateScope } from '../custom-page/pageBindings';
import catalog from './hrPeriodSummaryOperations.fixture.json';
import { createHarness, T } from './purchasingStandardHarness';

// "Dönem özeti" standart tanımı (hr-period-summary.json): her çağrı denetim kaydı yazdığı için sayfa açılınca çalışmaz;
// yalnız Çalıştır ile istenir. Toplamlar meta alanlarından, izin durumu kırılımı satırlardan gelir.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'hr-period-summary';
const h = createHarness(KEY, catalog);

const summary = (from: string | null, to: string | null) => ({
  from, to, employeesAtPeriodEnd: 42, attendanceRecordCount: 310, employeesWithAttendance: 38, workedMinutes: 148800, overtimeMinutes: 2460,
  leaveRequestCount: 9, requestedLeaveDays: 21.5,
  leaveStatuses: [{ status: 'Requested', requestCount: 2, requestedDays: 4 }, { status: 'Approved', requestCount: 7, requestedDays: 17.5 }],
});
const respond = (path: string, method: string, url: string) => {
  if (method !== 'GET' || path !== '/api/hr/period-summary') return undefined;
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  return summary(params.get('from'), params.get('to'));
};
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const runs = () => h.gets('/api/hr/period-summary');
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;

beforeEach(() => h.before());
afterEach(() => h.after());

describe('Dönem özeti standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('opening the page sends no request; the period defaults to the first of the month .. today', async () => {
    h.setup(respond);
    await waitFor(() => expect(input('baslangic')).toBeTruthy(), T);
    expect(input('baslangic').value).toBe(pageDateScope().ayBasi);
    expect(input('bitis').value).toBe(today());
    expect(document.body.textContent).toContain('Her çalıştırma denetim kaydına yazılır');
    await h.settle(200);
    expect(runs()).toEqual([]);
    expect(document.body.textContent).not.toContain('Dönem sonu personel');
  });

  it('Çalıştır requests the period once and shows the totals and the leave status breakdown', async () => {
    h.setup(respond);
    await waitFor(() => expect(input('baslangic')).toBeTruthy(), T);
    fireEvent.change(input('baslangic'), { target: { value: '2026-10-01' } });
    fireEvent.change(input('bitis'), { target: { value: '2026-10-31' } });
    await h.settle(100);
    expect(runs()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Çalıştır' }));
    await waitFor(() => expect(runs()).toHaveLength(1), T);
    expect([query(runs()[0].url).get('from'), query(runs()[0].url).get('to')]).toEqual(['2026-10-01', '2026-10-31']);
    await waitFor(() => expect(document.body.textContent).toContain('Dönem sonu personel'), T);
    const text = () => document.body.textContent ?? '';
    for (const label of ['Puantajı olan personel', 'Çalışılan (dk)', 'Fazla mesai (dk)', 'İzin talebi', 'Talep edilen gün']) {
      expect(text()).toContain(label);
    }
    expect(text()).toContain('42');
    await h.cell('Bekliyor');
    await h.cell('Onaylandı');
    await h.settle(100);
    expect(runs()).toHaveLength(1);
  });
});
