import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Saat dilimi modüller yüklenmeden sabitlenir (UTC+3, yaz saati yok): UTC'de çalışan CI'da da 3 saatlik kayma sınanır.
vi.hoisted(() => { process.env.TZ = 'Europe/Istanbul'; });

import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import CrmOpportunitiesPage from '../CrmOpportunitiesPage';

const opportunity = {
  id: 'o1', code: 'FRS-o1', name: 'Fırsat o1', customerId: null, customerName: null, stage: 'Proposal', estimatedValue: 1000,
  currencyCode: 'TRY', probabilityPercent: 50, expectedCloseDate: '2026-12-15', nextActivityAt: '2026-11-21T09:30:00+00:00',
  notes: null, updatedAt: '2026-11-01T00:00:00Z',
};
const requests: Array<{ url: string; method: string; body?: string }> = [];

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const path = url.split('?')[0];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (init?.method === 'PUT') return json(opportunity);
    if (path === '/api/crm/opportunities/') return json({ items: [opportunity], page: 1, pageSize: 50, total: 1 });
    if (path === '/api/customers/') return json({ items: [], page: 1, pageSize: 50, total: 0 });
    if (path.startsWith('/api/screen-views/')) return json({ fields: [] });
    return json({});
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  requests.length = 0;
  localStorage.clear();
});

describe('CRM Fırsatları legacy edit: Sonraki takip', () => {
  it('fills the datetime-local field with local time and an unchanged save keeps the same instant (no 3-hour shift)', async () => {
    render(
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><CrmOpportunitiesPage token="t" onNavigate={vi.fn()} /></KeepAliveViews>
        <ConfirmDialogHost />
      </CommandProvider>,
    );
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    const grid = document.querySelector<HTMLElement>('.list-v2-list table')!;
    fireEvent.doubleClick(within(grid).getByText('Fırsat o1'));
    await waitFor(() => expect(document.querySelector('.crm-opp-rf')).not.toBeNull());
    const field = document.querySelector<HTMLInputElement>('.crm-opp-rf input[type="datetime-local"]')!;
    // 09:30 UTC, İstanbul'da 12:30'dur (eski kod UTC metnini "09:30" yazıyordu).
    expect(field.value).toBe('2026-11-21T12:30');
    fireEvent.submit(document.getElementById('crm-opportunity-form')!);
    await waitFor(() => expect(requests.some((request) => request.method === 'PUT')).toBe(true));
    const put = requests.find((request) => request.method === 'PUT')!;
    expect(new Date(JSON.parse(put.body!).nextActivityAt as string).toISOString()).toBe('2026-11-21T09:30:00.000Z');
  });
});
