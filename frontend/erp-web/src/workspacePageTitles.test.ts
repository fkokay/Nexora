import { afterEach, describe, expect, it } from 'vitest';
import { setWorkspacePageTitle, withPageTitles, workspacePageTitles } from './workspacePageTitles';

afterEach(() => { for (const key of Object.keys(workspacePageTitles())) setWorkspacePageTitle(key, null); });

describe('çalışma sekmesi sayfa başlıkları', () => {
  const tabs = [{ id: 'customer-create', label: 'Yeni Cari Kart' }, { id: 'customers', label: 'Cari Hesaplar' }];
  it('başlık sekmenin sabit adının yerine geçer; yoksa sekme aynı nesne kalır', () => {
    setWorkspacePageTitle('customer-create', 'FATİH KOKAY');
    const shown = withPageTitles(tabs, workspacePageTitles());
    expect(shown.map((tab) => tab.label)).toEqual(['FATİH KOKAY', 'Cari Hesaplar']);
    expect(shown[1]).toBe(tabs[1]);
  });
  it('null ya da boş başlık kaldırır; aynı başlık depoyu değiştirmez', () => {
    setWorkspacePageTitle('customer-create', 'A');
    const before = workspacePageTitles();
    setWorkspacePageTitle('customer-create', ' A ');
    expect(workspacePageTitles()).toBe(before);
    setWorkspacePageTitle('customer-create', '  ');
    expect(workspacePageTitles()).toEqual({});
    setWorkspacePageTitle('customers', 'B');
    setWorkspacePageTitle('customers', null);
    expect(withPageTitles(tabs, workspacePageTitles()).map((tab) => tab.label)).toEqual(['Yeni Cari Kart', 'Cari Hesaplar']);
  });
});
