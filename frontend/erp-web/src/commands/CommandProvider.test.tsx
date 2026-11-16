import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogHost, confirmDialog } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import { useWorkspaceGlobalCommands } from '../useWorkspaceGlobalCommands';
import { CommandProvider, useActivePageCommands, usePageCommands } from './CommandProvider';

afterEach(cleanup);

function Page({ onSave }: { onSave: () => void }) {
  usePageCommands({ save: { run: onSave } });
  return null;
}

describe('CommandProvider', () => {
  it('usePageCommands registers under the surrounding view key', () => {
    const a = vi.fn();
    const b = vi.fn();
    const tree = (active: string) => (
      <CommandProvider>
        <KeepAliveViews activeKey={active} openKeys={['a', 'b']}>
          {active === 'a' ? <Page onSave={a} /> : <Page onSave={b} />}
        </KeepAliveViews>
      </CommandProvider>
    );
    const { rerender } = render(tree('a'));
    rerender(tree('b'));
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    rerender(tree('a'));
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('uses the latest handler without re-registering', () => {
    const seen: number[] = [];
    const runs = new Set<unknown>();
    function Counter() {
      const [n, setN] = useState(0);
      usePageCommands({ save: { run: () => { seen.push(n); setN((v) => v + 1); } } });
      runs.add(useActivePageCommands()?.save?.run);
      return <span>{n}</span>;
    }
    render(<CommandProvider><KeepAliveViews activeKey="root" openKeys={["root"]}><Counter /></KeepAliveViews></CommandProvider>);
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(seen).toEqual([0, 1]);
    runs.delete(undefined);
    expect(runs.size).toBe(1);
  });

  it('does not dispatch while a confirm dialog is open', async () => {
    const save = vi.fn();
    render(<CommandProvider><Page onSave={save} /><ConfirmDialogHost /></CommandProvider>);
    act(() => { void confirmDialog({ title: 'Emin misiniz?', message: 'x' }); });
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('workspace global commands', () => {
  type Handlers = ReturnType<typeof makeHandlers>;
  function makeHandlers(searchOpen = false) {
    return {
      page: 'module:b',
      moduleTabs: [{ id: 'module:a', label: 'A' }, { id: 'module:b', label: 'B' }, { id: 'module:c', label: 'C' }],
      searchOpen,
      searchInputRef: createRef<HTMLInputElement>() as RefObject<HTMLInputElement | null>,
      onOpenSearch: vi.fn(),
      onToggleSearch: vi.fn(),
      onCloseSearch: vi.fn(),
      onClearSearch: vi.fn(),
      onSelectTab: vi.fn(),
      onCloseTab: vi.fn(),
    };
  }
  function Host({ handlers }: { handlers: Handlers }) {
    useWorkspaceGlobalCommands(handlers);
    return <input aria-label="field" ref={handlers.searchInputRef as RefObject<HTMLInputElement>} />;
  }
  function setup(handlers: Handlers) {
    return render(<CommandProvider><Host handlers={handlers} /></CommandProvider>);
  }

  it('keeps Ctrl+K behaviour', () => {
    const h = makeHandlers();
    setup(h);
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(h.onOpenSearch).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText('field');
    input.focus();
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
    expect(h.onOpenSearch).toHaveBeenCalledTimes(2);
    cleanup();
    const open = makeHandlers(true);
    setup(open);
    fireEvent.keyDown(document.body, { key: 'K', ctrlKey: true });
    expect(open.onClearSearch).toHaveBeenCalledTimes(1);
    cleanup();
    const launcher = { ...makeHandlers(), page: 'launcher' };
    setup(launcher);
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(launcher.onOpenSearch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('field'));
  });

  it('keeps Ctrl+B behaviour', () => {
    const h = makeHandlers();
    setup(h);
    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
    expect(h.onToggleSearch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'b', ctrlKey: true });
    expect(h.onToggleSearch).toHaveBeenCalledTimes(1);
    cleanup();
    const launcher = { ...makeHandlers(), page: 'launcher' };
    setup(launcher);
    fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
    expect(launcher.onToggleSearch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('field'));
  });

  it('keeps Ctrl+W behaviour', () => {
    const h = makeHandlers();
    setup(h);
    fireEvent.keyDown(document.body, { key: 'w', ctrlKey: true });
    expect(h.onCloseTab).toHaveBeenCalledWith('module:b');
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'w', ctrlKey: true });
    expect(h.onCloseTab).toHaveBeenCalledTimes(1);
  });

  it('keeps Ctrl+Tab behaviour', () => {
    const h = makeHandlers();
    setup(h);
    fireEvent.keyDown(document.body, { key: 'Tab', ctrlKey: true });
    expect(h.onSelectTab).toHaveBeenLastCalledWith('module:c');
    fireEvent.keyDown(document.body, { key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(h.onSelectTab).toHaveBeenLastCalledWith('module:a');
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'Tab', ctrlKey: true });
    expect(h.onSelectTab).toHaveBeenCalledTimes(2);
  });

  it('keeps Alt+Arrow behaviour', () => {
    const h = makeHandlers();
    setup(h);
    fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true });
    expect(h.onSelectTab).toHaveBeenLastCalledWith('module:c');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true });
    expect(h.onSelectTab).toHaveBeenLastCalledWith('module:a');
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowLeft', altKey: true });
    expect(h.onSelectTab).toHaveBeenCalledTimes(2);
  });

  it('closes search with Escape only while search is open', () => {
    const closed = makeHandlers();
    setup(closed);
    const notPrevented = fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(notPrevented).toBe(true);
    expect(closed.onCloseSearch).not.toHaveBeenCalled();
    cleanup();
    const open = makeHandlers(true);
    setup(open);
    const input = screen.getByLabelText('field');
    input.focus();
    const prevented = fireEvent.keyDown(input, { key: 'Escape' });
    expect(prevented).toBe(false);
    expect(open.onCloseSearch).toHaveBeenCalledTimes(1);
  });
});
