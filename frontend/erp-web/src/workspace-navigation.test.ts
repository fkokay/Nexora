import { describe, expect, it } from 'vitest';
import { knownPageTitle } from './workspace-navigation';

describe('knownPageTitle', () => {
  it('names a page that is not an open tab (ör. URL ile açılan sistem sayfası önizlemesi)', () => {
    expect(knownPageTitle('inventory-stock', 'tr')).toBe('Stok Kartları');
    expect(knownPageTitle('inventory-stock-create', 'tr')).toBe('Yeni stok kartı');
    expect(knownPageTitle('inventory-stock', 'en')).toBe('Stock items');
    expect(knownPageTitle('no-such-page', 'tr')).toBeUndefined();
  });
});
