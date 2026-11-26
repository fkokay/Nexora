import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider, ShellBreadcrumbRow } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { api } from '../erpApi';
import { OPEN_PAGE_EVENT, setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { KeepAliveViews } from '../WorkspaceComponents';
import { sectionColumns } from './RecordTemplate';
import { recordComponents, recordDefinition, recordRow } from './recordTemplateFixture';

// Kayıt kartı: kabuk → özet → işlem çubuğu → sekmeler; bölümler, satır tablosu ve notlar sekmelerde.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
let recordRun: () => Promise<unknown>;

beforeEach(() => {
  localStorage.clear();
  mockedApi.mockReset();
  recordRun = async () => ({ columns: [], rows: [recordRow], rowCount: 1, truncated: false });
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(recordDefinition()), rights: { view: true, insert: true, update: true, delete: true } } as never;
    if (endpoint.includes('/queries/kayit/run')) return recordRun() as never;
    if (endpoint.includes('/queries/hareket/run')) return { columns: [{ code: 'Belge', label: 'Belge' }], rows: [{ Belge: 'FT-2291' }], rowCount: 1, truncated: false } as never;
    return { items: [], total: 0 } as never;
  });
});
afterEach(() => { cleanup(); setPageParams('custom-page:p', {}); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };
const existing = () => setPageParams('custom-page:p', { kod: 'C-1001' });
/** Yayımlanan sayfanın bileşenlerini değiştirir (kayıt sorgusu C-1001'i döndürür). */
const publish = (components: unknown[]) => mockedApi.mockImplementation(async (endpoint: string) => {
  if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(recordDefinition(components)), rights: { view: true, insert: true, update: true, delete: true } } as never;
  if (endpoint.includes('/queries/kayit/run')) return { columns: [], rows: [recordRow], rowCount: 1, truncated: false } as never;
  return { columns: [], rows: [], rowCount: 0, truncated: false } as never;
});
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('kayıt kartı kalıbı', () => {
  it('record template renders shell, summary, bar, tabs in order', async () => {
    existing();
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    const page = container.querySelector('.record-template-page')!;
    expect(page).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'Cari kartı' });
    const crumbs = page.querySelector('.page-shell-crumbs')!;
    const summary = page.querySelector('.tenant-page-record-header')!;
    const bar = page.querySelector('.page-shell-bar')!;
    const tabs = page.querySelector('.tenant-page-tabs')!;
    for (const element of [crumbs, summary, bar, tabs]) expect(element).toBeTruthy();
    expect(before(crumbs, heading) || before(heading, crumbs)).toBe(true);
    expect(before(heading, summary)).toBe(true);
    expect(before(summary, bar)).toBe(true);
    expect(before(bar, tabs)).toBe(true);
    expect(crumbs.textContent).toContain('Cari kartı');
    // Bölüm ve not birinci sekmede, satır tablosu ikincide.
    const panels = tabs.querySelectorAll('[role=tabpanel]');
    expect(panels[0].textContent).toContain('Kimlik');
    expect(panels[0].textContent).toContain('Kredi limiti değişiklikleri finans onayına gider.');
    expect(panels[1].textContent).toContain('Son hareketler');
    // Özet değerleri tek satırda kısaltılır, tam metin `title`'dadır.
    expect(summary.querySelector('small')!.getAttribute('title')).toBe('C-1001');
    // Eski 12 sütunlu içerik ızgarası kullanılmaz.
    expect(container.querySelector('.tenant-custom-page-content')).toBeNull();
  });

  it('save is primary on the left and delete on the right', async () => {
    existing();
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    const left = [...container.querySelectorAll('.page-shell-bar-left button')];
    expect(left.map((button) => button.textContent)).toEqual(['Kaydet', 'Ekstre al']);
    expect(left[0].className).toContain('page-shell-action--primary');
    const right = [...container.querySelectorAll('.page-shell-bar-right button')];
    expect(right.map((button) => button.textContent)).toEqual(['Sil']);
    expect(right[0].className).toContain('page-shell-action--danger');
  });

  it('new record mode hides delete and shows lines placeholder', async () => {
    recordRun = async () => ({ columns: [], rows: [], rowCount: 0, truncated: false });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    expect(await screen.findByText('Kayıt kaydedilince burada görünür.', undefined, T)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeTruthy();
    // Satır tablosu çizilmez.
    expect(container.querySelector('.record-lines table')).toBeNull();
    expect(screen.queryByText('FT-2291')).toBeNull();
    expect(container.querySelector('.record-skeleton')).toBeNull();
  });

  it('missing catalog column leaves field empty and card renders', async () => {
    existing();
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect((screen.getByLabelText('Unvan') as HTMLInputElement).value).toBe('Akdeniz Gıda A.Ş.'), T);
    expect((screen.getByLabelText('Adres') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Cari kodu') as HTMLInputElement).value).toBe('C-1001');
  });

  it('skeleton shows while record query loads', async () => {
    existing();
    let resolve!: (value: unknown) => void;
    recordRun = () => new Promise((done) => { resolve = done; });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(container.querySelector('.record-section .record-skeleton')).toBeTruthy(), T);
    expect(container.querySelector('.record-section')!.getAttribute('aria-busy')).toBe('true');
    resolve({ columns: [], rows: [recordRow], rowCount: 1, truncated: false });
    await waitFor(() => expect(container.querySelector('.record-skeleton')).toBeNull(), T);
    expect((screen.getByLabelText('Unvan') as HTMLInputElement).value).toBe('Akdeniz Gıda A.Ş.');
  });

  it('re-running the record query keeps the sections and shows no skeleton', async () => {
    existing();
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect((screen.getByLabelText('Unvan') as HTMLInputElement).value).toBe('Akdeniz Gıda A.Ş.'), T);
    let resolve!: (value: unknown) => void;
    recordRun = () => new Promise((done) => { resolve = done; });
    const runs = () => mockedApi.mock.calls.filter(([endpoint]) => String(endpoint).includes('/queries/kayit/run')).length;
    const first = runs();
    // Başka sayfanın kayıttan sonra yenileme isteği bu sayfanın açılış sorgularını yeniden çalıştırır.
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_PAGE_EVENT, { detail: { page: 'custom-page:p', refresh: true, from: 'custom-page:liste' } })); });
    await waitFor(() => expect(runs()).toBe(first + 1), T);
    expect(container.querySelector('.record-skeleton')).toBeNull();
    expect(container.querySelector('.record-section')!.getAttribute('aria-busy')).toBeNull();
    expect(screen.getByLabelText('Unvan')).toBeTruthy();
    resolve({ columns: [], rows: [recordRow], rowCount: 1, truncated: false });
    await waitFor(() => expect(container.querySelector('.record-skeleton')).toBeNull());
  });

  it('record page without summary and tabs falls back to the legacy layout', async () => {
    const legacyLike = [
      { id: 's1', type: 'formCard', props: { title: 'Kimlik', inputs: ['ad'] } },
      { id: 'ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Unvan' } },
    ];
    mockedApi.mockImplementation(async (endpoint: string) => {
      if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(recordDefinition(legacyLike)), rights: { view: true, insert: true, update: true, delete: true } } as never;
      return { columns: [], rows: [], rowCount: 0, truncated: false } as never;
    });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByLabelText('Unvan', undefined, T);
    expect(container.querySelector('.record-template-page')).toBeNull();
    expect(container.querySelector('.tenant-custom-page-content')).toBeTruthy();
    expect(container.querySelector('.tenant-custom-page-header h1')!.textContent).toBe('Cari kartı');
  });

  it('tab anchors are emitted', async () => {
    existing();
    const { container } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    const anchors = [...container.querySelectorAll('template[data-cp-anchor]')].map((anchor) => anchor.getAttribute('data-cp-anchor'));
    for (const id of ['h', 't', 's1', 'n1', 'l1', 'b_kaydet', 'b_ekstre', 'b_sil', 't#tab0', 't#tab1']) expect(anchors).toContain(id);
    const tab1 = container.querySelector('template[data-cp-anchor="t#tab1"]')!;
    expect(tab1.nextElementSibling!.textContent).toBe('Hareketler');
    for (const anchor of container.querySelectorAll('template[data-cp-anchor]')) expect(anchor.nextElementSibling).toBeTruthy();
  });

  it('field anchors are emitted inside their section cells on the canvas only', async () => {
    existing();
    const { container, unmount } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    for (const id of ['kod', 'ad', 'adres']) {
      const anchor = container.querySelector(`template[data-cp-anchor="${id}"]`)!;
      expect(anchor).toBeTruthy();
      // Studio kutuyu işaretçinin ardındaki öğeden ölçer: alanın kendisi, bölüm hücresinin içinde.
      expect(anchor.nextElementSibling!.classList.contains('tenant-page-input')).toBe(true);
      expect(anchor.parentElement!.classList.contains('tenant-page-form-card-cell')).toBe(true);
      expect(anchor.closest('.record-section')).toBeTruthy();
    }
    expect(container.querySelector('template[data-cp-anchor="kod"]')!.nextElementSibling!.querySelector('input')!.id).toBe('page-input-kod');
    unmount();
    // Tuval dışında hiç işaretçi yok, hücre yalnız alanı taşır.
    const plain = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    expect(plain.container.querySelector('template')).toBeNull();
    expect(screen.getByLabelText('Cari kodu').closest('.tenant-page-form-card-cell')!.children).toHaveLength(1);
  });

  it('hidden field leaves no empty cell and no anchor on the canvas', async () => {
    existing();
    const components = recordComponents.map((component) => component.id === 'ad' ? { ...component, props: { ...component.props, visibleWhen: 'false' } } : component);
    publish(components);
    const { container } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    expect(container.querySelector('template[data-cp-anchor="ad"]')).toBeNull();
    expect(container.querySelectorAll('.record-section .tenant-page-form-card-cell')).toHaveLength(2);
  });

  it('locked key field is disabled, greyed and shows its reason as tooltip', async () => {
    existing();
    publish(recordComponents.map((component) => component.id === 'kod'
      ? { ...component, props: { ...component.props, disabledWhen: 'kayit.rows[0].Code != null', disabledReason: 'Kayıt kodu değiştirilemez.' } }
      : component.id === 'adres' ? { ...component, props: { ...component.props, readOnly: true } } : component));
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect((screen.getByLabelText('Cari kodu') as HTMLInputElement).disabled).toBe(true), T);
    const key = screen.getByLabelText('Cari kodu');
    expect(key.getAttribute('title')).toBe('Kayıt kodu değiştirilemez.');
    const wrapper = key.closest('.tenant-page-input')!;
    expect(wrapper.className).toContain('is-locked');
    expect(wrapper.getAttribute('title')).toBe('Kayıt kodu değiştirilemez.');
    // Nedeni olmayan salt okunur alan pasif ama ipucusuz; görüntüleme kipi nedeni yazılmaz.
    const address = screen.getByLabelText('Adres') as HTMLTextAreaElement;
    expect(address.disabled).toBe(true);
    expect(address.getAttribute('title')).toBeNull();
    expect(address.closest('.tenant-page-input')!.className).not.toContain('is-locked');
    // Açık alan kilitli görünmez.
    const name = screen.getByLabelText('Unvan') as HTMLInputElement;
    expect(name.disabled).toBe(false);
    expect(name.getAttribute('title')).toBeNull();
    expect(name.closest('.tenant-page-input')!.className).not.toContain('is-locked');
  });

  it('locked field style is scoped to the record template and beats the custom page override', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/page-templates/page-templates.css'), 'utf8');
    expect(css).toMatch(/\.app-shell \.tenant-custom-page \.record-template-page[^{]*:disabled[^{]*\{[^}]*background-color:\s*var\(--nx-line-soft\)\s*!important/);
  });

  it('new record summary shows the new title, unsaved subtitle and no values', async () => {
    recordRun = async () => ({ columns: [], rows: [], rowCount: 0, truncated: false });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Kayıt kaydedilince burada görünür.', undefined, T);
    const summary = container.querySelector('.record-template-summary .tenant-page-record-header')!;
    expect(summary.querySelector('b')!.textContent).toBe('Yeni Cari kartı');
    expect(summary.querySelector('small')!.textContent).toBe('Kaydedilmedi');
    expect(summary.querySelector('dl')).toBeNull();
    expect(summary.querySelector('.record-summary-avatar')!.textContent).toBe('+');
    expect(summary.textContent).not.toContain('—');
  });

  it('record shell has no visible title row; the workspace bar and breadcrumb stay out of sight', async () => {
    existing();
    const { container } = render(<ActionBarSlotProvider breadcrumb={<nav className="workspace-breadcrumb">Ana Sayfa</nav>}>
      <ShellBreadcrumbRow><nav className="workspace-breadcrumb">Ana Sayfa</nav></ShellBreadcrumbRow>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    </ActionBarSlotProvider>);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    const shell = container.querySelector('.record-template-page .page-shell')!;
    expect(shell.className).toContain('is-record');
    // Başlık yalnız ekran okuyucuya; liste başlık satırı çizilmez.
    expect(shell.querySelector('.list-v2-heading')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cari kartı' }).className).toBe('page-shell-sr-title');
    // Çalışma alanının işlem çubuğu kabuktaki (CSS ile gizli) yuvaya taşınır; çalışma alanının konum satırı hiç çizilmez.
    const slot = shell.querySelector('[data-nx-action-bar-slot]')!;
    await waitFor(() => expect(slot.querySelector('[data-nx-action-bar]')).toBeTruthy(), T);
    expect(container.querySelectorAll('.workspace-breadcrumb')).toHaveLength(0);
    expect(shell.querySelectorAll('.page-shell-crumbs')).toHaveLength(1);
    const css = readFileSync(resolve(process.cwd(), 'src/page-templates/page-templates.css'), 'utf8');
    expect(css).toMatch(/\.page-shell\.is-record \.nx-action-bar-slot\s*\{[^}]*display:\s*none/);
  });

  it('sectionColumns thresholds', () => {
    expect(sectionColumns(3, 721)).toBe(3);
    expect(sectionColumns(3, 720)).toBe(2);
    expect(sectionColumns(3, 600)).toBe(2);
    expect(sectionColumns(3, 480)).toBe(1);
    expect(sectionColumns(3, 400)).toBe(1);
    expect(sectionColumns(1, 900)).toBe(1);
    expect(sectionColumns(2, 600)).toBe(2);
    expect(sectionColumns(2, 900)).toBe(2);
  });
});
