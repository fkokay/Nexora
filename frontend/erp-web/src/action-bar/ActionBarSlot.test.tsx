import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ActionBar } from './ActionBar';
import { ActionBarSlot, ActionBarSlotProvider, ShellBreadcrumbRow, useSlotBreadcrumb } from './ActionBarSlot';

afterEach(cleanup);

function Header({ id }: { id: string }) {
  const { slotRef, breadcrumb } = useSlotBreadcrumb();
  return <div data-testid={`header-${id}`}>{breadcrumb}<ActionBarSlot slotRef={slotRef} /></div>;
}

function Harness({ active, views }: { active: string; views: Record<string, boolean> }) {
  return (
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="crumb">Ana Sayfa</nav>}>
        <ShellBreadcrumbRow><nav aria-label="shell-crumb">Ana Sayfa</nav></ShellBreadcrumbRow>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey={active} openKeys={Object.keys(views)}>
          {views[active] ? <Header id={active} /> : <span />}
        </KeepAliveViews>
      </ActionBarSlotProvider>
    </CommandProvider>
  );
}

const toolbars = () => screen.queryAllByRole('toolbar', { name: 'İşlemler çubuğu' }, );

describe('ActionBarSlot', () => {
  it('renders inside the page slot when the active view has one', () => {
    render(<Harness active="a" views={{ a: true }} />);
    const slot = document.querySelector('[data-nx-action-bar-slot]')!;
    expect(toolbars()).toHaveLength(1);
    expect(slot.contains(toolbars()[0])).toBe(true);
    // Breadcrumb moves into the title block; the shell row is hidden.
    expect(screen.queryByLabelText('shell-crumb')).toBeNull();
    expect(screen.getByTestId('header-a').querySelector('[aria-label="crumb"]')).toBeTruthy();
  });

  it('falls back to the shell position when no slot', () => {
    render(<Harness active="a" views={{ a: false }} />);
    expect(toolbars()).toHaveLength(1);
    expect(toolbars()[0].closest('[data-nx-view]')).toBeNull();
    expect(screen.getByLabelText('shell-crumb')).toBeTruthy();
  });

  it('ignores a slot inside a hidden keep-alive view', () => {
    const { rerender } = render(<Harness active="a" views={{ a: true, b: false }} />);
    rerender(<Harness active="b" views={{ a: true, b: false }} />);
    expect(toolbars()).toHaveLength(1);
    const hiddenSlot = document.querySelector('[data-nx-view="a"] [data-nx-action-bar-slot]')!;
    expect(hiddenSlot.contains(toolbars()[0])).toBe(false);
    expect(screen.getByLabelText('shell-crumb')).toBeTruthy();
  });

  it('moves when the active view changes', () => {
    const { rerender } = render(<Harness active="a" views={{ a: true, b: true }} />);
    expect(document.querySelector('[data-nx-view="a"] [data-nx-action-bar-slot]')!.contains(toolbars()[0])).toBe(true);
    rerender(<Harness active="b" views={{ a: true, b: true }} />);
    expect(document.querySelector('[data-nx-view="b"] [data-nx-action-bar-slot]')!.contains(toolbars()[0])).toBe(true);
    expect(toolbars()).toHaveLength(1);
    // Only the active view's header shows the breadcrumb.
    expect(document.querySelectorAll('[aria-label="crumb"]')).toHaveLength(1);
  });

  it('never renders twice', () => {
    function Toggle() {
      const [on, setOn] = useState(false);
      return (
        <CommandProvider>
          <ActionBarSlotProvider breadcrumb={null}>
            <ActionBar locale="tr" />
            <KeepAliveViews activeKey="v" openKeys={['v']}>
              <button onClick={() => setOn(!on)}>toggle</button>
              {on && <Header id="v" />}
            </KeepAliveViews>
          </ActionBarSlotProvider>
        </CommandProvider>
      );
    }
    render(<Toggle />);
    expect(toolbars()).toHaveLength(1);
    act(() => screen.getByText('toggle').click());
    expect(toolbars()).toHaveLength(1);
    expect(document.querySelector('[data-nx-action-bar-slot]')!.contains(toolbars()[0])).toBe(true);
    act(() => screen.getByText('toggle').click());
    expect(toolbars()).toHaveLength(1);
    expect(document.querySelector('[data-nx-action-bar-slot]')).toBeNull();
  });
});

describe('ListPageHeader / RecordFormPage slots', () => {
  it('page variant renders a slot after the title; dialog variant never does', async () => {
    const { RecordFormPage } = await import('../record-form/RecordForm');
    const props = { title: 'T', mode: 'create' as const, busy: false, saveLabel: 'x', children: null, onSubmit: () => undefined, onCancel: () => undefined };
    const { unmount } = render(
      <CommandProvider><ActionBarSlotProvider breadcrumb={null}><KeepAliveViews activeKey="v" openKeys={['v']}>
        <RecordFormPage {...props} variant="dialog" />
      </KeepAliveViews></ActionBarSlotProvider></CommandProvider>,
    );
    expect(document.querySelector('[data-nx-action-bar-slot]')).toBeNull();
    unmount();
    render(
      <CommandProvider><ActionBarSlotProvider breadcrumb={null}><KeepAliveViews activeKey="v" openKeys={['v']}>
        <RecordFormPage {...props} />
      </KeepAliveViews></ActionBarSlotProvider></CommandProvider>,
    );
    expect(document.querySelector('.rf-toolbar + [data-nx-action-bar-slot]')).toBeTruthy();
  });

  it('page-variant form inside a modal keeps no slot and the bar stays out of the modal', async () => {
    const { RecordFormPage } = await import('../record-form/RecordForm');
    render(
      <CommandProvider><ActionBarSlotProvider breadcrumb={null}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}>
          <div className="modal">
            <RecordFormPage title="T" mode="create" busy={false} saveLabel="x" onSubmit={() => undefined} onCancel={() => undefined}>{null}</RecordFormPage>
          </div>
        </KeepAliveViews>
      </ActionBarSlotProvider></CommandProvider>,
    );
    expect(document.querySelector('[data-nx-action-bar-slot]')).toBeNull();
    expect(toolbars()).toHaveLength(1);
    expect(toolbars()[0].closest('.modal')).toBeNull();
  });
});

