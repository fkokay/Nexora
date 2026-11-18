import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeTenantKey, getInitialPage, readSystemPreview, tokenKey, workspaceStorageKey } from '../workspace-storage';

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

describe('readSystemPreview', () => {
  const DRAFT = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  it('reads a built-in screen key with a draft id; the page itself opens on that key', () => {
    expect(readSystemPreview(`?page=inventory-stock&systemPreview=${DRAFT}`)).toEqual({ screenKey: 'inventory-stock', previewId: DRAFT });
    window.history.replaceState(null, '', `/?page=inventory-stock&systemPreview=${DRAFT}`);
    localStorage.setItem(tokenKey, 'tok');
    expect(getInitialPage(false)).toBe('inventory-stock');
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });
  it.each([
    ['no draft', '?page=inventory-stock'],
    ['bad draft id', '?page=inventory-stock&systemPreview=abc'],
    ['unknown key', `?page=no-such-page&systemPreview=${DRAFT}`],
    ['no key', `?systemPreview=${DRAFT}`],
  ])('ignores %s', (_name, query) => {
    expect(readSystemPreview(query)).toBeNull();
  });
});
