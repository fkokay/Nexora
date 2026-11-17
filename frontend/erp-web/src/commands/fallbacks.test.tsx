import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import AdvancedDataGrid, { type GridExportActions } from '../AdvancedDataGrid';
import { ListToolbar } from '../list-page/ListToolbar';
import { CommandProvider, useActivePageCommands, usePageCommands } from './CommandProvider';
import { useCommandRegistry } from './CommandProvider';
import type { PageCommands } from './types';

beforeAll(() => {
  // jsdom has no ResizeObserver; the grid only needs it to exist.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

let active: PageCommands | undefined;
function Probe() {
  const registry = useCommandRegistry();
  registry.setActiveView('root');
  active = useActivePageCommands();
  return null;
}

function Grid() {
  return (
    <AdvancedDataGrid hideExport>
      <thead>
        <tr><th>Ad</th></tr>
      </thead>
      <tbody>
        <tr><td>Ali</td></tr>
      </tbody>
    </AdvancedDataGrid>
  );
}

function PageOverride({ run }: { run: () => void }) {
  usePageCommands({ export: { run } });
  return null;
}

describe('fallback commands', () => {
  it('grid registers export for its view', () => {
    render(
      <CommandProvider>
        <Probe />
        <Grid />
      </CommandProvider>,
    );
    expect(active?.export?.run).toBeTypeOf('function');
  });

  it('with several grids in one view the first wins and the next takes over on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Spy({ run }: { run: () => void }) {
      usePageCommands({ export: { run } }, 'grid');
      return null;
    }
    const tree = (showFirst: boolean, firstRun = first) => (
      <CommandProvider>
        <Probe />
        {showFirst && <Spy run={firstRun} />}
        <Spy run={second} />
      </CommandProvider>
    );
    const { rerender } = render(tree(true));
    act(() => void active?.export?.run?.());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    // A handler change on the first keeps its position.
    const firstV2 = vi.fn();
    rerender(tree(true, firstV2));
    act(() => void active?.export?.run?.());
    expect(firstV2).toHaveBeenCalledTimes(1);
    rerender(tree(false));
    act(() => void active?.export?.run?.());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('first slot keeps its position when its command structure changes', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Spy({ run, withFilter }: { run: () => void; withFilter?: boolean }) {
      usePageCommands(withFilter ? { export: { run }, filter: { run } } : { export: { run } }, 'grid');
      return null;
    }
    const tree = (withFilter: boolean) => (
      <CommandProvider>
        <Probe />
        <Spy run={first} withFilter={withFilter} />
        <Spy run={second} />
      </CommandProvider>
    );
    const { rerender } = render(tree(false));
    rerender(tree(true));
    act(() => void active?.export?.run?.());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(active?.filter).toBeDefined();
  });

  it('list toolbar registers filter that focuses the search input', () => {
    render(
      <CommandProvider>
        <Probe />
        <ListToolbar search="" onSearchChange={() => {}} />
      </CommandProvider>,
    );
    expect(active?.refresh).toBeUndefined();
    act(() => void active?.filter?.run?.());
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('list toolbar registers refresh only with onRefresh and drops the icon button', () => {
    const onRefresh = vi.fn();
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <CommandProvider>
          <Probe />
          <ListToolbar search="" onRefresh={on ? onRefresh : undefined} />
          <button onClick={() => setOn(true)}>enable</button>
        </CommandProvider>
      );
    }
    render(<Harness />);
    expect(active?.refresh).toBeUndefined();
    fireEvent.click(screen.getByText('enable'));
    act(() => void active?.refresh?.run?.());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Listeyi yenile' })).toBeNull();
  });

  it('list toolbar without a search box does not register filter', () => {
    render(
      <CommandProvider>
        <Probe />
        <ListToolbar onRefresh={() => {}} />
      </CommandProvider>,
    );
    expect(active?.filter).toBeUndefined();
    expect(active?.refresh).toBeDefined();
  });

  it('grid hands its export functions to exportActionsRef while mounted', () => {
    const ref: { current: GridExportActions | null } = { current: null };
    const { unmount } = render(
      <CommandProvider>
        <AdvancedDataGrid hideExport exportActionsRef={ref}>
          <thead><tr><th>Ad</th></tr></thead>
          <tbody><tr><td>Ali</td></tr></tbody>
        </AdvancedDataGrid>
      </CommandProvider>,
    );
    expect(ref.current?.exportCsv).toBeTypeOf('function');
    expect(ref.current?.exportExcel).toBeTypeOf('function');
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
    unmount();
    expect(ref.current).toBeNull();
  });

  it('page command overrides grid export', () => {
    const run = vi.fn();
    render(
      <CommandProvider>
        <Probe />
        <Grid />
        <PageOverride run={run} />
      </CommandProvider>,
    );
    act(() => void active?.export?.run?.());
    expect(run).toHaveBeenCalledTimes(1);
  });
});
