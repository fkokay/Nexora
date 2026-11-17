import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { addLocalCalendarDays, localDateString } from '../dateUtils';
import SalesPromotionsPage from '../SalesPromotionsPage';

// Kampanyalar as a definition screen (mockup 04 "2 · Tanım ekranı" / "2b · Sil onayı", mapping in mockup 06): the
// campaign list on the left, the selected campaign's form on the right; the API has no row version and no delete.

type Campaign = {
  id: string; code: string; name: string; discountPercent: number; effectiveFrom: string; effectiveThrough: string;
  isActive: boolean; applicationCount: number;
};
const today = localDateString();
const day = (offset: number) => addLocalCalendarDays(offset);
let campaigns: Campaign[] = [];
let conflicts: Record<string, string> = {};

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  if (path === '/api/sales/promotions/' && method === 'POST')
    return { id: 'p-new', ...body, code: String(body.code).toUpperCase(), applicationCount: 0 };
  if (path === '/api/sales/promotions/') return campaigns;
  const put = path.match(/^\/api\/sales\/promotions\/([^/]+)$/);
  if (put && method === 'PUT') {
    const row = { ...campaigns.find((c) => c.id === put[1])!, ...body, code: String(body.code).toUpperCase() };
    campaigns = campaigns.map((c) => (c.id === row.id ? row : c));
    return row;
  }
  if (/^\/api\/sales\/promotions\/[^/]+\/apply$/.test(path)) return { discountAmount: 120, grandTotal: 1080 };
  if (path === '/api/sales/quotes/')
    return {
      items: [
        { id: 'q1', code: 'TKL-001', customerName: 'Akdeniz Gıda', quoteDate: today, status: 'Draft', grandTotal: 1200, lineCount: 2 },
        { id: 'q2', code: 'TKL-002', customerName: 'Ege Ambalaj', quoteDate: today, status: 'Approved', grandTotal: 900, lineCount: 1 },
      ],
      page: 1, pageSize: 100, totalCount: 2,
    };
  if (path === '/api/sales/quotes/campaign-performance')
    return {
      items: [
        { campaignId: 'p1', code: 'KMP-KIS', name: 'Kış kampanyası', discountPercent: 10, effectiveFrom: day(-10), effectiveThrough: day(40), isActive: true,
          applications: 4, discountTotals: [{ currencyCode: 'TRY', amount: 1250 }], appliedQuotes: 4, linkedOrders: 2, linkedOrderTotals: [{ currencyCode: 'TRY', amount: 22000 }] },
      ],
      page: 1, pageSize: 100, totalCount: 1, method: 'Uygulama kayıtları',
    };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return { items: [], page: 1, pageSize: 50, totalCount: 0 };
}

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: fetchMock,
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  conflicts = {};
  campaigns = [
    { id: 'p1', code: 'KMP-KIS', name: 'Kış kampanyası', discountPercent: 10, effectiveFrom: day(-10), effectiveThrough: day(40), isActive: true, applicationCount: 4 },
    { id: 'p2', code: 'KMP-YIL', name: 'Yılbaşı', discountPercent: 15, effectiveFrom: day(5), effectiveThrough: day(20), isActive: true, applicationCount: 0 },
    { id: 'p3', code: 'KMP-YAZ', name: 'Yaz indirimi', discountPercent: 5, effectiveFrom: day(-120), effectiveThrough: day(-60), isActive: true, applicationCount: 7 },
    { id: 'p4', code: 'KMP-ESK', name: 'Eski kampanya', discountPercent: 8, effectiveFrom: day(-10), effectiveThrough: day(10), isActive: false, applicationCount: 1 },
  ];
  fetchMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => {
    const conflict = conflicts[`${init?.method ?? 'GET'} ${url.split('?')[0]}`];
    if (conflict) return new Response(JSON.stringify({ error: conflict }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(respond(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  sessionStorage.clear();
});

function renderPage(role = 'TenantAdmin') {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <SalesPromotionsPage token="t" role={role} />
      </KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const enabled = (id: string) => command(id)!.getAttribute('aria-disabled') !== 'true';
const primary = (id: string) => command(id)!.getAttribute('data-primary') === 'true';
function menuItems() {
  fireEvent.click(command('more')!);
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  return items;
}
function openMenu() {
  const items = menuItems().map((item) => item.textContent?.trim());
  fireEvent.click(command('more')!);
  return items;
}
async function runMenuItem(label: string) {
  const item = menuItems().find((node) => node.textContent?.trim().startsWith(label))!;
  await act(async () => {
    fireEvent.click(item);
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const listRegion = () => document.querySelector<HTMLElement>('.nx-def-list .advanced-grid-scroll')!;
const listRows = () => within(listRegion()).getAllByRole('row').slice(1);
const rowOf = (code: string) => listRows().find((row) => row.textContent?.includes(code))!;
const pane = () => document.querySelector<HTMLElement>('.nx-def-pane')!;
const field = (label: RegExp) => within(pane()).getByLabelText(label) as HTMLInputElement;
const calls = (method: string, pattern: RegExp) =>
  fetchMock.mock.calls.filter(([url, , init]) => (init?.method ?? 'GET') === method && pattern.test(String(url).split('?')[0]));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));
async function select(code: string) {
  await act(async () => {
    fireEvent.click(rowOf(code));
  });
  await settle();
}
async function ctrlS() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
  });
  await settle();
}

describe('Kampanyalar definition screen', () => {
  it('lists the campaigns with status tags and loads the selected one into the right-hand form', async () => {
    renderPage();
    await settle();
    expect(within(pane()).getByText('Bir kampanya seçin ya da F2 ile yeni kampanya ekleyin.')).toBeTruthy();
    expect(listRows()).toHaveLength(4);
    // Status tags from today's states: Geçerli ok, Planlanan info, Süresi doldu / Pasif off.
    const tag = (code: string, label: string) => within(rowOf(code)).getByText(label).className;
    expect(tag('KMP-KIS', 'Geçerli')).toContain('is-ok');
    expect(tag('KMP-YIL', 'Planlanan')).toContain('is-info');
    expect(tag('KMP-YAZ', 'Süresi doldu')).toContain('is-off');
    expect(tag('KMP-ESK', 'Pasif')).toContain('is-off');
    // No row is opened by itself.
    expect(listRows().some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
    await select('KMP-KIS');
    expect(rowOf('KMP-KIS').getAttribute('aria-current')).toBe('true');
    expect(field(/^Kampanya kodu/).value).toBe('KMP-KIS');
    expect(field(/^Kampanya adı/).value).toBe('Kış kampanyası');
    expect(field(/^İndirim yüzdesi/).value).toBe('10');
    expect(field(/^Başlangıç tarihi/).value).toBe(day(-10));
    expect(field(/^Bitiş tarihi/).value).toBe(day(40));
    // The former Özet / Performans facts stay, read-only, under the form.
    const performance = within(pane()).getByRole('region', { name: 'Performans' });
    expect(performance.textContent).toContain('Uygulanan teklif');
    expect(performance.textContent).toContain('Dönüşüm');
    expect(performance.textContent).toContain('%50');
    expect(enabled('save')).toBe(false);
    expect(command('save')!.title).toBe('Kaydedilecek değişiklik yok');
  });

  it('moves with ↓ and asks before leaving a changed form', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Kış kampanyası 2' } });
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
    expect(within(pane()).getByText('Önceki: Kış kampanyası')).toBeTruthy();
    fireEvent.keyDown(listRegion(), { key: 'ArrowDown' });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(field(/^Kampanya adı/).value).toBe('Kış kampanyası 2');
    expect(rowOf('KMP-KIS').getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(listRegion(), { key: 'ArrowDown' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    await waitFor(() => expect(field(/^Kampanya kodu/).value).toBe('KMP-YIL'));
    expect(within(pane()).queryByText('1 alan değişti')).toBeNull();
  });

  it('Ctrl+S saves the form with today\'s PUT body and keeps it open on the saved values', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Kış kampanyası 2' } });
    fireEvent.change(field(/^İndirim yüzdesi/), { target: { value: '12.5' } });
    expect(within(pane()).getByText('2 alan değişti')).toBeTruthy();
    expect(primary('save')).toBe(true);
    field(/^Kampanya adı/).focus();
    await ctrlS();
    const put = calls('PUT', /^\/api\/sales\/promotions\/p1$/);
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({
      code: 'KMP-KIS', name: 'Kış kampanyası 2', discountPercent: 12.5, effectiveFrom: day(-10), effectiveThrough: day(40), isActive: true,
    });
    expect(rowOf('KMP-KIS').textContent).toContain('Kış kampanyası 2');
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    expect(field(/^Kampanya adı/).value).toBe('Kış kampanyası 2');
    expect(screen.getByRole('status').textContent).toContain('Kampanya güncellendi.');
  });

  it('an unchanged form is not saved (Enter in a field sends nothing)', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    await act(async () => {
      fireEvent.submit(field(/^Kampanya adı/).form!);
    });
    await settle();
    expect(calls('PUT', /promotions/)).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a percent typed as the same number is not a change', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    fireEvent.change(field(/^İndirim yüzdesi/), { target: { value: '10.00' } });
    expect(within(pane()).queryByText(/alan değişti/)).toBeNull();
    expect(enabled('save')).toBe(false);
  });

  it('a status change of the open campaign is kept by the next save (no silent re-activation)', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    expect(openMenu()).toEqual(['Teklife uygula', 'Pasifleştir', 'Performans raporu']);
    // Blocked while the form has changes.
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'X' } });
    const blocked = menuItems().find((node) => node.textContent?.trim().startsWith('Pasifleştir'))!;
    expect(blocked.getAttribute('aria-disabled') ?? String((blocked as HTMLButtonElement).disabled)).toMatch(/true/);
    fireEvent.click(command('more')!);
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Kış kampanyası' } });
    await runMenuItem('Pasifleştir');
    const toggle = calls('PUT', /^\/api\/sales\/promotions\/p1$/);
    expect(toggle).toHaveLength(1);
    expect(bodyOf(toggle[0]).isActive).toBe(false);
    expect(within(rowOf('KMP-KIS')).getByText('Pasif')).toBeTruthy();
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Kış kampanyası 2' } });
    field(/^Kampanya adı/).focus();
    await ctrlS();
    const save = calls('PUT', /^\/api\/sales\/promotions\/p1$/);
    expect(save).toHaveLength(2);
    expect(bodyOf(save[1])).toMatchObject({ name: 'Kış kampanyası 2', isActive: false });
    expect(openMenu()).toContain('Etkinleştir');
  });

  it('F2 opens an empty form with today\'s defaults (not a change), asks first over a changed form, and creates', async () => {
    renderPage();
    await settle();
    expect(primary('new')).toBe(true);
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'F2' });
    });
    await settle();
    expect(within(pane()).getByRole('heading', { name: 'Kampanya oluştur' })).toBeTruthy();
    expect(field(/^İndirim yüzdesi/).value).toBe('10');
    expect(field(/^Başlangıç tarihi/).value).toBe(today);
    expect(field(/^Bitiş tarihi/).value).toBe(day(30));
    // Defaults are not a change: Esc closes without asking.
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(pane()).getByText('Bir kampanya seçin ya da F2 ile yeni kampanya ekleyin.')).toBeTruthy();
    // Over a changed form F2 asks first.
    await select('KMP-KIS');
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Değişti' } });
    fireEvent.keyDown(document.body, { key: 'F2' });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Yeni kayıt')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(field(/^Kampanya adı/).value).toBe('Değişti');
    fireEvent.keyDown(document.body, { key: 'F2' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(listRows().some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
    fireEvent.change(field(/^Kampanya kodu/), { target: { value: 'kmp-yeni' } });
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'Yeni kampanya' } });
    field(/^Kampanya adı/).focus();
    await ctrlS();
    const post = calls('POST', /^\/api\/sales\/promotions\/$/);
    expect(post).toHaveLength(1);
    expect(bodyOf(post[0])).toEqual({
      code: 'KMP-YENI', name: 'Yeni kampanya', discountPercent: 10, effectiveFrom: today, effectiveThrough: day(30), isActive: true,
    });
    await waitFor(() => expect(rowOf('KMP-YENI').getAttribute('aria-current')).toBe('true'));
    expect(field(/^Kampanya kodu/).value).toBe('KMP-YENI');
  });

  it('Esc closes the form, asking first when it has changes', async () => {
    renderPage();
    await settle();
    await select('KMP-YIL');
    fireEvent.keyDown(listRegion(), { key: 'Escape' });
    await settle();
    expect(rowOf('KMP-YIL').getAttribute('aria-current')).toBeNull();
    await select('KMP-YIL');
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'X' } });
    fireEvent.keyDown(field(/^Kampanya adı/), { key: 'Escape' });
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devam' }));
    await settle();
    expect(within(pane()).queryByRole('textbox')).toBeNull();
  });

  it('Sil explains that campaigns are not deleted and offers Pasifleştir (Enter) / Vazgeç (Esc)', async () => {
    renderPage();
    await settle();
    expect(enabled('delete')).toBe(false);
    expect(command('delete')!.title).toBe('Önce bir kayıt seçin');
    await select('KMP-ESK');
    expect(enabled('delete')).toBe(false);
    expect(command('delete')!.title).toBe('Kampanyalar silinemez; bu kampanya zaten pasif.');
    await select('KMP-YIL');
    expect(enabled('delete')).toBe(true);
    await act(async () => {
      fireEvent.click(command('delete')!);
    });
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('KMP-YIL · Yılbaşı silinemez');
    expect(dialog.textContent).toContain('Kampanyalar silinmez');
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['VazgeçEsc', 'PasifleştirEnter']);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Vazgeç/ }));
    await settle();
    expect(calls('PUT', /promotions\/p2$/)).toHaveLength(0);
    await act(async () => {
      fireEvent.click(command('delete')!);
    });
    dialog = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Pasifleştir/ }));
    });
    await settle();
    const put = calls('PUT', /^\/api\/sales\/promotions\/p2$/);
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({
      code: 'KMP-YIL', name: 'Yılbaşı', discountPercent: 15, effectiveFrom: day(5), effectiveThrough: day(20), isActive: false,
    });
    // Changed form: Sil is closed.
    fireEvent.change(field(/^Kampanya adı/), { target: { value: 'X' } });
    expect(command('delete')!.title).toBe('Önce değişiklikleri kaydedin veya vazgeçin');
  });

  it('a TenantUser sees the campaign read-only and can still apply it to a draft quote', async () => {
    renderPage('TenantUser');
    await settle();
    // No Yeni / Sil for them (the bar shows the commands as not available here).
    expect(command('new')!.title).toBe('Bu ekranda kullanılamaz');
    expect(command('delete')!.title).toBe('Bu ekranda kullanılamaz');
    await select('KMP-KIS');
    expect(field(/^Kampanya adı/).disabled).toBe(true);
    expect(field(/^Kampanya kodu/).disabled).toBe(true);
    expect(enabled('save')).toBe(false);
    expect(command('save')!.title).toBe('Kampanyaları firma yöneticisi düzenler');
    expect(openMenu()).toEqual(['Teklife uygula', 'Performans raporu']);
    const apply = within(pane()).getByRole('region', { name: 'Teklife uygula' });
    // Only draft quotes with lines inside the campaign window are offered.
    const select_ = within(apply).getByRole('combobox', { name: 'Taslak teklif' }) as HTMLSelectElement;
    expect(Array.from(select_.options).map((option) => option.value)).toEqual(['', 'q1']);
    fireEvent.change(select_, { target: { value: 'q1' } });
    await act(async () => {
      fireEvent.click(within(apply).getByRole('button', { name: /indirimi uygula/ }));
    });
    await settle();
    const post = calls('POST', /^\/api\/sales\/promotions\/p1\/apply$/);
    expect(post).toHaveLength(1);
    expect(bodyOf(post[0])).toEqual({ quoteId: 'q1' });
    expect(screen.getByRole('status').textContent).toContain('Kampanya uygulandı.');
    expect(calls('PUT', /promotions/)).toHaveLength(0);
  });

  it('Teklife uygula is closed for a campaign that is not valid today', async () => {
    renderPage();
    await settle();
    await select('KMP-YIL');
    const item = menuItems().find((node) => node.textContent?.trim().startsWith('Teklife uygula'))!;
    expect(item.getAttribute('aria-disabled') ?? String((item as HTMLButtonElement).disabled)).toMatch(/true/);
    fireEvent.click(command('more')!);
    expect(within(pane()).getByRole('region', { name: 'Teklife uygula' }).textContent).toContain(
      'Yalnızca bugün geçerli ve etkin kampanyalar tekliflere uygulanabilir.',
    );
  });

  it('while the performance report is shown the form keys are off; F2 returns to the list with an empty form', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    await runMenuItem('Performans raporu');
    expect(document.querySelector('.nx-def')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await settle();
    await runMenuItem('Kampanya listesi');
    expect(rowOf('KMP-KIS').getAttribute('aria-current')).toBe('true');
    await runMenuItem('Performans raporu');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'F2' });
    });
    await settle();
    expect(within(pane()).getByRole('heading', { name: 'Kampanya oluştur' })).toBeTruthy();
  });

  it('a save refused by the server keeps the changes and shows its message', async () => {
    renderPage();
    await settle();
    await select('KMP-KIS');
    conflicts['PUT /api/sales/promotions/p1'] = 'Bu kampanya kodu firmada zaten kullanılıyor.';
    fireEvent.change(field(/^Kampanya kodu/), { target: { value: 'KMP-YIL' } });
    field(/^Kampanya kodu/).focus();
    await ctrlS();
    expect(within(pane()).getByText('Bu kampanya kodu firmada zaten kullanılıyor.')).toBeTruthy();
    expect(field(/^Kampanya kodu/).value).toBe('KMP-YIL');
    expect(within(pane()).getByText('1 alan değişti')).toBeTruthy();
  });
});
