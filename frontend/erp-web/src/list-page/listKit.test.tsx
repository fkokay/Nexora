import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AlertTriangle, Package } from 'lucide-react';
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

  it('colours the card by tone and lays out at most five columns', () => {
    const cards = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, label: `Kart ${i}`, value: i, icon: Package, tone: 'warn' as const }));
    const { container } = render(<ListSummaryCards cards={cards} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--nx-summary-columns')).toBe('5');
    expect(root.querySelectorAll('.nx-summary-item.is-warn')).toHaveLength(6);
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