describe('slot order', () => {
  it('picks the first slot in DOM order, not registration order', () => {
    function Late() {
      const [show, setShow] = useState(false);
      return (
        <>
          <button onClick={() => setShow(true)}>show</button>
          {show && <div data-testid="first"><ActionBarSlot /></div>}
        </>
      );
    }
    function Page() {
      return (
        <CommandProvider><ActionBarSlotProvider breadcrumb={null}>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey="v" openKeys={['v']}>
            <Late />
            <div data-testid="second"><ActionBarSlot /></div>
          </KeepAliveViews>
        </ActionBarSlotProvider></CommandProvider>
      );
    }
    render(<Page />);
    expect(screen.getByTestId('second').contains(toolbars()[0])).toBe(true);
    act(() => screen.getByText('show').click());
    // The earlier-in-DOM slot registered later, and still wins.
    expect(screen.getByTestId('first').contains(toolbars()[0])).toBe(true);
    expect(toolbars()).toHaveLength(1);
  });
});

describe('slots hidden by page CSS', () => {
  // Vitest does not load the screens' CSS; the rules below stand in for crm-opportunities.css and document-page.css.
  function withStyle(css: string) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }

  it('skips a slot whose block a CSS rule hides and takes the next visible one', () => {
    const removeStyle = withStyle('.form-open > .list-head { display: none; }');
    render(
      <CommandProvider><ActionBarSlotProvider breadcrumb={null}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}>
          <div className="form-open">
            <div className="list-head"><div data-testid="list"><ActionBarSlot /></div></div>
            <div data-testid="form"><ActionBarSlot /></div>
          </div>
        </KeepAliveViews>
      </ActionBarSlotProvider></CommandProvider>,
    );
    expect(screen.getByTestId('form').contains(toolbars()[0])).toBe(true);
    expect(toolbars()).toHaveLength(1);
    removeStyle();
  });

  it('follows a CSS-only change of the slot block (reported by the ResizeObserver)', () => {
    const removeStyle = withStyle('.form-open > .list-head { display: none; }');
    const callbacks: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    function Page({ formOpen }: { formOpen: boolean }) {
      return (
        <CommandProvider><ActionBarSlotProvider breadcrumb={null}>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey="v" openKeys={['v']}>
            <div className={formOpen ? 'form-open' : undefined}>
              <div className="list-head"><div data-testid="list"><ActionBarSlot /></div></div>
              <div data-testid="other"><ActionBarSlot /></div>
            </div>
          </KeepAliveViews>
        </ActionBarSlotProvider></CommandProvider>
      );
    }
    const { rerender } = render(<Page formOpen={false} />);
    expect(screen.getByTestId('list').contains(toolbars()[0])).toBe(true);
    // Only a class changes: no slot mounts or unmounts.
    rerender(<Page formOpen />);
    act(() => callbacks.forEach((callback) => callback()));
    expect(screen.getByTestId('other').contains(toolbars()[0])).toBe(true);
    rerender(<Page formOpen={false} />);
    act(() => callbacks.forEach((callback) => callback()));
    expect(screen.getByTestId('list').contains(toolbars()[0])).toBe(true);
    vi.unstubAllGlobals();
    removeStyle();
  });

  it('an open DocumentSurface carries the bar under its title row while the list header is hidden', async () => {
    const removeStyle = withStyle('.workspace-view:has(> .doc-surface) > :not(.doc-surface) { display: none; }');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { DocumentSurface } = await import('../document-page/DocumentSurface');
    function Screen({ open }: { open: boolean }) {
      return (
        <CommandProvider><ActionBarSlotProvider breadcrumb={null}>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey="v" openKeys={['v']}>
            <div data-testid="list"><Header id="list" /></div>
            {open && <DocumentSurface title="Satış teklifi" code="T-1" onClose={() => {}}><p>Satırlar</p></DocumentSurface>}
          </KeepAliveViews>
        </ActionBarSlotProvider></CommandProvider>
      );
    }
    const { rerender } = render(<Screen open={false} />);
    expect(screen.getByTestId('list').contains(toolbars()[0])).toBe(true);
    rerender(<Screen open />);
    const surface = document.querySelector('.doc-surface')!;
    expect(surface.querySelector('.doc-surface-head + [data-nx-action-bar-slot]')!.contains(toolbars()[0])).toBe(true);
    expect(toolbars()).toHaveLength(1);
    rerender(<Screen open={false} />);
    expect(screen.getByTestId('list').contains(toolbars()[0])).toBe(true);
    scrollTo.mockRestore();
    removeStyle();
  });
});
