import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { api } from '../erpApi';
import { setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { freeComponents, freeDefinition, freeTabbedComponents } from './freeTemplateFixture';
import { recordDefinition, recordRow } from './recordTemplateFixture';

// Serbest gövde: kabuk → işlem çubuğu → (sekmeler) → bölümler; bölüm başlığı, kolonlu ızgara ve üyeler.

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });

vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

const publish = (definition: unknown, listRun: () => Promise<unknown> = async () => ({ columns: [{ code: 'Belge', label: 'Belge' }], rows: [{ Belge: 'TK-1042' }], rowCount: 1, truncated: false })) =>
  mockedApi.mockImplementation(async (endpoint: string) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Satış panosu', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } } as never;
    if (endpoint.includes('/queries/liste/run')) return listRun() as never;
    if (endpoint.includes('/queries/kayit/run')) return { columns: [], rows: [recordRow], rowCount: 1, truncated: false } as never;
    return { columns: [], rows: [], rowCount: 0, truncated: false } as never;
  });

beforeEach(() => {
  localStorage.clear();
  mockedApi.mockReset();
  publish(freeDefinition());
});
afterEach(() => { cleanup(); setPageParams('custom-page:p', {}); vi.unstubAllGlobals(); });

const T = { timeout: 5000 };
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const PLACEHOLDER = 'Bu bölüme bileşen ekleyin.';

