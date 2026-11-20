import { cleanup, fireEvent, render as renderPlain, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { PageDialog } from './PageDialog';

afterEach(cleanup);
// Açık pencere her zaman bir komut kaydı bırakır (kaydı olmayan pencere de): komut sağlayıcısı içinde çizilir.
const render = (ui: ReactElement) => renderPlain(ui, { wrapper: CommandProvider });

const owned = (id: string) => (id === 'ad' ? <label key={id}>Ad<input aria-label="Ad" /></label> : <p key={id}>{id}</p>);
const base = { id: 'd', title: 'Hareket ekle', presentation: 'dialog' as const, renderOwned: owned, ids: ['metin', 'ad'], status: null, returnFocus: null };

describe('PageDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PageDialog {...base} open={false} onClose={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('has dialog role labelled by title', () => {
    render(<PageDialog {...base} open onClose={() => undefined} status={{ tone: 'error', text: 'Olmadı.' }} />);
    const dialog = screen.getByRole('dialog', { name: 'Hareket ekle' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('metin');
    expect(screen.getByRole('alert').textContent).toBe('Olmadı.');
    expect(document.querySelector('.tenant-page-dialog-backdrop')).not.toBeNull();
  });

  it('escape and Kapat call onClose', () => {
    const onClose = vi.fn();
    render(<PageDialog {...base} open onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText('Ad'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Vazgeç' })).toBeNull();
  });

  it('focus first field on open and return on close', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [opener, setOpener] = useState<HTMLElement | null>(null);
      return <>
        <button type="button" onClick={(event) => { setOpener(event.currentTarget); setOpen(true); }}>Aç</button>
        <PageDialog {...base} open={open} onClose={() => setOpen(false)} returnFocus={opener} />
      </>;
    }
    render(<Host />);
    const openButton = screen.getByRole('button', { name: 'Aç' });
    openButton.focus();
    fireEvent.click(openButton);
    expect(document.activeElement).toBe(screen.getByLabelText('Ad'));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(openButton);
  });

  it('drawer presentation class', () => {
    render(<PageDialog {...base} presentation="drawer" open onClose={() => undefined} />);
    expect(screen.getByRole('dialog').classList.contains('is-drawer')).toBe(true);
  });

  it('size writes data-size except for the default md', () => {
    const { rerender } = render(<PageDialog {...base} open onClose={() => undefined} />);
    expect(screen.getByRole('dialog').hasAttribute('data-size')).toBe(false);
    rerender(<PageDialog {...base} size="md" open onClose={() => undefined} />);
    expect(screen.getByRole('dialog').hasAttribute('data-size')).toBe(false);
    for (const size of ['sm', 'lg', 'full'] as const) {
      rerender(<PageDialog {...base} size={size} open onClose={() => undefined} />);
      expect(screen.getByRole('dialog').getAttribute('data-size')).toBe(size);
    }
    rerender(<PageDialog {...base} presentation="drawer" size="lg" open onClose={() => undefined} />);
    expect(screen.getByRole('dialog').classList.contains('is-drawer')).toBe(true);
    expect(screen.getByRole('dialog').getAttribute('data-size')).toBe('lg');
  });

  const clickBackdrop = () => {
    const backdrop = document.querySelector('.tenant-page-dialog-backdrop')!;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
  };

  it('backdrop click does not close by default', () => {
    const onClose = vi.fn();
    render(<PageDialog {...base} open onClose={onClose} />);
    clickBackdrop();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('backdropClose closes on backdrop click only', () => {
    const onClose = vi.fn();
    render(<PageDialog {...base} backdropClose open onClose={onClose} />);
    // Clicks inside the dialog do not close it.
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    // Press inside, release on the backdrop (drag out) does not close it.
    fireEvent.mouseDown(screen.getByLabelText('Ad'));
    fireEvent.click(document.querySelector('.tenant-page-dialog-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
    clickBackdrop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdropClose never closes while a save is in flight', () => {
    const onClose = vi.fn();
    const { rerender } = render(<PageDialog {...base} backdropClose save={{ label: 'Kaydet', busy: true, run: () => undefined }} open onClose={onClose} />);
    clickBackdrop();
    expect(onClose).not.toHaveBeenCalled();
    rerender(<PageDialog {...base} backdropClose save={{ label: 'Kaydet', busy: false, run: () => undefined }} open onClose={onClose} />);
    clickBackdrop();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
