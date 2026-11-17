import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { DefinitionForm } from './components/DefinitionForm';

afterEach(cleanup);

function renderForm(onSubmit: () => void, busy = false) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <DefinitionForm
          tx={(tr) => tr}
          kind="Workplace"
          code="IY1"
          name="Merkez"
          editing={null}
          busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          onKindChange={() => {}}
          onCodeChange={() => {}}
          onNameChange={() => {}}
          onCancel={() => {}}
        />
      </KeepAliveViews>
    </CommandProvider>,
  );
}

const barSave = () => document.querySelector<HTMLElement>('[data-nx-action-bar] [data-command="save"]')!;

describe('DefinitionForm (İş yeri / şube / fabrika side form)', () => {
  it('saves with Ctrl+S and the bar Kaydet, never with F2', () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);
    const code = screen.getByDisplayValue('IY1');
    act(() => code.focus());
    fireEvent.keyDown(code, { key: 'F2' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(code, { key: 's', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(barSave().getAttribute('data-primary')).toBe('true');
    fireEvent.click(barSave());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.op-def-form-foot button[type="submit"]')!.textContent).toBe('Kaydet Ctrl+S');
  });

  it('while saving the bar Kaydet is disabled and says why', () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit, true);
    expect(barSave().getAttribute('aria-disabled')).toBe('true');
    expect(barSave().title).toBe('Kaydediliyor…');
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
