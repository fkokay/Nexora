import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageImage } from './PageImage';

afterEach(cleanup);

describe('PageImage', () => {
  it('https url renders img with no-referrer', () => {
    const { container } = render(<PageImage url="https://cdn.example.com/a.png" alt="Ürün" height={120} fit="cover" style={{}} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('Ürün');
    expect(img.style.objectFit).toBe('cover');
    expect((container.querySelector('figure') as HTMLElement).style.height).toBe('120px');
  });

  it('javascript and data urls show Görsel yok', () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/relative.png', '', 'ftp://x/y.png']) {
      const { container, unmount } = render(<PageImage url={url} alt="" height={160} fit="contain" style={{}} />);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('Görsel yok')).toBeTruthy();
      unmount();
    }
  });

  it('load error shows Görsel yüklenemedi', () => {
    const { container, rerender } = render(<PageImage url="http://x.test/a.png" alt="A" height={160} fit="contain" style={{}} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('Görsel yüklenemedi')).toBeTruthy();
    rerender(<PageImage url="http://x.test/b.png" alt="A" height={160} fit="contain" style={{}} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://x.test/b.png');
  });
});
