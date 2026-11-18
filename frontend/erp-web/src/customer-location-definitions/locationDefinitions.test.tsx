import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { CustomerLocationDefinitionsPage } from '../CustomerLocationDefinitionsPage';
import { ShellNoticeToast } from '../shell/ShellNoticeToast';

const definitions = {
  provinces: [
    { id: 6, name: 'Ankara', isActive: true },
    { id: 75, name: 'Ardahan', isActive: false },
    { id: 34, name: 'İstanbul', isActive: true },
  ],
  districts: [
    { id: 1, provinceId: 6, name: 'Çankaya', isActive: true },
    { id: 2, provinceId: 6, name: 'Evren', isActive: false },
    { id: 3, provinceId: 34, name: 'Kadıköy', isActive: true },
  ],
};

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockReset();
  localStorage.clear();
});

function respond(url: string, init?: RequestInit) {
  if (url === '/api/location-definitions/admin') return definitions;
  if (url.startsWith('/api/screen-views/')) throw new Error('none');
  if (init?.method === 'POST' && url === '/api/location-definitions/provinces') return { id: 99, name: 'Yeni', isActive: true };
  if (init?.method === 'POST' && url === '/api/location-definitions/districts') return { id: 9, provinceId: 6, name: 'Gölbaşı', isActive: true };
  return {};
}

async function renderPage() {
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
  render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <CustomerLocationDefinitionsPage token="t" />
      </KeepAliveViews>
    </CommandProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: /Ankara/ })).toBeTruthy());
}
const provincePanel = () => screen.getByRole('region', { name: 'İller' });
const provinceList = () => screen.getByRole('list', { name: 'İl listesi' });
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;

describe('Adres tanımları', () => {
  it('shows provinces on the left and the selected province’s districts on the right; no form is open', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: /Adres tanımları/ })).toBeTruthy();
    expect(within(provinceList()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Ankara2', 'ArdahanPasif0', 'İstanbul1']);
    expect(screen.getByRole('button', { name: /Ankara/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Ankara ilçeleri' })).toBeTruthy();
    expect(screen.getByText('Çankaya')).toBeTruthy();
    expect(screen.queryByText('Kadıköy')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /İstanbul/ }));
    expect(screen.getByRole('heading', { name: 'İstanbul ilçeleri' })).toBeTruthy();
    expect(screen.getByText('Kadıköy')).toBeTruthy();
  });

  it('filters provinces by name and status', async () => {
    await renderPage();
    fireEvent.change(within(provincePanel()).getByRole('combobox', { name: 'Durum' }), { target: { value: 'inactive' } });
    expect(within(provinceList()).getAllByRole('button').map((button) => button.textContent)).toEqual(['ArdahanPasif0']);
    fireEvent.change(within(provincePanel()).getByRole('combobox', { name: 'Durum' }), { target: { value: 'all' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'İl ara' }), { target: { value: 'ist' } });
    expect(within(provinceList()).getAllByRole('button').map((button) => button.textContent)).toEqual(['İstanbul1']);
  });

  it('Yeni ilçe opens a dialog with its own Kaydet / Vazgeç; saving posts and closes it', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Yeni ilçe' }));
    const dialog = screen.getByRole('dialog', { name: 'İlçe tanımı' });
    expect((within(dialog).getByRole('combobox', { name: /İl/ }) as HTMLSelectElement).value).toBe('6');
    fireEvent.change(within(dialog).getByPlaceholderText('İlçe adı'), { target: { value: 'Gölbaşı' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Kaydet/ }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = apiMock.mock.calls.find(([url, , init]) => url === '/api/location-definitions/districts' && (init as RequestInit)?.method === 'POST');
    expect(JSON.parse(String((post![2] as RequestInit).body))).toEqual({ provinceId: 6, name: 'Gölbaşı', isActive: true });
    expect(screen.getByText('İlçe tanımı oluşturuldu.')).toBeTruthy();
  });

  it('Vazgeç closes the dialog without saving; the bar’s Yeni opens a district for the selected province', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(command('new'));
    });
    const dialog = screen.getByRole('dialog', { name: 'İlçe tanımı' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiMock.mock.calls.some(([, , init]) => (init as RequestInit | undefined)?.method)).toBe(false);
  });

  it('İli düzenle opens the province dialog filled with the selected province', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'İli düzenle' }));
    const dialog = screen.getByRole('dialog', { name: 'İl tanımı' });
    expect((within(dialog).getByPlaceholderText('İl adı') as HTMLInputElement).value).toBe('Ankara');
    expect(within(dialog).getByRole('button', { name: /^Kaydet/ })).toBeTruthy();
  });
});

describe('Shell notice toast', () => {
  it('shows the tab-limit warning as a floating status with a title and a close button', () => {
    const onDismiss = vi.fn();
    render(<ShellNoticeToast notice="Yeni ekran açmak için önce bir çalışma sekmesini kapatın." locale="tr" onDismiss={onDismiss} />);
    const toast = screen.getByRole('status');
    expect(toast.className).toContain('nx-shell-toast');
    expect(toast.className).toContain('is-warn');
    expect(toast.textContent).toContain('Sekme sınırına ulaşıldı');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders nothing without a notice; other notices have no title', () => {
    const { container, rerender } = render(<ShellNoticeToast notice="" locale="tr" onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<ShellNoticeToast notice="Kaydedildi." locale="tr" onDismiss={() => {}} />);
    expect(screen.getByRole('status').className).not.toContain('is-warn');
    expect(screen.getByRole('status').querySelector('b')).toBeNull();
  });
});
