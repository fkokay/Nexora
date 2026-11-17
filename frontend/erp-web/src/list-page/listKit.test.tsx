import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertTriangle, Package } from 'lucide-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListFooter } from './ListFooter';
import { ListPagination } from './ListPagination';
import { ListSummaryCards } from './ListSummaryCards';
import { StatusTag } from './StatusTag';

afterEach(cleanup);

describe('ListSummaryCards', () => {
  it('renders a plain card (no button) when the card has no filter', () => {
    render(<ListSummaryCards cards={[{ id: 'value', label: 'Stok değeri', value: '₺8.462.910', icon: Package }]} />);
    expect(screen.getByText('Stok değeri')).toBeTruthy();
    expect(screen.getByText('₺8.462.910')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Filtrele')).toBeNull();
  });

  it('a filter card is a toggle button that calls onFilter and shows "Filtrele"', () => {
    const onFilter = vi.fn();
    render(<ListSummaryCards cards={[{ id: 'min', label: 'Minimum altı', value: 23, icon: AlertTriangle, tone: 'bad', onFilter }]} />);
    const card = screen.getByRole('button', { name: /Minimum altı/ });
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(card.textContent).toContain('Filtrele');
    fireEvent.click(card);
    expect(onFilter).toHaveBeenCalledTimes(1);
  });

  it('the active filter card is pressed and shows "süzülüyor ✕" as separate text nodes', () => {
    render(<ListSummaryCards cards={[{ id: 'min', label: 'Minimum altı', value: 23, icon: AlertTriangle, tone: 'bad', filterActive: true, onFilter: () => {} }]} />);
    const card = screen.getByRole('button', { name: /Minimum altı/ });
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.className).toContain('is-active');
    expect(screen.getByText('süzülüyor')).toBeTruthy();
    expect(screen.getByText('✕')).toBeTruthy();
    expect(screen.queryByText('Filtrele')).toBeNull();
  });

  it('colours the card by tone; the column count does not follow the number of cards', () => {
    const cards = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, label: `Kart ${i}`, value: i, icon: Package, tone: 'warn' as const }));
    const { container } = render(<ListSummaryCards cards={cards} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('style')).toBeNull();
    expect(root.querySelectorAll('.nx-summary-item.is-warn')).toHaveLength(6);
    cleanup();
    const single = render(<ListSummaryCards cards={[cards[0]]} />).container.firstElementChild as HTMLElement;
    expect(single.getAttribute('style')).toBeNull();
  });

  it('lays the cards out in a fixed four-column grid (a single card takes one column)', () => {
    const css = readFileSync(resolve(__dirname, 'list-page-v2.css'), 'utf8');
    const rule = css.match(/#root \.nx-summary-row \{[^}]*\}/)![0];
    expect(rule).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
  });

  it('shows the hint under the value', () => {
    render(<ListSummaryCards cards={[{ id: 'a', label: 'Maliyetsiz', value: 4, icon: Package, hint: '200 adet maliyetsiz' }]} />);
    expect(screen.getByText('200 adet maliyetsiz').className).toContain('nx-summary-hint');
  });
});

describe('StatusTag', () => {
  it.each(['ok', 'warn', 'bad', 'off', 'info'] as const)('uses the %s tone class', (tone) => {
    render(<StatusTag tone={tone}>Durum</StatusTag>);
    const tag = screen.getByText('Durum');
    expect(tag.className).toContain('nx-status-tag');
    expect(tag.className).toContain(`is-${tone}`);
  });
});

describe('ListFooter', () => {
  it('renders the hints on the left and the content on the right', () => {
    const { container } = render(<ListFooter hints="↑↓ gez · Enter aç"><span>Gösterilen 4 / 4</span></ListFooter>);
    const footer = container.querySelector('.nx-list-footer') as HTMLElement;
    expect(footer).toBeTruthy();
    expect(footer.querySelector('.nx-list-footer-hints')?.textContent).toBe('↑↓ gez · Enter aç');
    expect(footer.querySelector('.nx-list-footer-end')?.textContent).toBe('Gösterilen 4 / 4');
  });

  it('keeps both regions when one is empty, so the content stays on the right', () => {
    const { container } = render(<ListFooter><span>3 seçili</span></ListFooter>);
    expect(container.querySelector('.nx-list-footer-hints')).toBeTruthy();
    expect(container.querySelector('.nx-list-footer-end')?.textContent).toBe('3 seçili');
  });
});

describe('ListPagination', () => {
  it('keeps its behaviour and gains the shared list style class', () => {
    const onPageChange = vi.fn();
    const { container } = render(<ListPagination page={2} total={60} onPageChange={onPageChange} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('table-pagination');
    expect(root.className).toContain('nx-list-pagination');
    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
  });
});

describe('grid number columns (CSS)', () => {
  it('right-aligns numeric headers and cells with an id-level rule, above the light theme table rule', () => {
    const grid = readFileSync(resolve(__dirname, '../advanced-data-grid.css'), 'utf8');
    expect(grid).toContain('#root .advanced-grid-table :is(th, td).nx-num { text-align: right; }');
    // The legacy rule it must outrank: light theme only, class-level, `text-align: left` on every table header.
    const legacy = readFileSync(resolve(__dirname, '../module-workspace.css'), 'utf8');
    const rule = legacy.match(/html:not\(\[data-theme="dark"\]\)[^{]*\.customer-table[^{]*\) th \{[^}]*\}/)![0];
    expect(rule.startsWith('#root')).toBe(false);
    expect(rule).toContain('text-align: left');
  });
});
