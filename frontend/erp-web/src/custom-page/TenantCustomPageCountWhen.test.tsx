import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

// `bugun` sayfanın yerel takvim günüdür; tarihler bugüne göre üretilir.
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const rows = [
  { trackingCode: 'L1', expiryDate: day(-1) },
  { trackingCode: 'L2', expiryDate: day(-40) },
  { trackingCode: 'L3', expiryDate: day(0) },
  { trackingCode: 'L4', expiryDate: day(30) },
  { trackingCode: 'L5', expiryDate: day(31) },
  { trackingCode: 'L6', expiryDate: null },
];

let result: Record<string, unknown> = { rows, rowCount: rows.length, columns: [{ code: 'trackingCode', label: 'Kod' }, { code: 'expiryDate', label: 'SKT' }], truncated: false };

const components = [
  { id: 'm1', type: 'metric', name: 'gecmis', props: { title: 'Süresi geçmiş', query: 'qb', countWhen: 'bakiye.satir.expiryDate < bugun', variant: 'danger', icon: 'calendar-x', description: 'bu sayfa' } },
  { id: 'm2', type: 'metric', name: 'yakin', props: { title: '30 gün içinde dolacak', query: 'qb', countWhen: 'bakiye.satir.expiryDate >= bugun && bakiye.satir.expiryDate <= bugun + 30', variant: 'warning', icon: 'calendar-clock', description: 'bu sayfa' } },
  { id: 'm3', type: 'metric', name: 'ilk', props: { title: 'İlk değer', query: 'qb' } },
];
const queries = [{ id: 'qb', name: 'bakiye', kind: 'read', sql: 'SELECT 1', parameters: [], runOn: 'load' }];

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (endpoint: string) => endpoint.endsWith('/published')
    ? { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true }, definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) }
    : result);
});
afterEach(cleanup);

const card = (title: string) => screen.getByText(title).closest('.tenant-page-metric') as HTMLElement;
const show = () => render(<CommandProvider><TenantCustomPage code="p" token="t" /></CommandProvider>);

describe('koşullu sayaç (countWhen)', () => {
  it('koşulu sağlayan yüklenmiş satırları sayar; ton, simge ve açıklama diğer göstergeler gibi çizilir', async () => {
    show();
    await screen.findByText('Süresi geçmiş');
    await waitFor(() => expect(card('Süresi geçmiş').querySelector('strong')?.textContent).toBe('2'));
    expect(card('30 gün içinde dolacak').querySelector('strong')?.textContent).toBe('2');
    expect(card('Süresi geçmiş').classList.contains('tone-danger')).toBe(true);
    expect(card('30 gün içinde dolacak').classList.contains('tone-warning')).toBe(true);
    expect(card('Süresi geçmiş').querySelector('.tenant-metric-icon svg')).not.toBeNull();
    expect(card('Süresi geçmiş').textContent).toContain('bu sayfa');
    // countWhen olmayan gösterge eskisi gibi ilk satırın ilk sütununu gösterir.
    expect(card('İlk değer').querySelector('strong')?.textContent).toBe('L1');
  });

  it('boş sonuçta 0 gösterir', async () => {
    result = { rows: [], rowCount: 0, columns: [], truncated: false };
    show();
    await screen.findByText('Süresi geçmiş');
    await waitFor(() => expect(card('Süresi geçmiş').querySelector('strong')?.textContent).toBe('0'));
    expect(card('İlk değer').querySelector('strong')?.textContent).toBe('—');
  });
});
