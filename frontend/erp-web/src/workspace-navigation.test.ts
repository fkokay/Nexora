import { describe, expect, it } from 'vitest';
import { knownPageTitle, workspacePageLabel } from './workspace-navigation';

describe('knownPageTitle', () => {
  it('names a page that is not an open tab (ör. URL ile açılan sistem sayfası önizlemesi)', () => {
    expect(knownPageTitle('inventory-stock', 'tr')).toBe('Stok Kartları');
    expect(knownPageTitle('inventory-stock-create', 'tr')).toBe('Yeni stok kartı');
    expect(knownPageTitle('inventory-stock', 'en')).toBe('Stock items');
    expect(knownPageTitle('no-such-page', 'tr')).toBeUndefined();
  });
});

describe('workspacePageLabel', () => {
  const searchPages = [{ page: 'customers', label: 'Cari Hesaplar', description: 'Cari' }, { page: 'finance-trial-balance', label: 'Mizan', description: 'Finans' }];
  it('falls back to the search index title when the page has no tab or only a raw-key tab', () => {
    expect(workspacePageLabel('customers', 'tr', [], searchPages)).toBe('Cari Hesaplar');
    expect(workspacePageLabel('finance-trial-balance', 'tr', [{ id: 'finance-trial-balance', label: 'finance trial balance' }], searchPages)).toBe('Mizan');
    expect(workspacePageLabel('customers', 'tr', [{ id: 'customers', label: 'Cariler' }], searchPages)).toBe('Cariler');
    expect(workspacePageLabel('inventory-stock', 'tr', [], searchPages)).toBe('Stok Kartları');
    expect(workspacePageLabel('no-such-page', 'tr', [], searchPages)).toBe('no such page');
  });
});
