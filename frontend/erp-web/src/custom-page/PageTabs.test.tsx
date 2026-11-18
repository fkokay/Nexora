import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageTabs } from './PageTabs';

const tabs = [{ label: 'Genel', ids: ['a'] }, { label: 'Ayrıntı', ids: ['b'] }, { label: 'Notlar', ids: ['c'] }];

const renderOwned = (id: string) => <div key={id} className={`tenant-page-input${id === 'a' ? ' is-invalid' : ''}`}>
  <input aria-label={`giris-${id}`} />
</div>;

function setup(extra: Partial<Parameters<typeof PageTabs>[0]> = {}) {
  return render(<PageTabs id="t" tabs={tabs} defaultTab={0} renderOwned={renderOwned} errorCounts={[0, 0, 0]} jumpTo={null} style={{}} {...extra} />);
}

afterEach(cleanup);

describe('PageTabs', () => {
  it('renders all panels and hides inactive', () => {
    setup({ defaultTab: 1 });
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(3);
    expect(panels.map((panel) => panel.hasAttribute('hidden'))).toEqual([true, false, true]);
    const tabButtons = screen.getAllByRole('tab');
    expect(tabButtons.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabButtons[1].getAttribute('aria-controls')).toBe(panels[1].id);
    expect(screen.getByLabelText('giris-a')).toBeTruthy();
  });

  it('arrow keys move selection', () => {
    setup();
    const tabButtons = screen.getAllByRole('tab');
    tabButtons[0].focus();
    fireEvent.keyDown(tabButtons[0], { key: 'ArrowRight' });
    expect(tabButtons[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabButtons[1]);
    fireEvent.keyDown(tabButtons[1], { key: 'End' });
    expect(tabButtons[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabButtons[2], { key: 'ArrowRight' });
    expect(tabButtons[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabButtons[0], { key: 'ArrowLeft' });
    expect(tabButtons[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabButtons[2], { key: 'Home' });
    expect(tabButtons[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabButtons[0]);
  });

  it('shows error badge', () => {
    setup({ errorCounts: [0, 2, 0] });
    const tabButtons = screen.getAllByRole('tab');
    expect(tabButtons[1].classList.contains('is-error')).toBe(true);
    expect(tabButtons[1].querySelector('.tenant-page-tab-badge')?.textContent).toBe('2');
    expect(tabButtons[0].classList.contains('is-error')).toBe(false);
    expect(tabButtons[0].querySelector('.tenant-page-tab-badge')).toBeNull();
  });

  it('jumpTo activates tab and focuses first invalid input', async () => {
    const view = setup({ defaultTab: 2 });
    view.rerender(<PageTabs id="t" tabs={tabs} defaultTab={2} renderOwned={renderOwned} errorCounts={[1, 0, 0]} jumpTo={{ tab: 0, signal: 1 }} style={{}} />);
    await waitFor(() => expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('giris-a')));
  });
});
