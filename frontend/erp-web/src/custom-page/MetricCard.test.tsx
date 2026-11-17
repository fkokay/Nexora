import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetricCard } from './MetricCard';

afterEach(cleanup);

const card = (props: Partial<Parameters<typeof MetricCard>[0]> = {}) => render(
  <MetricCard title="Gecikmiş" value={<strong>12</strong>} description="30 gün üstü" tone="info" style={{}} {...props} />,
);

describe('MetricCard', () => {
  it('ton sınıfını ve ikon kutusunu çizer', () => {
    const { container } = card({ tone: 'danger', icon: 'alert' });
    expect(container.firstElementChild!.classList.contains('tone-danger')).toBe(true);
    expect(container.querySelector('.tenant-metric-icon svg')).not.toBeNull();
  });

  it('ikon verilmezse veya bilinmiyorsa ikon kutusu çizilmez', () => {
    expect(card().container.querySelector('.tenant-metric-icon')).toBeNull();
    cleanup();
    expect(card({ icon: 'nope' }).container.querySelector('.tenant-metric-icon')).toBeNull();
  });

  it('etiket, değer ve açıklamayı yazar', () => {
    const { container } = card();
    expect(container.textContent).toContain('Gecikmiş');
    expect(container.querySelector('strong')!.textContent).toBe('12');
    expect(container.textContent).toContain('30 gün üstü');
  });

  it('eğilim çizgisi iki ve daha çok noktada çizilir', () => {
    const { container } = card({ trend: [1, 3, 2] });
    expect(container.querySelector('svg polyline')!.getAttribute('points')).toBeTruthy();
  });

  it('tek noktalı eğilimde svg çizilmez', () => {
    expect(card({ trend: [4] }).container.querySelector('.tenant-metric-trend')).toBeNull();
  });

  it('onActivate ile tıklanır, aria-pressed active değerini yansıtır', () => {
    const onActivate = vi.fn();
    const { rerender } = card({ onActivate, active: false });
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(3);
    rerender(<MetricCard title="G" value="1" description="" tone="info" style={{}} onActivate={onActivate} active />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button').classList.contains('is-active')).toBe(true);
  });

  it('onActivate yoksa role=button yoktur', () => {
    card();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('iç düğmeye tıklama onActivate çağırmaz', () => {
    const onActivate = vi.fn();
    card({ onActivate, value: <button type="button">Yeniden dene</button> });
    fireEvent.click(screen.getByText('Yeniden dene'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('hasError iken kart etkileşimli değildir', () => {
    const onActivate = vi.fn();
    const { container } = card({ onActivate, hasError: true });
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(container.firstElementChild!);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
