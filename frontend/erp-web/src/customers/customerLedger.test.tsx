import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import CustomerLedgerPage, { periodRange } from '../CustomerLedgerPage';

const line = (id: string, entryDate: string, direction: 'Debit' | 'Credit', amount: number, description: string, balance: number, extra = {}) => ({
  id, entryDate, direction, amount, currencyCode: 'TRY', description, reversalOfId: null, isReversal: false, hasReversal: false, balance, ...extra,
});
const statement = {
  customerId: 'c1', customerCode: 'C-0142', customerName: 'Akdeniz Gıda', currencyCode: 'TRY', from: '2026-01-01', to: '2026-11-16',
  openingBalance: 1000, debitTotal: 600, creditTotal: 1900, closingBalance: -300,
  items: [
    line('l1', '2026-10-14', 'Debit', 500, 'Satış faturası SF-1', 1500, { hasReversal: true }),
    line('l2', '2026-10-15', 'Credit', 500, 'Hatalı fiyat', 1000, { reversalOfId: 'l1' }),
    line('l3', '2026-10-16', 'Debit', 100, 'Satış faturası SF-2', 1100),
    line('l4', '2026-11-01', 'Credit', 1400, 'Tahsilat', -300),
  ],
};

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/customers/') return { items: [{ id: 'c1', code: 'C-0142', name: 'Akdeniz Gıda', isActive: true }], totalCount: 1 };
  if (path === '/api/customers/c1/statement') return statement;
  return { fields: [] };
}
const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  localStorage.clear();
});

async function renderWithStatement() {
  render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><CustomerLedgerPage token="t" /></KeepAliveViews>
    </CommandProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cari hesap' }));
  await waitFor(() => expect(screen.getByRole('option', { name: /C-0142/ })).toBeTruthy());
  fireEvent.click(screen.getByRole('option', { name: /C-0142/ }));
  await waitFor(() => expect(document.querySelector('.cl-statement')).not.toBeNull());
}
const urls = () => apiMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/statement'));

describe('Cari Hesap Hareketleri (taslak 03 ekstre)', () => {
  it('periodRange: Bu ay, Son 3 ay and Yıl başından end today', () => {
    const now = new Date(2026, 10, 16);
    expect(periodRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    expect(periodRange('quarter', now)).toEqual({ from: '2026-08-16', to: '2026-11-16' });
    expect(periodRange('year', now)).toEqual({ from: '2026-01-01', to: '2026-11-16' });
  });

  it('shows devir, the movements with a sided running balance, the period total and the closing balance', async () => {
    await renderWithStatement();
    const card = document.querySelector<HTMLElement>('.cl-statement')!;
    expect(card.querySelector('.cl-opening')!.textContent).toContain('Devir — açılış bakiyesi');
    expect(card.querySelector('.cl-opening')!.textContent).toContain('1.000,00 B');
    expect(card.querySelector('.cl-subtotal')!.textContent).toContain('4 hareket (ters kayıt dahil)');
    expect(card.querySelector('.cl-subtotal')!.textContent).toContain('Net -1.300,00');
    expect(card.querySelector('.cl-closing')!.textContent).toContain('300,00 A TRY');
    // Default range: year to date (unchanged), the Yıl başından chip is the active one.
    expect(screen.getByRole('button', { name: 'Yıl başından' }).getAttribute('aria-pressed')).toBe('true');
    const cardsText = Array.from(document.querySelectorAll('.nx-summary-item')).map((n) => Array.from(n.querySelectorAll('.nx-summary-text > *')).map((p) => p.textContent?.replace(/\s+/g, ' ').trim()).join(' '));
    expect(cardsText[0]).toContain('Açılış bakiyesi 1.000,00 B TRY');
    expect(cardsText[3]).toContain('Kapanış bakiyesi 300,00 A TRY');
    const balance = within(card).getByText('1.500,00').closest('td')!;
    expect(balance.className).toContain('nx-num');
  });

  it('marks the reversal from reversalOfId and strikes through the reversed line', async () => {
    await renderWithStatement();
    const reversal = screen.getByText('Hatalı fiyat').closest('tr')!;
    expect(reversal.className).toContain('cl-is-reversal');
    expect(within(reversal).getByText('Ters kayıt').className).toContain('nx-status-tag');
    const reversed = screen.getByText('Satış faturası SF-1').closest('tr')!;
    expect(reversed.className).toContain('cl-is-reversed');
    expect(within(reversed).getByText('Ters çevrildi')).toBeTruthy();
  });

  it('a period chip only sets the date range and reloads the statement', async () => {
    await renderWithStatement();
    const before = urls().length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bu ay' }));
    });
    await waitFor(() => expect(urls().length).toBe(before + 1));
    const { from, to } = periodRange('month');
    expect(urls().at(-1)).toContain(`from=${from}&to=${to}`);
    expect(screen.getByRole('button', { name: 'Bu ay' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('English labels of the statement texts', () => {
  it('translates the new statement texts', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Açılış bakiyesi', 'Kapanış bakiyesi', 'itibarıyla', 'ters kayıt dahil', 'Dönem', 'Bu ay', 'Son 3 ay', 'Yıl başından',
      'Hesap hareketleri', 'Devir — açılış bakiyesi', 'Dönem toplamı', 'hareket', 'Açılış', 'Kapanış',
      'B borç bakiyesi · A alacak bakiyesi · Ters kayıt orijinal hareketin karşı kaydıdır, hareketler silinmez',
      'Cari hesap hareketleri', 'Aramayla eşleşen cari bulunamadı.', 'Cari ekstre görünümüne başlayın',
      'Borç, alacak ve bakiye hareketlerini görmek için önce bir cari hesap seçin.',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});
