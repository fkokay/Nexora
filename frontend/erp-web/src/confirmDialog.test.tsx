import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmDialogHost, promptDialog } from './confirmDialog';

afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) {
    fireEvent.click(within(open).getByRole('button', { name: 'Vazgeç' }));
  }
  cleanup();
});

describe('promptDialog', () => {
  it('keeps text typed before the dialog effects run', async () => {
    render(<ConfirmDialogHost />);
    // İstem act dışında açılır: React isteği açan render'ı commit eder, pasif etkileri sonraki göreve bırakır. Gözlemci
    // (mikro görev) diyaloğu commit'in hemen ardından, etkilerden önce bildirir; kullanıcı bu aralıkta yazabilir. Eskiden
    // değeri sıfırlayan useEffect bu aralıkta yazılan gerekçeyi silerdi ve zorunlu istem gönderilemezdi (yazma olmazdı).
    const actEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    let answer!: Promise<string | null>;
    try {
      await new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector('[role="alertdialog"]')) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        answer = promptDialog({ title: 'Ters kayıt', label: 'Gerekçe', required: true, confirmLabel: 'Ters kayıt' });
      });
      const dialog = screen.getByRole('alertdialog');
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Yanlış depo' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ters kayıt' }));
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    }
    // Gerekçe korunduysa gönderim kabul edilir ve istem kapanır (eskiden "Bu alan zorunludur." ile açık kalırdı).
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await expect(answer).resolves.toBe('Yanlış depo');
  });

  it('starts each queued prompt from its own default value', async () => {
    render(<ConfirmDialogHost />);
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    await act(async () => {
      first = promptDialog({ title: 'Bir', label: 'Bir', defaultValue: 'ilk' });
      second = promptDialog({ title: 'İki', label: 'İki' });
    });
    const one = screen.getByRole('alertdialog');
    expect((within(one).getByRole('textbox') as HTMLInputElement).value).toBe('ilk');
    fireEvent.change(within(one).getByRole('textbox'), { target: { value: 'değişti' } });
    fireEvent.click(within(one).getByRole('button', { name: 'Onayla' }));
    await expect(first).resolves.toBe('değişti');
    const two = screen.getByRole('alertdialog');
    expect((within(two).getByRole('textbox') as HTMLInputElement).value).toBe('');
    fireEvent.change(within(two).getByRole('textbox'), { target: { value: 'ikinci' } });
    fireEvent.click(within(two).getByRole('button', { name: 'Onayla' }));
    await expect(second).resolves.toBe('ikinci');
  });
});
