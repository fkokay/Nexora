import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import CrmOpportunitiesPage from '../CrmOpportunitiesPage';
import { CrmOpportunityDetail } from './components/CrmOpportunityDetail';
import { commandReason } from '../action-bar/commandReason';

const opp = (id: string, stage: string, extra: Record<string, unknown> = {}) => ({
  id, code: `FRS-${id}`, name: `Fırsat ${id}`, customerId: 'c1', customerName: 'Akdeniz Gıda', stage, estimatedValue: 1000,
  currencyCode: 'TRY', probabilityPercent: 50, expectedCloseDate: '2026-12-15', nextActivityAt: '2020-01-01T10:00:00Z',
  notes: null, updatedAt: '2026-11-01T00:00:00Z', ...extra,
});
const opportunities = [opp('o1', 'Proposal'), opp('o2', 'Won', { nextActivityAt: null }), opp('o3', 'Prospecting', { estimatedValue: 500, nextActivityAt: '2999-01-01T10:00:00Z' })];
const requests: Array<{ url: string; method: string; body?: string }> = [];

function respond(url: string): unknown {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (path === '/api/crm/opportunities/') {
    const stage = params.get('stage');
    const items = opportunities.filter((o) => !stage || o.stage === stage);
    return { items: params.get('pageSize') === '1' ? [] : items, page: 1, pageSize: 50, total: items.length };
  }
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/customers/') return { items: [], page: 1, pageSize: 50, total: 0 };
  return {};
}

vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (init?.method && init.method !== 'GET') return new Response(null, { status: 204 });
    return new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

function renderPage() {
  render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><CrmOpportunitiesPage token="t" onNavigate={vi.fn()} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
async function settle(ms = 500) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => commandReason(command(id)) ?? '';
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getAllByText(code)[0].closest('tr')!;
function menuItems() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}

describe('CRM Fırsatları list', () => {
  it('list type: cards, stage tags, numbers, no İşlem column, Yeni on the bar', async () => {
    renderPage();
    await settle();
    const cards = Array.from(document.querySelectorAll('.nx-summary-item')).map((card) =>
      Array.from(card.querySelectorAll('.nx-summary-text > *')).map((part) => part.textContent?.replace(/\s+/g, ' ').trim()).join(' '));
    expect(cards[0]).toBe('Açık fırsat 2 tüm kayıtlar');
    expect(cards[1]).toBe('Kazanıldı 1 tüm kayıtlar');
    expect(cards[2]).toContain('Açık fırsat değeri');
    expect(cards[2]).toContain('1.500,00');
    expect(cards[3]).toBe('Takibi geçmiş 1 bu sayfa');
    expect(within(row('FRS-o1')).getByText('Teklif').className).toContain('is-warn');
    expect(within(row('FRS-o2')).getByText('Kazanıldı').className).toContain('is-ok');
    expect(within(row('FRS-o1')).getByText('%50').closest('td')!.className).toContain('nx-num');
    expect(screen.queryByRole('columnheader', { name: 'İşlem' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Yeni fırsat/ })).toBeNull();
    expect(command('new').getAttribute('data-primary')).toBe('true');
  });

  it('a click selects; Aç / double click open the form; a closed opportunity cannot be opened for editing', async () => {
    renderPage();
    await settle();
    expect(enabled('open')).toBe(false);
    fireEvent.click(row('FRS-o2'));
    await waitFor(() => expect(row('FRS-o2').getAttribute('aria-current')).toBe('true'));
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toContain('Kapanmış fırsat düzenlenemez');
    // Sil stays available on a closed opportunity (today's rule).
    expect(enabled('delete')).toBe(true);
    fireEvent.doubleClick(within(row('FRS-o1')).getByText('Fırsat o1'));
    await waitFor(() => expect(document.querySelector('.crm-opp-rf')).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'Fırsat o1' })).toBeTruthy();
  });

  it('stage changes are in İşlemler and post the same request', async () => {
    renderPage();
    await settle();
    fireEvent.click(row('FRS-o1'));
    await waitFor(() => expect(row('FRS-o1').getAttribute('aria-current')).toBe('true'));
    expect(menuItems()).toEqual(['Aşamayı ilerlet: Müzakere', 'Kaybedildi olarak işaretle', 'CSV olarak dışa aktar']);
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Aşamayı ilerlet/ }));
    });
    await waitFor(() => expect(requests.some((r) => r.method === 'POST' && r.url === '/api/crm/opportunities/o1/stage')).toBe(true));
    expect(requests.find((r) => r.url === '/api/crm/opportunities/o1/stage')!.body).toBe(JSON.stringify({ stage: 'Negotiation' }));
  });

  it('Sil opens the existing permanent delete confirmation', async () => {
    renderPage();
    await settle();
    fireEvent.click(row('FRS-o1'));
    await waitFor(() => expect(row('FRS-o1').getAttribute('aria-current')).toBe('true'));
    fireEvent.click(command('delete'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Fırsat silinsin mi?' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Fırsatı sil/ }));
    });
    await waitFor(() => expect(requests.some((r) => r.method === 'DELETE' && r.url === '/api/crm/opportunities/o1')).toBe(true));
  });
});

describe('English labels of the CRM texts', () => {
  it('translates the new CRM texts', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Açık fırsat', 'Açık fırsat değeri', 'Takibi geçmiş', 'Kapanmış fırsat düzenlenemez', 'Fırsat özeti', 'Kapandı', 'Şu an',
      'Aşama akışı', 'Özetini görmek için listeden bir fırsat seçin.', 'Fırsat kayıtları', 'Aşamayı ilerlet: Müzakere',
      'Tahmin ve takip', 'tahmini tutar × olasılık', 'Fırsat', 'Not', 'Fırsatlar yükleniyor…', 'zorunlu alan',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});

describe('Aşama akışı', () => {
  const flowOf = (stage: string) => {
    render(
      <CrmOpportunityDetail selected={opp('x', stage) as never} tab="summary" onTabChange={vi.fn()} onOpen={vi.fn()} openDisabled={false} onClose={vi.fn()} />,
    );
    const items = Array.from(document.querySelectorAll<HTMLElement>('.crm-ld-flow > li')).map((li) => `${li.textContent?.replace('Şu an', '').trim()}:${li.className}`);
    cleanup();
    return items;
  };
  it('a lost opportunity marks only Kaybedildi (no stage history); open and won ones have passed every earlier step', () => {
    expect(flowOf('Lost')).toEqual(['İlk temas:', 'Nitelikli:', 'Teklif:', 'Müzakere:', 'Kaybedildi:is-current']);
    expect(flowOf('Won')).toEqual(['İlk temas:is-done', 'Nitelikli:is-done', 'Teklif:is-done', 'Müzakere:is-done', 'Kazanıldı:is-current']);
    expect(flowOf('Proposal')).toEqual(['İlk temas:is-done', 'Nitelikli:is-done', 'Teklif:is-current', 'Müzakere:', 'Kazanıldı:']);
  });
});

describe('CRM Sil hedefi', () => {
  it('Ctrl+Del on a focused row deletes that row, like Enter opens it', async () => {
    renderPage();
    await settle();
    fireEvent.click(row('FRS-o1'));
    await waitFor(() => expect(row('FRS-o1').getAttribute('aria-current')).toBe('true'));
    row('FRS-o3').focus();
    fireEvent.keyDown(row('FRS-o3'), { key: 'Delete', ctrlKey: true });
    const dialog = await screen.findByRole('alertdialog', { name: 'Fırsat silinsin mi?' });
    expect(within(dialog).getByText('FRS-o3')).toBeTruthy();
  });
});
