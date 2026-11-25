import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasTabsContext } from '../designer-canvas/anchorContext';
import { boundTab, PageTabs } from './PageTabs';

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

describe('PageTabs activeIndex', () => {
  const selected = () => screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected') === 'true');
  const hidden = () => screen.getAllByRole('tabpanel', { hidden: true }).map((panel) => panel.hasAttribute('hidden'));

  it('a controlled activeIndex wins over the own state and is clamped', () => {
    const view = setup({ activeIndex: 2 });
    expect(selected()).toEqual([false, false, true]);
    expect(hidden()).toEqual([true, true, false]);
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(selected()).toEqual([false, false, true]);
    view.rerender(<PageTabs id="t" tabs={tabs} defaultTab={0} renderOwned={renderOwned} errorCounts={[0, 0, 0]} jumpTo={null} style={{}} activeIndex={9} />);
    expect(selected()).toEqual([false, false, true]);
  });

  it('the canvas context selects the tab by component id; other ids keep their own state', () => {
    render(<CanvasTabsContext.Provider value={new Map([['t', 1], ['baska', 2]])}>
      <PageTabs id="t" tabs={tabs} defaultTab={0} renderOwned={renderOwned} errorCounts={[0, 0, 0]} jumpTo={null} style={{}} />
    </CanvasTabsContext.Provider>);
    expect(selected()).toEqual([false, true, false]);
    cleanup();
    render(<CanvasTabsContext.Provider value={new Map([['baska', 2]])}>
      <PageTabs id="t" tabs={tabs} defaultTab={0} renderOwned={renderOwned} errorCounts={[0, 0, 0]} jumpTo={null} style={{}} />
    </CanvasTabsContext.Provider>);
    expect(selected()).toEqual([true, false, false]);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(selected()).toEqual([false, true, false]);
  });
});

describe('boundTab', () => {
  const scope = { birimler: { rowCount: 2 }, kart: { code: 'KLM' }, bos: {} };
  it('turns a trailing binding into the tab count and leaves static labels alone', () => {
    expect(boundTab({ label: 'Birimler {{birimler.rowCount}}', ids: ['a'] }, scope)).toEqual({ label: 'Birimler', ids: ['a'], count: '2' });
    expect(boundTab({ label: 'Birimler {{bos.rowCount}}', ids: ['a'] }, scope)).toEqual({ label: 'Birimler', ids: ['a'] });
    expect(boundTab({ label: 'Genel', ids: ['a'] }, scope)).toEqual({ label: 'Genel', ids: ['a'] });
    expect(boundTab({ label: '{{kart.code}} ayrıntı', ids: ['a'] }, scope)).toEqual({ label: 'KLM ayrıntı', ids: ['a'] });
  });
  it('draws the count next to the label', () => {
    render(<PageTabs id="c" tabs={[{ label: 'Birimler', ids: ['a'], count: '3' }, { label: 'Notlar', ids: ['c'] }]} defaultTab={0} renderOwned={renderOwned}
      errorCounts={[0, 0]} jumpTo={null} style={{}} />);
    expect(screen.getByRole('tab', { name: 'Birimler 3' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Notlar' })).toBeTruthy();
  });
});
