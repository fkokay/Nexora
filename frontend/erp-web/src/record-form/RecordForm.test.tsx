import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider, useViewDialogOwner } from '../commands/CommandProvider';
import { ConfirmDialogHost, promptDialog } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import { RecordFormPage } from './RecordForm';

afterEach(cleanup);

function inView(children: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{children}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

function Form({ title, onSubmit, onSaveIntent, onReset, saveDisabledReason }: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  onSaveIntent?: (stay: boolean) => void;
  onReset?: () => void;
  saveDisabledReason?: string;
}) {
  return (
    <RecordFormPage
      variant="dialog"
      title={title}
      mode="create"
      busy={false}
      saveLabel="x"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event);
      }}
      onCancel={() => {}}
      onSaveIntent={onSaveIntent}
      onReset={onReset}
      saveDisabledReason={saveDisabledReason}
    >
      <label>
        {`${title} kodu`}
        <input />
      </label>
    </RecordFormPage>
  );
}

const ctrlS = (target: Element = document.body) => fireEvent.keyDown(target, { key: 's', ctrlKey: true });
const barSave = () => document.querySelector<HTMLElement>('[data-nx-action-bar] [data-command="save"]')!;

// The confirm queue is module-wide: close anything an earlier test left open.
function closeOpenDialogs() {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog'))
    fireEvent.click(within(open).getAllByRole('button')[0]);
}

describe('RecordFormPage in a dialog', () => {
  it('keeps a clickable Kaydet (Ctrl+S), Kaydet ve Yeni and Temizle inside the modal', () => {
    const onSubmit = vi.fn();
    const onSaveIntent = vi.fn();
    inView(
      <div className="modal-backdrop">
        <div className="modal">
          <Form title="Depo" onSubmit={onSubmit} onSaveIntent={onSaveIntent} onReset={() => {}} />
        </div>
      </div>,
    );
    const header = document.querySelector('.rf-toolbar')!;
    expect(Array.from(header.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'KaydetCtrl+S', 'Kaydet ve YeniCtrl+F2', 'Temizle', 'Vazgeç',
    ]);
    fireEvent.click(within(header as HTMLElement).getByRole('button', { name: /^Kaydet\s*Ctrl\+S/ }));
    expect(onSaveIntent).toHaveBeenLastCalledWith(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // In a modal the bar's menu does not repeat them.
    fireEvent.click(document.querySelector('[data-nx-action-bar] [data-command="more"]')!);
    expect(screen.queryByRole('menuitem', { name: /Kaydet ve Yeni/ })).toBeNull();
  });

  it('on a page the form header keeps only Vazgeç', () => {
    inView(<Form title="Konum" onSubmit={() => {}} onSaveIntent={() => {}} onReset={() => {}} />);
    expect(Array.from(document.querySelectorAll('.rf-toolbar button')).map((b) => b.textContent)).toEqual(['Vazgeç']);
  });
});

describe('RecordFormPage saving', () => {
  it('Enter in a single-line field saves through the default button', async () => {
    const onSubmit = vi.fn();
    const onSaveIntent = vi.fn();
    inView(<Form title="Konum" onSubmit={onSubmit} onSaveIntent={onSaveIntent} />);
    await userEvent.type(screen.getByLabelText('Konum kodu'), 'A{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSaveIntent).toHaveBeenLastCalledWith(false);
  });

  it('Ctrl+S saves the form that has focus when two are on screen', () => {
    const first = vi.fn();
    const second = vi.fn();
    inView(
      <>
        <Form title="İl" onSubmit={first} />
        <Form title="İlçe" onSubmit={second} />
      </>,
    );
    act(() => screen.getByLabelText('İl kodu').focus());
    ctrlS(screen.getByLabelText('İl kodu'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    act(() => screen.getByLabelText('İlçe kodu').focus());
    act(() => screen.getByLabelText('İl kodu').blur());
    ctrlS();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('a form mounted later does not take Ctrl+S from the form that has focus', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = (withSecond: boolean) => (
      <CommandProvider>
        <KeepAliveViews activeKey="v" openKeys={['v']}>
          <Form title="İl" onSubmit={first} />
          {withSecond && <Form title="İlçe" onSubmit={second} />}
        </KeepAliveViews>
      </CommandProvider>
    );
    const { rerender } = render(view(false));
    act(() => screen.getByLabelText('İl kodu').focus());
    rerender(view(true));
    ctrlS(screen.getByLabelText('İl kodu'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('saveDisabledReason disables the bar Kaydet with that reason', () => {
    const onSubmit = vi.fn();
    inView(<Form title="Konum" onSubmit={onSubmit} saveDisabledReason="Konum kodu ve adı zorunludur." />);
    expect(barSave().getAttribute('aria-disabled')).toBe('true');
    expect(barSave().title).toBe('Konum kodu ve adı zorunludur.');
    ctrlS();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a dialog of the page without a form does not let Ctrl+S save the form behind it', () => {
    const onSubmit = vi.fn();
    inView(
      <>
        <Form title="Konum" onSubmit={onSubmit} />
        <div role="dialog" aria-modal="true"><input aria-label="Not" /></div>
      </>,
    );
    ctrlS(screen.getByLabelText('Not'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a portalled view dialog saves with Ctrl+S, but not while a prompt is open over it', async () => {
    closeOpenDialogs();
    const onSubmit = vi.fn();
    function MovementDialog() {
      const owner = useViewDialogOwner();
      return createPortal(
        <div {...owner} className="modal-backdrop">
          <div role="dialog" aria-modal="true">
            <Form title="Hareket" onSubmit={onSubmit} />
          </div>
        </div>,
        document.body,
      );
    }
    inView(<MovementDialog />);
    ctrlS(screen.getByLabelText('Hareket kodu'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => { void promptDialog({ title: 'Neden?', label: 'Neden' }); });
    await screen.findByRole('alertdialog');
    ctrlS();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    closeOpenDialogs();
  });
});
