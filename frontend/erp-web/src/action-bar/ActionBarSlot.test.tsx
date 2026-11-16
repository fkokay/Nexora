import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
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
});
