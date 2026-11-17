import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSurface, type DocumentSurfaceProps } from './DocumentSurface';
import { DocumentStatusFlow } from './DocumentStatusFlow';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import {
  DetailChain,
  DetailContext,
  DetailKeyValues,
  DetailLinesFooter,
  DetailLinesHead,
  DetailMeterRows,
  DocumentTotals,
} from '../document-detail/DocumentDetailLayout';
import { englishPatterns } from '../locales/en/document-page';
import { PurchaseInvoiceModal } from '../PurchaseInvoiceModal';
import { ConfirmDialogHost } from '../confirmDialog';
import { CommandProvider } from '../commands/CommandProvider';

let scrollTo: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  scrollTo.mockRestore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const inView = (node: ReactNode) => render(<div className="workspace-view">{node}</div>);
const surface = (props: Partial<DocumentSurfaceProps> = {}) => (
  <DocumentSurface title="Satış faturası" code="SF-0981" subtitle="Akdeniz Gıda A.Ş." onClose={() => {}} {...props}>
    {props.children ?? <p>Satırlar</p>}
  </DocumentSurface>
);
const press = (key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key, bubbles: true, ...init });
  });

describe('DocumentSurface header', () => {
  it('shows the document number with the party next to it, the type above and the status tag in the meta line', () => {
    inView(surface({ status: { label: 'Kesildi', tone: 'success' }, meta: <span>5 satır</span> }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Satış faturası SF-0981');
    const head = heading.closest('header')!;
    expect(within(head).getByText('Akdeniz Gıda A.Ş.')).toBeTruthy();
    expect(head.querySelector('.doc-surface-eyebrow')!.textContent).toContain('Satış faturası');
    const tag = within(head).getByText('Kesildi');
    expect(tag.className).toContain('doc-surface-status');
    expect(tag.className).toContain('is-success');
    expect(tag.closest('.doc-surface-meta')!.textContent).toContain('5 satır');
  });

  it('uses the same header for the detail variant (eyebrow replaces the type line)', () => {
    inView(surface({ variant: 'detail', eyebrow: 'Satış teklifi · Revizyon 2', title: 'Satış teklifi', code: 'TKL-1' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Satış teklifi TKL-1');
    expect(document.querySelector('.doc-surface-eyebrow')!.textContent).toContain('Revizyon 2');
  });

  it('shows the plain type as the title while the document number is still loading', () => {
    inView(surface({ code: undefined, subtitle: undefined }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Satış faturası');
    expect(heading.textContent).not.toContain('…');
  });

  it('keeps page-passed header buttons in the legacy actions slot and shows Vazgeç only when asked', () => {
    const onCancel = vi.fn();
    inView(surface({ actions: <button type="button">Kabul et</button>, onCancel }));
    const legacy = document.querySelector('.doc-surface-actions')!;
    expect(within(legacy as HTMLElement).getByRole('button', { name: 'Kabul et' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onCancel).toHaveBeenCalledOnce();
    cleanup();
    inView(surface());
    expect(screen.queryByRole('button', { name: 'Vazgeç' })).toBeNull();
    expect(document.querySelector('.doc-surface-actions')).toBeNull();
  });

  it('shows the unsaved change count', () => {
    inView(surface({ dirty: 3 }));
    expect(screen.getByText('3 değişiklik kaydedilmedi')).toBeTruthy();
    cleanup();
    inView(surface({ dirty: true }));
    expect(screen.getByText('Kaydedilmemiş değişiklik var')).toBeTruthy();
    cleanup();
    inView(surface({ dirty: 0 }));
    expect(document.querySelector('.doc-surface-dirty')).toBeNull();
  });

  it('renders the status flow slot between the title and the right side', () => {
    inView(
      surface({
        statusFlow: <DocumentStatusFlow steps={[{ key: 'Open', label: 'Açık' }, { key: 'Fulfilled', label: 'Tamamlandı' }]} current="Open" />,
      }),
    );
    const flow = document.querySelector('.doc-surface-head .doc-surface-flow')!;
    expect(within(flow as HTMLElement).getByText('Açık').closest('li')!.getAttribute('aria-current')).toBe('step');
  });

  it('keeps the action bar slot right after the header', () => {
    inView(surface());
    expect(document.querySelector('.doc-surface-head + [data-nx-action-bar-slot]')).not.toBeNull();
  });
});

describe('DocumentStatusFlow', () => {
  const steps = [
    { key: 'Draft', label: 'Taslak' },
    { key: 'Sent', label: 'İletildi' },
    { key: 'Accepted', label: 'Kabul edildi' },
  ];
  const stepOf = (label: string) => screen.getByText(label).closest('li')!;

  it('numbers the steps, marks earlier ones done and the current one as the current step', () => {
    render(<DocumentStatusFlow steps={steps} current="Sent" />);
    expect(screen.getByRole('list', { name: 'Durum akışı' })).toBeTruthy();
    expect(stepOf('Taslak').className).toContain('is-done');
    expect(stepOf('İletildi').className).toContain('is-current');
    expect(stepOf('İletildi').getAttribute('aria-current')).toBe('step');
    expect(stepOf('Kabul edildi').className).not.toMatch(/is-(done|current)/);
    expect(stepOf('Kabul edildi').textContent).toContain('3');
  });

  it('shows the terminal state as a grey end step only while the document is in it', () => {
    const { rerender } = render(<DocumentStatusFlow steps={steps} current="Sent" terminal={{ key: 'Rejected', label: 'Reddedildi' }} />);
    expect(screen.queryByText('Reddedildi')).toBeNull();
    rerender(<DocumentStatusFlow steps={steps} current="Rejected" terminal={{ key: 'Rejected', label: 'Reddedildi' }} />);
    const end = stepOf('Reddedildi');
    expect(end.className).toContain('is-terminal');
    expect(end.getAttribute('aria-current')).toBe('step');
    expect(document.querySelectorAll('.is-current, .is-done')).toHaveLength(0);
  });
});

describe('DocumentSurface record navigation', () => {
  it('steps with PgUp / PgDn and the buttons, disabled steps carry their reason', () => {
    const onNext = vi.fn();
    inView(surface({ recordNav: { index: 1, total: 4, onNext, prevDisabledReason: 'Listenin başı' } }));
    const group = screen.getByRole('group', { name: 'Belgeler arası gezinme' });
    expect(group.textContent).toContain('1 / 4');
    const prev = within(group).getByRole('button', { name: 'Önceki belge' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(prev.title).toBe('Listenin başı');
    fireEvent.click(within(group).getByRole('button', { name: 'Sonraki belge' }));
    press('PageDown');
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.doc-surface-foot')!.textContent).toContain('PgUp/PgDn önceki/sonraki belge');
  });

  it('leaves PgUp / PgDn to text fields, to a stacked surface on top and to an open drawer', () => {
    const onNext = vi.fn();
    const { rerender } = render(
      <div className="workspace-view">
        {surface({ recordNav: { index: 1, total: 4, onNext }, children: <input aria-label="Not" /> })}
      </div>,
    );
    press('PageDown', {}, screen.getByLabelText('Not'));
    expect(onNext).not.toHaveBeenCalled();
    // Order → invoice: only the topmost document answers.
    rerender(
      <div className="workspace-view">
        {surface({ recordNav: { index: 1, total: 4, onNext } })}
        <DocumentSurface title="Satış faturası" code="SF-2" onClose={() => {}}><p>Üstteki</p></DocumentSurface>
      </div>,
    );
    press('PageDown');
    expect(onNext).not.toHaveBeenCalled();
    rerender(
      <div className="workspace-view">
        {surface({ recordNav: { index: 1, total: 4, onNext }, children: <div role="dialog" aria-modal="true">Ödeme</div> })}
      </div>,
    );
    press('PageDown');
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('DocumentSurface context panel', () => {
  // The panel follows the surface's own width (not the viewport): a fake ResizeObserver reports it.
  let width = 0;
  const observers: Array<() => void> = [];
  beforeEach(() => {
    width = 0;
    observers.length = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const w = this.classList.contains('doc-surface') ? width : 0;
      return { width: w, height: 0, x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, toJSON: () => ({}) } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: () => void) { observers.push(() => this.callback()); }
      observe() {} unobserve() {} disconnect() {}
    });
  });
  const resize = (next: number) => act(() => {
    width = next;
    observers.forEach((notify) => notify());
  });
  const aside = () => screen.getByText('Cari özeti').closest('aside')!;

  it('opens from 1100px, closes only below 1060px and keeps its state while the view is hidden', () => {
    width = 1080;
    inView(surface({ aside: <p>Cari özeti</p> }));
    expect(aside().hidden).toBe(true);
    resize(1100);
    expect(aside().hidden).toBe(false);
    resize(1070);
    expect(aside().hidden).toBe(false);
    resize(0);
    expect(aside().hidden).toBe(false);
    resize(1000);
    expect(aside().hidden).toBe(true);
  });

  it('Ctrl+. toggles it and the footer lists the key', () => {
    width = 1000;
    inView(surface({ aside: <p>Cari özeti</p> }));
    expect(aside().getAttribute('aria-label')).toBe('Bağlam paneli');
    press('.', { ctrlKey: true });
    expect(aside().hidden).toBe(false);
    press('.', { ctrlKey: true });
    expect(aside().hidden).toBe(true);
    expect(document.querySelector('.doc-surface-foot')!.textContent).toContain('Ctrl+. bağlam paneli');
  });

  it('leaves Ctrl+. to a record form that has the focus inside the document', () => {
    width = 1000;
    inView(surface({ aside: <p>Cari özeti</p>, children: <div className="record-form"><input aria-label="Tutar" /></div> }));
    const field = screen.getByLabelText('Tutar');
    field.focus();
    press('.', { ctrlKey: true }, field);
    expect(aside().hidden).toBe(true);
  });
});

describe('DocumentSurface footer', () => {
  it('lists the page hints and the status, and is not drawn when there is nothing to show', () => {
    inView(surface({ hints: ['Ctrl+Shift+Enter satır ekle'], footerStatus: <span>Genel toplam <b>66.857,70</b></span> }));
    const foot = document.querySelector('.doc-surface-foot')!;
    expect(foot.textContent).toContain('Ctrl+Shift+Enter satır ekle');
    expect(foot.textContent).toContain('Genel toplam 66.857,70');
    cleanup();
    inView(surface());
    expect(document.querySelector('.doc-surface-foot')).toBeNull();
  });
});

describe('DocumentSurface footer keys', () => {
  it('draws repeated hints without a React key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    inView(surface({ hints: ['Enter aç', 'Enter aç'] }));
    expect(document.querySelectorAll('.doc-surface-keys > span')).toHaveLength(2);
    expect(errors.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
  });
});

describe('Kit CSS', () => {
  const pageCss = readFileSync(resolve(__dirname, 'document-page.css'), 'utf8');
  const detailCss = readFileSync(resolve(__dirname, '..', 'document-detail', 'document-detail.css'), 'utf8');
  it('keeps the screen-reader-only texts hidden with #root specificity (legacy body styles cannot reveal them)', () => {
    expect(pageCss).toMatch(/#root \.doc-surface \.doc-surface-sr/);
    expect(pageCss).toMatch(/#root \.doc-surface \.dd-sr/);
  });
  it('lays the header fields out by the width of their own card (container query), not the viewport', () => {
    expect(detailCss).toMatch(/container-type:\s*inline-size/);
    expect(detailCss).toMatch(/@container dd-info \(max-width:/);
    expect(detailCss).not.toMatch(/@media[^{]*\{[^}]*\.dd-info/);
  });
});

describe('Document body parts', () => {
  it('DocumentTotals emphasises the grand total and indents the VAT breakdown rows', () => {
    render(
      <DocumentTotals
        rows={[
          { label: 'Brüt tutar', value: '59.805,00' },
          { label: 'Satır iskontoları', value: '−2.974,25', emphasis: 'negative' },
          { label: 'KDV %20 · matrah 43.438,75', value: '8.687,75', emphasis: 'sub' },
          { label: 'KDV %10 · matrah 13.392,00', value: '1.339,20', emphasis: 'sub' },
          { label: 'Genel toplam', value: '66.857,70', emphasis: 'grand' },
        ]}
      />,
    );
    const totals = screen.getByLabelText('Belge toplamları');
    expect(screen.getByText('Genel toplam').closest('div')!.className).toBe('is-grand');
    expect(totals.querySelectorAll('.is-sub')).toHaveLength(2);
    expect(screen.getByText('−2.974,25').closest('div')!.className).toBe('is-negative');
  });

  it('DetailLinesFooter renders its totals with DocumentTotals', () => {
    render(<DetailLinesFooter totals={[{ label: 'Genel toplam', value: '10,00', emphasis: 'grand' }]} />);
    expect(screen.getByLabelText('Belge toplamları').classList.contains('dd-totals')).toBe(true);
  });

  it('DetailLinesHead shows the title, the summary and the line keys', () => {
    render(<DetailLinesHead title="Satırlar" meta="5 satır · 1 uyarı" hints={[{ keys: 'Ctrl+Shift+Enter', label: 'satır ekle' }]} />);
    expect(screen.getByRole('heading', { name: 'Satırlar' })).toBeTruthy();
    expect(screen.getByText('5 satır · 1 uyarı')).toBeTruthy();
    expect(screen.getByText('Ctrl+Shift+Enter').tagName).toBe('KBD');
  });

  it('DetailChain marks this document and opens the others', () => {
    const open = vi.fn();
    render(
      <DetailChain
        items={[
          { key: 'o', code: 'SS-0411', label: 'Satış siparişi', meta: '12.11.2026', status: { label: 'Tamamlandı', tone: 'success' }, onOpen: open },
          { key: 'i', code: 'SF-0981', label: 'Satış faturası', current: true, status: { label: 'Kesildi', tone: 'success' } },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /SS-0411/ }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByText('SF-0981').closest('li')!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('list', { name: 'Belge zinciri' })).toBeTruthy();
  });

  it('DetailChain shows a linked document without a number by its kind only', () => {
    render(<DetailChain items={[{ key: 'self', code: 'SI-1', label: 'Satış irsaliyesi', current: true }, { key: 'inv', label: 'Satış faturası', status: { label: 'Kesildi', tone: 'success' } }]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1].textContent).toContain('Satış faturası');
    expect(items[1].querySelector('.dd-chain-code')).toBeNull();
  });

  it('DetailContext, DetailKeyValues and DetailMeterRows draw a context section', () => {
    render(
      <DetailContext title="Stok durumu" hint="aktif satır · AMB-1510">
        <DetailMeterRows rows={[{ label: 'Merkez Depo', value: '1.800', share: 0.75 }]} />
        <DetailKeyValues items={[{ label: 'Rezerve', value: '350' }]} />
      </DetailContext>,
    );
    const section = screen.getByRole('region', { name: 'Stok durumu' });
    expect(within(section).getByText('aktif satır · AMB-1510')).toBeTruthy();
    expect(within(section).getByText('Merkez Depo').closest('div')!.querySelector('i')!.style.width).toBe('75%');
    expect(within(section).getByText('Rezerve').tagName).toBe('DT');
  });

  it('DocumentStatusBadge keeps its tone class for list cells', () => {
    render(<DocumentStatusBadge status={{ label: 'İptal', tone: 'neutral' }} />);
    expect(screen.getByText('İptal').className).toBe('doc-status is-neutral');
  });
});

describe('English text', () => {
  it('translates the unsaved change count', () => {
    const match = englishPatterns.find(([pattern]) => pattern.test('3 değişiklik kaydedilmedi'));
    expect(match && '3 değişiklik kaydedilmedi'.replace(match[0], match[1])).toBe('3 unsaved changes');
  });
});

describe('Purchasing document on the restyled kit', () => {
  const invoice = {
    id: 'pi1', code: 'AF-0042', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0007', receiptId: 'r1', receiptCode: 'MK-0009',
    supplierId: 's1', supplierName: 'Ege Ambalaj Ltd.', invoiceDate: '2026-11-10', dueDate: '2026-12-10', currencyCode: 'TRY',
    status: 'Posted', grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200, lineCount: 1, createdAt: '2026-11-10',
    subtotal: 1000, discountTotal: 0, taxTotal: 200, providerInvoiceUuid: null, providerScenario: null, providerInvoiceTypeCode: null,
    providerSenderAlias: null, accountingProfileCode: null,
    lines: [{ id: 'l1', purchaseReceiptLineId: 'rl1', orderLineNumber: 1, stockItemId: 'st1', stockCode: 'AMB-2040', stockName: 'Koli 40×30×30',
      unitCode: 'ADET', quantity: 100, unitPrice: 10, discountPercent: 0, vatPercent: 20, lineSubtotal: 1000, discountAmount: 0, taxAmount: 200, lineTotal: 1200 }],
    payments: [], returns: [],
  };
  const accounts = [{ id: 'a1', code: 'BNK-01', name: 'Ana banka', type: 'Bank', currencyCode: 'TRY', balance: 5000, isActive: true }];

  it('shows the header, line grid and totals, and still saves a payment from its drawer', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      const path = url.split('?')[0];
      const json = path === '/api/finance/accounts' ? accounts : path.endsWith('/payments') ? { id: 'p1' } : path.startsWith('/api/purchasing/invoices/') ? invoice : [];
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const onChanged = vi.fn(async () => {});
    render(
      <CommandProvider>
        <div className="workspace-view">
          <ConfirmDialogHost />
          <PurchaseInvoiceModal invoiceId="pi1" token="t" warehouses={[{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true } as never]} onClose={() => {}} onChanged={onChanged} />
        </div>
      </CommandProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Alış faturası AF-0042'));
    const head = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(head).getByText('Ege Ambalaj Ltd.')).toBeTruthy();
    expect(within(head).getByText('İşlendi').className).toContain('is-success');
    const grid = screen.getByRole('table', { name: 'Fatura satırları' });
    expect(within(grid).getByText('AMB-2040')).toBeTruthy();
    const totals = screen.getByLabelText('Fatura toplamları');
    expect(totals.classList.contains('dd-totals')).toBe(true);
    const row = (label: string) => within(totals).getByText(label).closest('div')!;
    expect(row('Ara toplam').querySelector('dd')!.textContent).toMatch(/^1\.000,00/);
    expect(row('KDV %20').querySelector('dd')!.textContent).toMatch(/^200,00/);
    expect(row('Genel toplam').className).toBe('is-grand');
    expect(row('Genel toplam').querySelector('dd')!.textContent).toMatch(/^1\.200,00/);
    expect(within(grid).getByText('1.000,00').closest('td')!.className).toBe('dd-num');

    fireEvent.click(within(head).getAllByRole('button', { name: /Ödeme ekle/ })[0]);
    const drawer = await screen.findByRole('dialog', { name: 'Tedarikçi ödemesi' });
    fireEvent.change(within(drawer).getByLabelText(/Tutar/), { target: { value: '500' } });
    fireEvent.change(within(drawer).getByLabelText(/Banka hesabı/), { target: { value: 'a1' } });
    fireEvent.submit(drawer.querySelector('form')!);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/purchasing/invoices/pi1/payments')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(JSON.parse(post.body!)).toMatchObject({ amount: 500, paymentMethod: 'Bank transfer', financialAccountId: 'a1' });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
