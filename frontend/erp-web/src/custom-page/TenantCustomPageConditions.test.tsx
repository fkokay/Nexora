import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const tokenFor = (payload: Record<string, unknown>) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;

let writes: string[] = [];

// Kaydet komutu sayfanın komut kaydı (etki) çalıştıktan sonra etkinleşir; ilk çizimde basılan Ctrl+S'i kimse dinlemez.
const saveReady = () => waitFor(() => expect(document.querySelector('[data-command="save"]')?.getAttribute('aria-disabled')).not.toBe('true'));

function mockPage(components: unknown[], queries: unknown[] = []) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    const id = /queries\/(\w+)\/run/.exec(endpoint)?.[1] ?? endpoint;
    writes.push(id);
    return { affectedRows: 1 };
  });
}

function setup(components: unknown[], queries: unknown[] = [], token = tokenFor({ sub: 'u', role: 'TenantAdmin' })) {
  mockPage(components, queries);
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token={token} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const insertQuery = { id: 'qi', name: 'Ekle', kind: 'insert', runOn: 'manual', parameters: [{ name: 'kod', binding: '{{kod.value}}', type: 'text' }] };

beforeEach(() => { writes = []; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('TenantCustomPage koşullar, doğrulama ve sekmeler', () => {
  it('kullanici.rol comes from token role claim', async () => {
    setup([
      { id: 'h1', type: 'heading', props: { title: 'Yönetici alanı', visibleWhen: "kullanici.rol == 'TenantAdmin'" } },
      { id: 'h2', type: 'heading', props: { title: 'Kullanıcı alanı', visibleWhen: "kullanici.rol == 'TenantUser'" } },
    ], [], tokenFor({ sub: 'u', role: 'TenantUser' }));
    await screen.findByText('Kullanıcı alanı');
    expect(screen.queryByText('Yönetici alanı')).toBeNull();
  });

  it('kullanici.rol dizi talebinde ilk öğeyi kullanır', async () => {
    setup([{ id: 'h1', type: 'heading', props: { title: 'Rol: {{kullanici.rol}}' } }], [], tokenFor({ sub: 'u', role: ['TenantAdmin', 'X'] }));
    await screen.findByText('Rol: TenantAdmin');
  });

  it('disabledWhen disables button and shows reason', async () => {
    const { container } = setup([
      { id: 'in1', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod' } },
      { id: 'b1', type: 'button', props: { text: 'Gönder', actionType: 'query', queryId: 'qi', disabledWhen: 'kod.value == null', disabledReason: 'Önce kodu girin ({{kullanici.rol}})' } },
    ], [insertQuery]);
    const button = await screen.findByRole('button', { name: 'Gönder' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Önce kodu girin (TenantAdmin)');
    expect(container.querySelector('.tenant-page-disabled-reason')?.textContent).toBe('Önce kodu girin (TenantAdmin)');
    fireEvent.change(screen.getByLabelText('Kod'), { target: { value: 'A1' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Gönder' }) as HTMLButtonElement).disabled).toBe(false));
    expect(container.querySelector('.tenant-page-disabled-reason')).toBeNull();
  });

  it('invalid save jumps to first tab with error', async () => {
    const { container } = setup([
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qi' } },
      { id: 'tb', type: 'tabs', props: { tabs: ['Genel=kod', 'Diğer=not'], defaultTab: 1 } },
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', required: true } },
      { id: 'not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } },
    ], [insertQuery]);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    // Sekmenin sahiplendiği giriş üst düzeyde ayrıca çizilmez.
    expect(container.querySelectorAll('#page-input-kod')).toHaveLength(1);
    await saveReady();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true'));
    const kod = container.querySelector<HTMLInputElement>('#page-input-kod')!;
    expect(kod.closest('.tenant-page-input')?.querySelector('.tenant-page-input-error')?.textContent).toBe('Bu alan zorunludur.');
    expect(kod.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByRole('tab')[0].classList.contains('is-error')).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(kod));
    expect(writes).toEqual([]);
    expect(api.mock.calls.some(([endpoint]) => String(endpoint).includes('/queries/'))).toBe(false);
    // Geçerli değer girilince ileti ve sekme işareti kalkar; kayıt gider.
    fireEvent.change(kod, { target: { value: 'A1' } });
    await waitFor(() => expect(container.querySelector('.tenant-page-input-error')).toBeNull());
    expect(screen.getAllByRole('tab')[0].classList.contains('is-error')).toBe(false);
    await saveReady();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(writes).toEqual(['qi']));
  });

  it('tab error badge ignores inputs that are no longer validated', async () => {
    const { container } = setup([
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qi' } },
      { id: 'gz', type: 'input', name: 'gizle', props: { inputType: 'checkbox', label: 'Gizle' } },
      { id: 'tb', type: 'tabs', props: { tabs: ['Genel=kod', 'Diğer=not'] } },
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', required: true, visibleWhen: 'gizle.value == false' } },
      { id: 'not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } },
    ], [insertQuery]);
    await screen.findAllByRole('tab');
    await saveReady();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole('tab')[0].classList.contains('is-error')).toBe(true));
    expect(container.querySelector('.tenant-page-tab-badge')?.textContent).toBe('1');
    // Giriş gizlenince (doğrulanmaz) kalan iletisi sekme işaretinde sayılmaz.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gizle' }));
    await waitFor(() => expect(screen.getAllByRole('tab')[0].classList.contains('is-error')).toBe(false));
    expect(container.querySelector('.tenant-page-tab-badge')).toBeNull();
  });

  it('hidden input is not validated', async () => {
    setup([
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qi' } },
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', required: true, visibleWhen: "kullanici.rol == 'Yok'" } },
      { id: 'h', type: 'heading', props: { title: 'Başlık' } },
    ], [insertQuery]);
    await screen.findByText('Başlık');
    expect(screen.queryByLabelText('Kod')).toBeNull();
    await saveReady();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(writes).toEqual(['qi']));
  });

  it('sorgu düğmesi de doğrular ve yazmayı engeller', async () => {
    const { container } = setup([
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'number', label: 'Kod', min: 1 } },
      { id: 'b1', type: 'button', props: { text: 'Gönder', actionType: 'query', queryId: 'qi' } },
    ], [insertQuery]);
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await screen.findByText('Formda düzeltilmesi gereken alanlar var.');
    expect(container.querySelector('.tenant-page-input-error')?.textContent).toBe('En az 1 olmalıdır.');
    expect(writes).toEqual([]);
  });

  it('upperCase input upper-cases typing', async () => {
    setup([{ id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', upperCase: true, maxLength: 10 } }]);
    const input = await screen.findByLabelText('Kod') as HTMLInputElement;
    expect(input.maxLength).toBe(10);
    fireEvent.change(input, { target: { value: 'istif' } });
    await waitFor(() => expect((screen.getByLabelText('Kod') as HTMLInputElement).value).toBe('ISTIF'));
  });

  it('bulanıklaşınca ileti gösterilir (yalnız kullanıcı alanı değiştirdiyse)', async () => {
    const { container } = setup([{ id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', required: true } }]);
    const input = await screen.findByLabelText('Kod');
    expect(input.hasAttribute('required')).toBe(true);
    // Dokunulmamış alandan çıkmak (ör. pencere açılışındaki otomatik odak) ileti göstermez.
    fireEvent.focus(input);
    fireEvent.blur(input);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector('.tenant-page-input-error')).toBeNull();
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await waitFor(() => expect(container.querySelector('.tenant-page-input-error')?.textContent).toBe('Bu alan zorunludur.'));
  });

  it('untouched required input in another tab gets no error badge until the action is tried', async () => {
    const { container } = setup([
      { id: 'bar', type: 'actionBar', props: { saveQuery: 'qi' } },
      { id: 'tb', type: 'tabs', props: { tabs: ['Birimler=kod', 'Yeniden değerleme=not'] } },
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod', required: true } },
      { id: 'not', type: 'input', name: 'not', props: { inputType: 'text', label: 'Not' } },
    ], [insertQuery]);
    const kod = await screen.findByLabelText('Kod');
    fireEvent.focus(kod);
    fireEvent.blur(kod);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await waitFor(() => expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true'));
    expect(container.querySelector('.tenant-page-tab-badge')).toBeNull();
    expect(screen.getAllByRole('tab')[0].classList.contains('is-error')).toBe(false);
    await saveReady();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(container.querySelector('.tenant-page-tab-badge')?.textContent).toBe('1'));
  });

  it('select with its own empty static option shows no extra "Seçin"', async () => {
    setup([
      { id: 'ulke', type: 'input', name: 'ulke', props: { inputType: 'select', label: 'Ülke', staticOptions: ['=Türkiye (varsayılan)', 'TR=Türkiye', 'DE=Almanya'] } },
      { id: 'tur', type: 'input', name: 'tur', props: { inputType: 'select', label: 'Tür', staticOptions: ['A=Alıcı', 'S=Satıcı'] } },
    ]);
    const ulke = await screen.findByLabelText('Ülke') as HTMLSelectElement;
    expect([...ulke.options].map((option) => [option.value, option.textContent])).toEqual([['', 'Türkiye (varsayılan)'], ['TR', 'Türkiye'], ['DE', 'Almanya']]);
    const tur = screen.getByLabelText('Tür') as HTMLSelectElement;
    expect([...tur.options].map((option) => option.textContent)).toEqual(['Seçin', 'Alıcı', 'Satıcı']);
  });

  it('formCard inputs keep their label name when another kept-alive page has the same component ids', async () => {
    const components = [
      { id: 'kart', type: 'formCard', props: { title: 'Genel', inputs: ['kod', 'doviz', 'depo'] } },
      { id: 'kod', type: 'input', name: 'kod', props: { inputType: 'text', label: 'Kod' } },
      { id: 'doviz', type: 'input', name: 'doviz', props: { inputType: 'select', label: 'Döviz', staticOptions: ['TRY=TRY'] } },
      { id: 'depo', type: 'input', name: 'depo', props: { inputType: 'select', label: 'Depo', searchable: true, staticOptions: ['D1=Merkez'] } },
    ];
    mockPage(components);
    const token = tokenFor({ sub: 'u', role: 'TenantAdmin' });
    const { container } = render(
      <CommandProvider>
        <KeepAliveViews activeKey="b" openKeys={['a', 'b']}><TenantCustomPage code="p" token={token} /></KeepAliveViews>
      </CommandProvider>,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-nx-view]').length).toBeGreaterThan(0));
    // İkinci görünüm: aynı bileşen kimlikleriyle ikinci bir sayfa (ör. açık kalan başka sekme) önce belgeye girer.
    const { container: second } = render(
      <CommandProvider>
        <KeepAliveViews activeKey="c" openKeys={['c']}><TenantCustomPage code="p" token={token} /></KeepAliveViews>
      </CommandProvider>,
    );
    const page = within(second);
    const kod = await page.findByLabelText('Kod');
    expect(second.contains(kod)).toBe(true);
    expect(container.querySelector('#page-input-kod')).not.toBeNull();
    expect(second.contains(page.getByLabelText('Döviz'))).toBe(true);
    expect(second.contains(page.getByLabelText('Depo'))).toBe(true);
    expect(page.getByRole('textbox', { name: 'Kod' })).toBe(kod);
  });
});