describe('serbest gövde kalıbı', () => {
  it('FreeTemplate renders shell actions, tab bar and sections', async () => {
    publish(freeDefinition(freeTabbedComponents));
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Merhaba serbest gövde', undefined, T);
    const page = container.querySelector('.free-template-page')!;
    expect(page).toBeTruthy();
    // Eski 12 sütunlu içerik ızgarası ve eski başlık satırı kullanılmaz; başlık bir kez.
    expect(container.querySelector('.tenant-custom-page-content')).toBeNull();
    expect(container.querySelector('.tenant-custom-page-header')).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Satış panosu' })).toHaveLength(1);
    const bar = page.querySelector('.page-shell-bar')!;
    const left = [...bar.querySelectorAll('.page-shell-bar-left button')];
    expect(left.map((button) => button.textContent)).toEqual(['Dışa aktar', 'Yenile']);
    expect(left[0].className).toContain('page-shell-action--primary');
    const tabs = page.querySelector('.tenant-page-tabs')!;
    expect(before(bar, tabs)).toBe(true);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Genel', 'Diğer']);
    // Etkin sekmede Özet bölümü: başlık h3, üç üye.
    const section = tabs.querySelector('.free-section')!;
    expect(section.querySelector('h3')!.textContent).toBe('Özet');
    expect(section.querySelectorAll('.free-cell')).toHaveLength(3);
    expect(await screen.findByText('TK-1042', undefined, T)).toBeTruthy();
    // Düğmeler bölümde ayrıca çizilmez.
    expect(page.querySelector('.page-shell-body .tenant-page-action')).toBeNull();
  });

  it('tabless page draws sections in order', async () => {
    publish(freeDefinition([...freeComponents, { id: 'blk3', type: 'section', props: { slot: 'block', title: 'Notlar', members: ['m_not'] } },
      { id: 'm_not', type: 'text', props: { slot: 'item', text: 'Not metni' } }]));
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Not metni', undefined, T);
    expect(container.querySelector('.tenant-page-tabs')).toBeNull();
    // Boş bölüm canlıda çizilmez.
    expect([...container.querySelectorAll('.free-section > h3')].map((h) => h.textContent)).toEqual(['Özet', 'Notlar']);
  });

  it('tab is chosen by the tab page parameter', async () => {
    publish(freeDefinition([...freeTabbedComponents.filter((c) => c.id !== 'blk2'),
      { id: 'blk2', type: 'section', props: { slot: 'block', title: 'Ayrıntı', members: ['m_not'] } },
      { id: 'm_not', type: 'text', props: { slot: 'item', text: 'Diğer sekmenin metni' } }]));
    setPageParams('custom-page:p', { sekme: 'Diğer' });
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Diğer' }).getAttribute('aria-selected')).toBe('true'), T);
    expect(screen.getByText('Diğer sekmenin metni')).toBeTruthy();
  });

  it('empty block renders placeholder only on canvas', async () => {
    const live = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Merhaba serbest gövde', undefined, T);
    expect(screen.queryByText(PLACEHOLDER)).toBeNull();
    expect(screen.queryByText('Boş bölüm')).toBeNull();
    expect(live.container.querySelectorAll('.free-section')).toHaveLength(1);
    live.unmount();
    const { container } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    expect(await screen.findByText(PLACEHOLDER, undefined, T)).toBeTruthy();
    const empty = screen.getByText(PLACEHOLDER).closest('.free-section')!;
    expect(empty.querySelector('h3')!.textContent).toBe('Boş bölüm');
    expect(container.querySelectorAll('.free-section')).toHaveLength(2);
  });

  it('dataTable member spans full row', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('TK-1042', undefined, T);
    const cellOf = (text: string) => screen.getByText(text).closest('.free-cell')!;
    expect(cellOf('TK-1042').className).toContain('is-full');
    expect(cellOf('Merhaba serbest gövde').className).not.toContain('is-full');
    expect(cellOf('Açık teklif').className).not.toContain('is-full');
    // Hücre ızgaranın doğrudan çocuğudur: bileşenin kendi `grid-column`'u ızgaraya karışmaz.
    for (const cell of container.querySelectorAll('.free-cell')) expect(cell.parentElement!.classList.contains('free-section-grid')).toBe(true);
    const css = readFileSync(resolve(process.cwd(), 'src/page-templates/page-templates.css'), 'utf8');
    expect(css).toMatch(/\.free-template-page \.free-cell\.is-full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(css).toMatch(/\.free-template-page \.free-cell\.is-full\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('free item table is read-only: no search, filters, column chooser or pivot', async () => {
    render(<TenantCustomPage code="p" token="t" />);
    const cell = (await screen.findByText('TK-1042', undefined, T)).closest('.free-cell')!;
    expect(cell.querySelector('input[type=search]')).toBeNull();
    // Yazdır ve tam ekran gibi görünüm düğmeleri kalabilir; arama, süzgeç, kolon seçici, pivot ve dışa aktarım yok.
    const tools = [...cell.querySelectorAll('[data-grid-tool]')].map((tool) => tool.getAttribute('title') ?? tool.textContent);
    expect(tools).not.toContain('Pivot görünümü');
    expect([...cell.querySelectorAll('button')].map((b) => b.textContent)).not.toEqual(expect.arrayContaining(['XLSX']));
    expect(cell.querySelector('.advanced-grid-search')).toBeNull();
    expect(cell.querySelector('.advanced-grid-menu')).toBeNull();
    expect(cell.textContent).not.toMatch(/Pivot|Filtre|Sütunlar/);
  });

  it('blocks and members carry canvas anchors', async () => {
    publish(freeDefinition(freeTabbedComponents));
    const { container } = render(<CanvasAnchorContext.Provider value={true}><TenantCustomPage code="p" token="t" /></CanvasAnchorContext.Provider>);
    await screen.findByText('Merhaba serbest gövde', undefined, T);
    const anchors = [...container.querySelectorAll('template[data-cp-anchor]')].map((anchor) => anchor.getAttribute('data-cp-anchor'));
    for (const id of ['b_aktar', 'b_yenile', 't', 't#tab0', 't#tab1', 'blk1', 'm_metin', 'm_gosterge', 'm_liste']) expect(anchors).toContain(id);
    // Bölümün işaretçisi bölüm kutusunun, üyenin işaretçisi bileşenin önünde ve hücrenin içinde.
    expect(container.querySelector('template[data-cp-anchor="blk1"]')!.nextElementSibling!.classList.contains('free-section')).toBe(true);
    for (const id of ['m_metin', 'm_gosterge', 'm_liste']) {
      const anchor = container.querySelector(`template[data-cp-anchor="${id}"]`)!;
      expect(anchor.parentElement!.classList.contains('free-cell')).toBe(true);
    }
    for (const anchor of container.querySelectorAll('template[data-cp-anchor]')) expect(anchor.nextElementSibling).toBeTruthy();
  });

  it('no anchors outside the canvas', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Merhaba serbest gövde', undefined, T);
    expect(container.querySelector('template')).toBeNull();
  });

  it('missing catalog source shows error in that member only', async () => {
    publish(freeDefinition([...freeComponents, { id: 'blk3', type: 'section', props: { slot: 'block', title: 'Notlar', members: ['m_not'] } },
      { id: 'm_not', type: 'text', props: { slot: 'item', text: 'Not metni' } }]), async () => { throw new Error('Kaynak katalogda bulunamadı.'); });
    render(<TenantCustomPage code="p" token="t" />);
    const error = await screen.findByText(/Kaynak katalogda bulunamadı/, undefined, T);
    const cell = error.closest('.free-cell')!;
    expect(cell).toBeTruthy();
    expect(cell.querySelector('[role=alert]')).toBeTruthy();
    // Bölümün diğer üyeleri ve diğer bölüm çizilir.
    expect(screen.getByText('Merhaba serbest gövde').closest('.free-cell')).not.toBe(cell);
    expect(screen.getByText('Açık teklif')).toBeTruthy();
    expect(screen.getByText('Not metni')).toBeTruthy();
  });

  it('list and record pages render as before', async () => {
    publish(recordDefinition());
    setPageParams('custom-page:p', { kod: 'C-1001' });
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Akdeniz Gıda A.Ş.', { selector: 'b' }, T);
    expect(container.querySelector('.record-template-page')).toBeTruthy();
    expect(container.querySelector('.free-template-page')).toBeNull();
    expect(container.querySelector('.free-section')).toBeNull();
  });

  it('free page without blocks falls back to the legacy layout', async () => {
    publish(freeDefinition([{ id: 'm_metin', type: 'text', props: { text: 'Eski metin' } }]));
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await screen.findByText('Eski metin', undefined, T);
    expect(container.querySelector('.free-template-page')).toBeNull();
    expect(container.querySelector('.tenant-custom-page-content')).toBeTruthy();
  });
});
