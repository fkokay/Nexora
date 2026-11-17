import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FormCard } from './LayoutComponents';

afterEach(cleanup);

describe('FormCard', () => {
  it('başlığı yazar ve sütun sayısına göre ızgara sınıfı verir', () => {
    const { container } = render(<FormCard title="Filtreler" columns={3} style={{}}><div>a</div></FormCard>);
    expect(screen.getByText('Filtreler')).toBeTruthy();
    expect(container.querySelector('.tenant-page-form-card-grid')!.classList.contains('is-cols-3')).toBe(true);
  });

  it('çocukları ızgara içinde çizer', () => {
    const { container } = render(<FormCard title="F" columns={2} style={{}}><div>a</div><div>b</div></FormCard>);
    expect(container.querySelector('.tenant-page-form-card-grid')!.children.length).toBe(2);
    expect(container.querySelector('.is-cols-2')).not.toBeNull();
  });

  it('başlık boşsa başlık çizmez', () => {
    const { container } = render(<FormCard title="" columns={1} style={{}}><div>a</div></FormCard>);
    expect(container.querySelector('h3')).toBeNull();
  });
});
