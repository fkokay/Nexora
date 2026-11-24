import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider, useViewDialogOwner } from '../commands/CommandProvider';
import { ConfirmDialogHost, promptDialog } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import SearchableRecordPicker from '../SearchableRecordPicker';
import { RecordFieldChange, RecordFormGroup, RecordFormPage, RecordFormTabs } from './RecordForm';
import type { RecordFormPageProps, RecordFormTab } from './RecordForm';
import { commandReason } from '../action-bar/commandReason';

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
    expect(document.querySelector('[data-nx-action-bar] [data-command="more"]')).toBeNull();
  });

  it('on a page the form header keeps only Vazgeç', () => {
    inView(<Form title="Konum" onSubmit={() => {}} onSaveIntent={() => {}} onReset={() => {}} />);
    expect(Array.from(document.querySelectorAll('.rf-toolbar button')).map((b) => b.textContent)).toEqual(['Vazgeç']);
  });

  it('outside the shell (no action bar, no modal) keeps its own Kaydet, which saves by click and Ctrl+S', () => {
    const onSubmit = vi.fn();
    const onSaveIntent = vi.fn();
    // Platform admin: a plain page under CommandProvider, no workspace view and no action bar.
    render(
      <CommandProvider>
        <Form title="Lisans" onSubmit={onSubmit} onSaveIntent={onSaveIntent} onReset={() => {}} />
      </CommandProvider>,
    );
    const header = document.querySelector<HTMLElement>('.rf-toolbar')!;
    expect(Array.from(header.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'KaydetCtrl+S', 'Kaydet ve YeniCtrl+F2', 'Temizle', 'Vazgeç',
    ]);
    fireEvent.click(within(header).getByRole('button', { name: /^Kaydet\s*Ctrl\+S/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSaveIntent).toHaveBeenLastCalledWith(false);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => screen.getByLabelText('Lisans kodu').dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('outside the shell Ctrl+S goes only to the focused form when two are on the page', () => {
    const provisioning = vi.fn();
    const license = vi.fn();
    render(
      <CommandProvider>
        <Form title="Kiracı" onSubmit={provisioning} />
        <Form title="Lisans" onSubmit={license} />
      </CommandProvider>,
    );
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(provisioning).not.toHaveBeenCalled();
    expect(license).not.toHaveBeenCalled();
    act(() => screen.getByLabelText('Lisans kodu').focus());
    fireEvent.keyDown(screen.getByLabelText('Lisans kodu'), { key: 's', ctrlKey: true });
    expect(license).toHaveBeenCalledTimes(1);
    expect(provisioning).not.toHaveBeenCalled();
  });

  it('the shell action bar takes the buttons over once it mounts', () => {
    const view = (withBar: boolean) => (
      <CommandProvider>
        {withBar && <ActionBar locale="tr" />}
        <KeepAliveViews activeKey="v" openKeys={['v']}>
          <Form title="Konum" onSubmit={() => {}} />
        </KeepAliveViews>
      </CommandProvider>
    );
    const { rerender } = render(view(false));
    expect(Array.from(document.querySelectorAll('.rf-toolbar button')).map((b) => b.textContent)).toEqual(['KaydetCtrl+S', 'Vazgeç']);
    rerender(view(true));
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
    expect((commandReason(barSave()) ?? '')).toBe('Konum kodu ve adı zorunludur.');
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

  it('an open native dialog (dialog[open]) without a form does not let Ctrl+S save the form behind it', () => {
    const onSubmit = vi.fn();
    inView(
      <>
        <Form title="Konum" onSubmit={onSubmit} />
        <dialog open><input aria-label="Not" /></dialog>
      </>,
    );
    ctrlS(screen.getByLabelText('Not'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a form inside a native dialog keeps its own Kaydet and saves with Ctrl+S', () => {
    const behind = vi.fn();
    const inside = vi.fn();
    inView(
      <>
        <Form title="Konum" onSubmit={behind} />
        <dialog open><Form title="Ekstre" onSubmit={inside} /></dialog>
      </>,
    );
    const header = document.querySelector('dialog .rf-toolbar')!;
    expect(Array.from(header.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['KaydetCtrl+S', 'Vazgeç']);
    act(() => screen.getByLabelText('Ekstre kodu').focus());
    ctrlS(screen.getByLabelText('Ekstre kodu'));
    expect(inside).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
  });

  it('Ctrl+F2 with two forms on screen saves only the focused one; F2 alone saves neither', () => {
    const first = vi.fn();
    const second = vi.fn();
    inView(
      <>
        <Form title="İl" onSubmit={first} onSaveIntent={() => {}} />
        <Form title="İlçe" onSubmit={second} onSaveIntent={() => {}} />
      </>,
    );
    fireEvent.keyDown(document.body, { key: 'F2', ctrlKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    act(() => screen.getByLabelText('İlçe kodu').focus());
    fireEvent.keyDown(screen.getByLabelText('İlçe kodu'), { key: 'F2', ctrlKey: true });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('İlçe kodu'), { key: 'F2' });
    expect(second).toHaveBeenCalledTimes(1);
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

// ---- Record screen kit (mockup 01, record part): section navigator, cards, context panel ----

const sectionTabs = (): RecordFormTab[] => [
  { key: 'general', label: 'Genel', state: 'done' },
  { key: 'price', label: 'Fiyat ve Vergi', warning: true, count: 1 },
  { key: 'variants', label: 'Varyantlar', state: 'empty', count: 0 },
];

function Sectioned({
  completion,
  identityRequired = false,
  failWith,
  recordNav,
  aside,
  dirty,
  onCancel = () => {},
  confirmCancel,
}: {
  onCancel?: () => void;
  confirmCancel?: boolean;
  completion?: number;
  identityRequired?: boolean;
  /** Simulates a container whose own validation sets `error` on submit. */
  failWith?: string;
  recordNav?: RecordFormPageProps['recordNav'];
  aside?: ReactNode;
  dirty?: boolean | number;
}) {
  const [active, setActive] = useState('general');
  const [error, setError] = useState('');
  return (
    <RecordFormPage
      title="Stok Kartı"
      mode="edit"
      busy={false}
      confirmCancel={confirmCancel}
      saveLabel="x"
      onSubmit={(event) => {
        event.preventDefault();
        if (failWith) setError(failWith);
      }}
      onCancel={onCancel}
      error={error}
      recordNav={recordNav}
      aside={aside}
      dirty={dirty}
    >
      <RecordFormGroup title="Kimlik" hint="* zorunlu alan">
        <label>Stok kodu<input required={identityRequired} /></label>
      </RecordFormGroup>
      <RecordFormTabs tabs={sectionTabs()} active={active} onChange={setActive} label="Stok bölümleri" completion={completion}>
        {active === 'general' && (
          <>
            <label>Stok adı<input /></label>
            <label>Açıklama<textarea /></label>
            <label>Lot takipli<input type="checkbox" /></label>
          </>
        )}
        {active === 'price' && <label>KDV oranı<input required /></label>}
        {active === 'variants' && <p>Varyant yok</p>}
      </RecordFormTabs>
    </RecordFormPage>
  );
}

const press = (k: string, init: Partial<KeyboardEventInit> = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key: k, ...init });
const selectedSection = () => document.querySelector('[role="tablist"] [aria-selected="true"]')?.textContent;

describe('RecordFormTabs as the section navigator', () => {
  it('lists the sections vertically with ✓ / ! / ○ states, counts and the fill bar', () => {
    inView(<Sectioned completion={72} />);
    const nav = screen.getByRole('tablist', { name: 'Stok bölümleri' });
    expect(nav.getAttribute('aria-orientation')).toBe('vertical');
    expect(nav.closest('form')).toBeNull();
    const tabs = within(nav).getAllByRole('tab');
    expect(tabs.map((tab) => tab.querySelector('.rf-snav-state')?.className)).toEqual([
      'rf-snav-state is-done', 'rf-snav-state is-error', 'rf-snav-state is-empty',
    ]);
    expect(tabs.map((tab) => tab.querySelector('.rf-snav-state')?.textContent)).toEqual(['✓', '!', '']);
    expect(tabs.map((tab) => tab.querySelector('small')?.textContent ?? null)).toEqual([null, '1', '0']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Kart doluluğu %72')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('72');
    expect(screen.getByRole('tabpanel').textContent).toContain('Stok adı');
  });

  it('Ctrl+↓ / Ctrl+↑ switch sections, also while typing', () => {
    inView(<Sectioned />);
    press('ArrowDown', { ctrlKey: true }, screen.getByLabelText('Stok adı'));
    expect(selectedSection()).toContain('Fiyat ve Vergi');
    expect(document.activeElement).toBe(screen.getByLabelText('KDV oranı'));
    press('ArrowDown', { ctrlKey: true });
    expect(selectedSection()).toContain('Varyantlar');
    press('ArrowDown', { ctrlKey: true });
    expect(selectedSection()).toContain('Varyantlar');
    press('ArrowUp', { ctrlKey: true });
    expect(selectedSection()).toContain('Fiyat ve Vergi');
  });

  it('Ctrl+↓ leaves a textarea and an open picker alone', () => {
    inView(<Sectioned />);
    press('ArrowDown', { ctrlKey: true }, screen.getByLabelText('Açıklama'));
    expect(selectedSection()).toContain('Genel');
    const picker = document.createElement('div');
    picker.setAttribute('role', 'listbox');
    document.querySelector('.rf-tab-panel')!.appendChild(picker);
    press('ArrowDown', { ctrlKey: true }, picker);
    expect(selectedSection()).toContain('Genel');
    picker.remove();
  });

  it('Ctrl+↓ does nothing while a modal is open or in a hidden view', () => {
    inView(
      <>
        <Sectioned />
        <div role="dialog" aria-modal="true"><input aria-label="Not" /></div>
      </>,
    );
    press('ArrowDown', { ctrlKey: true }, screen.getByLabelText('Açıklama'));
    expect(selectedSection()).toContain('Genel');
    cleanup();
    inView(<div hidden><Sectioned /></div>);
    press('ArrowDown', { ctrlKey: true });
    expect(selectedSection()).toContain('Genel');
  });

  it('a dialog keeps the horizontal tab strip', () => {
    function DialogTabs() {
      const [active, setActive] = useState('a');
      return (
        <RecordFormPage variant="dialog" title="Profil" mode="create" busy={false} saveLabel="x" onSubmit={(e) => e.preventDefault()} onCancel={() => {}}>
          <RecordFormTabs tabs={[{ key: 'a', label: 'Vergi' }, { key: 'b', label: 'Parametre', warning: true }]} active={active} onChange={setActive} label="Profil bölümleri">
            <p>{active}</p>
          </RecordFormTabs>
        </RecordFormPage>
      );
    }
    inView(<div className="modal-backdrop"><div className="modal"><DialogTabs /></div></div>);
    const strip = screen.getByRole('navigation', { name: 'Profil bölümleri' });
    expect(strip.closest('form')).not.toBeNull();
    expect(within(strip).getByRole('button', { name: /Vergi/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('RecordFormPage after a failed save', () => {
  it('focuses the first invalid field that is on screen', () => {
    inView(<Sectioned identityRequired />);
    ctrlS();
    expect(document.activeElement).toBe(screen.getByLabelText('Stok kodu'));
    expect(selectedSection()).toContain('Genel');
  });

  it('a server error does not move the section or the focus, even with a ! section', () => {
    inView(<Sectioned failWith="İstek başarısız (500)." />);
    act(() => screen.getByLabelText('Stok adı').focus());
    ctrlS(screen.getByLabelText('Stok adı'));
    expect(screen.getByRole('alert').textContent).toContain('İstek başarısız');
    expect(selectedSection()).toContain('Genel');
    expect(document.activeElement).toBe(screen.getByLabelText('Stok adı'));
  });

  it('shows a hidden section (data-rf-section) that holds the first invalid field', () => {
    function HiddenSections() {
      const [active, setActive] = useState('general');
      return (
        <RecordFormPage title="Stok" mode="create" busy={false} saveLabel="x" onSubmit={(e) => e.preventDefault()} onCancel={() => {}}>
          <RecordFormTabs tabs={[{ key: 'general', label: 'Genel' }, { key: 'price', label: 'Fiyat' }]} active={active} onChange={setActive} label="Stok bölümleri">
            <div data-rf-section="general" hidden={active !== 'general'}><label>Stok adı<input /></label></div>
            <div data-rf-section="price" hidden={active !== 'price'}><label>KDV oranı<input required /></label></div>
          </RecordFormTabs>
        </RecordFormPage>
      );
    }
    inView(<HiddenSections />);
    ctrlS();
    expect(selectedSection()).toContain('Fiyat');
    expect(document.activeElement).toBe(screen.getByLabelText('KDV oranı'));
  });
});

describe('RecordFormPage Esc', () => {
  it('Esc with a record picker open closes only the picker, not the form behind it', async () => {
    const onCancel = vi.fn();
    inView(
      <RecordFormPage title="Sipariş" mode="create" busy={false} saveLabel="x" onSubmit={(event) => event.preventDefault()} onCancel={onCancel}>
        <SearchableRecordPicker
          options={[{ id: 'c1', label: 'Acme' }]}
          selectedId=""
          onSelect={() => {}}
          title="Müşteri seç"
          placeholder="Müşteri"
          searchPlaceholder="Ara"
          emptyMessage="Yok"
        />
      </RecordFormPage>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Müşteri' }));
    expect(screen.getByRole('dialog', { name: /Müşteri seç/ })).toBeTruthy();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    // The picker marks Esc as handled, so the form's Esc (Vazgeç) leaves it alone even once the picker is gone.
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog', { name: /Müşteri seç/ })).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('closes an untouched form', () => {
    const onCancel = vi.fn();
    inView(<Sectioned onCancel={onCancel} />);
    press('Escape', {}, screen.getByLabelText('Stok adı'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('asks first when the form was touched: Vazgeç keeps it, Devam closes it', async () => {
    closeOpenDialogs();
    const onCancel = vi.fn();
    inView(<Sectioned onCancel={onCancel} />);
    fireEvent.input(screen.getByLabelText('Stok adı'), { target: { value: 'Koli' } });
    press('Escape', {}, screen.getByLabelText('Stok adı'));
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await act(async () => {});
    expect(onCancel).not.toHaveBeenCalled();
    press('Escape');
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devam' }));
    await act(async () => {});
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("the header's Vazgeç closes at once by default, even with typed values", () => {
    closeOpenDialogs();
    const onCancel = vi.fn();
    inView(<Sectioned onCancel={onCancel} />);
    fireEvent.input(screen.getByLabelText('Stok adı'), { target: { value: 'Koli' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it("with confirmCancel the header's Vazgeç asks like Esc: closes an untouched form, asks for a touched one", async () => {
    closeOpenDialogs();
    const onCancel = vi.fn();
    inView(<Sectioned onCancel={onCancel} confirmCancel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.input(screen.getByLabelText('Stok adı'), { target: { value: 'Koli' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await act(async () => {});
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Vazgeç' })[0]);
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devam' }));
    await act(async () => {});
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('does nothing while a modal is open or in a hidden view', () => {
    const onCancel = vi.fn();
    inView(
      <>
        <Sectioned onCancel={onCancel} />
        <div role="dialog" aria-modal="true"><input aria-label="Not alanı" /></div>
      </>,
    );
    press('Escape', {}, screen.getByLabelText('Not alanı'));
    expect(onCancel).not.toHaveBeenCalled();
    cleanup();
    inView(<div hidden><Sectioned onCancel={onCancel} /></div>);
    press('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('RecordFormPage record header', () => {
  it('PgUp / PgDn step through records, but not while typing', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    inView(<Sectioned recordNav={{ index: 2, total: 23, onPrev, onNext }} />);
    expect(screen.getByText('2 / 23')).toBeTruthy();
    press('PageDown', {}, screen.getByLabelText('Stok adı'));
    expect(onNext).not.toHaveBeenCalled();
    press('PageDown', {}, screen.getByLabelText('Lot takipli'));
    expect(onNext).toHaveBeenCalledTimes(1);
    press('PageUp');
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PgUp/PgDn önceki/sonraki kayıt')).toBeTruthy();
  });

  it('a missing step disables its button and says why', () => {
    inView(<Sectioned recordNav={{ index: 1, total: 3, onNext: vi.fn(), prevDisabledReason: 'Listenin bu sayfasının başı' }} />);
    const prev = screen.getByRole('button', { name: 'Önceki kayıt' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(prev.title).toBe('Listenin bu sayfasının başı');
    expect((screen.getByRole('button', { name: 'Sonraki kayıt' }) as HTMLButtonElement).title).toBe('');
  });

  it('shows how many fields changed', () => {
    inView(<Sectioned dirty={2} />);
    expect(screen.getByText('2 alan değişti')).toBeTruthy();
  });

  it('the footer lists the form shortcuts next to the status', () => {
    inView(<Sectioned />);
    const footer = document.querySelector('.rf-status')!;
    expect(footer.textContent).toContain('Tab sonraki alan');
    expect(footer.textContent).toContain('Ctrl+S kaydet');
    expect(footer.textContent).toContain('Esc kapat');
    expect(footer.textContent).not.toContain('PgUp');
    expect(footer.textContent).not.toContain('Ctrl+Z');
  });
});

describe('RecordFormPage context panel', () => {
  // The panel follows the record form's own width (not the viewport): a fake ResizeObserver reports it.
  let formWidth = 0;
  const observers: Array<() => void> = [];
  beforeEach(() => {
    formWidth = 0;
    observers.length = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains('record-form') ? formWidth : 0;
      return { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: () => void) { observers.push(() => this.callback()); }
      observe() {} unobserve() {} disconnect() {}
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const resize = (width: number) => act(() => {
    formWidth = width;
    observers.forEach((notify) => notify());
  });

  it('is closed while the form is narrower than 1100px and Ctrl+. toggles it', () => {
    formWidth = 1000;
    inView(<Sectioned aside={<p>Stok durumu</p>} />);
    const aside = screen.getByText('Stok durumu').closest('aside')!;
    expect(aside.hidden).toBe(true);
    press('.', { ctrlKey: true }, screen.getByLabelText('Stok adı'));
    expect(aside.hidden).toBe(false);
    press('.', { ctrlKey: true });
    expect(aside.hidden).toBe(true);
  });

  it('leaves Ctrl+. alone when another handler already took it (defaultPrevented)', () => {
    formWidth = 1000;
    inView(<Sectioned aside={<p>Stok durumu</p>} />);
    const aside = screen.getByText('Stok durumu').closest('aside')!;
    const taken = (event: KeyboardEvent) => event.preventDefault();
    window.addEventListener('keydown', taken, true);
    try {
      press('.', { ctrlKey: true }, screen.getByLabelText('Stok adı'));
    } finally {
      window.removeEventListener('keydown', taken, true);
    }
    expect(aside.hidden).toBe(true);
  });

  it('is open when the form is at least 1100px wide and follows later resizes', () => {
    formWidth = 1200;
    inView(<Sectioned aside={<p>Stok durumu</p>} />);
    const aside = screen.getByText('Stok durumu').closest('aside')!;
    expect(aside.hidden).toBe(false);
    resize(900);
    expect(aside.hidden).toBe(true);
    // A hidden keep-alive view measures 0 wide: the last state stays.
    resize(0);
    expect(aside.hidden).toBe(true);
    resize(1300);
    expect(aside.hidden).toBe(false);
  });

  it('does not flicker near the edge: opens from 1100px, closes only below 1060px', () => {
    formWidth = 1080;
    inView(<Sectioned aside={<p>Stok durumu</p>} />);
    const aside = screen.getByText('Stok durumu').closest('aside')!;
    expect(aside.hidden).toBe(true);
    resize(1100);
    expect(aside.hidden).toBe(false);
    resize(1070);
    expect(aside.hidden).toBe(false);
    resize(1059);
    expect(aside.hidden).toBe(true);
    resize(1090);
    expect(aside.hidden).toBe(true);
  });
});

describe('RecordFieldChange', () => {
  it('marks the field and shows the previous value', () => {
    render(
      <RecordFieldChange previous="500">
        <label>Minimum stok<input defaultValue="1000" /></label>
      </RecordFieldChange>,
    );
    const field = screen.getByLabelText('Minimum stok').closest('.rf-changed');
    expect(field).not.toBeNull();
    expect(field!.textContent).toContain('Önceki: 500');
  });

  it('with `changed` toggling keeps the same control (no remount while typing) and carries a layout class', () => {
    const view = (changed: boolean) => (
      <RecordFieldChange previous="500" changed={changed} className="rf-span-2">
        <label>Minimum stok<input defaultValue="1000" /></label>
      </RecordFieldChange>
    );
    const { rerender } = render(view(false));
    const input = screen.getByLabelText('Minimum stok');
    expect(input.closest('.rf-changed')).toBeNull();
    expect(screen.queryByText(/Önceki:/)).toBeNull();
    expect(input.closest('.rf-field')!.classList.contains('rf-span-2')).toBe(true);
    rerender(view(true));
    expect(screen.getByLabelText('Minimum stok')).toBe(input);
    expect(input.closest('.rf-changed')!.classList.contains('rf-span-2')).toBe(true);
    expect(screen.getByText('Önceki: 500')).toBeTruthy();
    rerender(view(false));
    expect(screen.getByLabelText('Minimum stok')).toBe(input);
    expect(screen.queryByText(/Önceki:/)).toBeNull();
  });
});

describe('RecordFormGroup', () => {
  it('renders a titled card with an optional hint', () => {
    render(<RecordFormGroup title="Kimlik" hint="* zorunlu alan"><label>Kod<input /></label></RecordFormGroup>);
    const card = screen.getByRole('region', { name: 'Kimlik' });
    expect(card.querySelector('.rf-group-head small')?.textContent).toBe('* zorunlu alan');
  });
});
