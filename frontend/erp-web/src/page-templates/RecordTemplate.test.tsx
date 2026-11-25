import { cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { api } from '../erpApi';
import { setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { sectionColumns } from './RecordTemplate';
import { recordDefinition, recordRow } from './recordTemplateFixture';

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
