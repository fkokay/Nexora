import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFINITION_DRAWER_QUERY, DefinitionEmptyPane, DefinitionLayout } from './DefinitionLayout';

function stubMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === DEFINITION_DRAWER_QUERY && matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (paneOpen: boolean) => (
  <DefinitionLayout
    paneOpen={paneOpen}
    paneLabel="Depo kaydı"
    list={<button type="button">Liste</button>}
    pane={paneOpen ? <input aria-label="Depo adı" /> : <DefinitionEmptyPane>Bir depo seçin.</DefinitionEmptyPane>}
  />
);
const list = () => document.querySelector<HTMLElement>('.nx-def-list')!;

describe('DefinitionLayout', () => {
  it('puts the list and the record pane side by side; the pane is a labelled region', () => {
    stubMedia(false);
    const { rerender } = render(view(false));
    const pane = screen.getByRole('region', { name: 'Depo kaydı' });
    expect(pane.textContent).toBe('Bir depo seçin.');
    expect(document.querySelector('.nx-def')!.classList.contains('is-pane-open')).toBe(false);
    rerender(view(true));
    expect(document.querySelector('.nx-def')!.classList.contains('is-pane-open')).toBe(true);
    // Wide: the list stays usable beside the form.
    expect(list().hasAttribute('inert')).toBe(false);
  });

  it('below 1280px the open pane is a drawer and the list behind it is inert', () => {
    stubMedia(true);
    const { rerender } = render(view(true));
    expect(list().hasAttribute('inert')).toBe(true);
    rerender(view(false));
    expect(list().hasAttribute('inert')).toBe(false);
  });
});
