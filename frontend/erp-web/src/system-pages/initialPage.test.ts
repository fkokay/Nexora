import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeTenantKey, getInitialPage, tokenKey, workspaceStorageKey } from '../workspace-storage';

const setQuery = (query: string) => window.history.replaceState(null, '', `/${query}`);

describe('getInitialPage ?page=', () => {
  beforeEach(() => {
    localStorage.setItem(tokenKey, 'tok');
    localStorage.setItem(activeTenantKey, JSON.stringify({ id: 't1', name: 'Firma' }));
    sessionStorage.setItem(workspaceStorageKey('t1'), JSON.stringify({ activePage: 'customers' }));
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setQuery('');
  });

  it('opens a known built-in page key before restoring the session', () => {
    setQuery('?page=inventory-warehouses');
    expect(getInitialPage(false)).toBe('inventory-warehouses');
  });

  it.each([
    ['unknown key', '?page=no-such-page'],
    ['upper case', '?page=Inventory-Warehouses'],
    ['prefixed key', '?page=custom-page:ozel'],
    ['too long', `?page=${'a'.repeat(40)}`],
    ['empty', '?page='],
  ])('ignores %s and restores the session', (_name, query) => {
    setQuery(query);
    expect(getInitialPage(false)).toBe('customers');
  });
});
