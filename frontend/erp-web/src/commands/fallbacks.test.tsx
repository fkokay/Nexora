import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import AdvancedDataGrid from '../AdvancedDataGrid';
import { ListToolbar } from '../list-page/ListToolbar';
import { CommandProvider, useActivePageCommands, usePageCommands } from './CommandProvider';
import { useCommandRegistry } from './CommandProvider';
import { createCommandRegistry } from './registry';
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

  it('grid keeps the first registration when a view holds several grids', () => {
    render(
      <CommandProvider>
        <Probe />
        <Grid />
        <Grid />
      </CommandProvider>,
    );
    expect(active?.export?.run).toBeTypeOf('function');
  });

  it('registry reports whether a source is registered for a view', () => {
    const registry = createCommandRegistry();
    const unregister = registry.register('v', 'grid', { export: { run: vi.fn() } });
    expect(registry.hasSource('v', 'grid')).toBe(true);
    expect(registry.hasSource('v', 'list')).toBe(false);
    unregister();
    expect(registry.hasSource('v', 'grid')).toBe(false);
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
