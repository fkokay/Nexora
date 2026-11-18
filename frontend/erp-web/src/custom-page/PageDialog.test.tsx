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
});
