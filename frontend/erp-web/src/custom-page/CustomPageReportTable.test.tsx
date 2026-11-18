import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantReportWidget from '../TenantReportWidget';

vi.mock('../erpApi', () => ({
  api: vi.fn(async () => ({
    entity: { name: 'Sipariş', fields: [{ code: 'Durum', label: 'Durum', dataType: 'text' }] },
    items: [{ id: '1', values: { Durum: 'Aktif' } }], total: 1,
  })),
}));

afterEach(cleanup);

describe('TenantReportWidget biçimleri', () => {
  it('status etiketi ve comfort yoğunluğu uygulanır', async () => {
    const { container } = render(<TenantReportWidget kind="dataTable" source="tenantData:siparis" columns={['Durum']} title="T" description="" token="t"
      columnFormats={['Durum=status']} toneMap={['Aktif=success']} density="comfort" />);
    const tag = await screen.findByText('Aktif');
    expect(tag.classList.contains('tenant-page-tag')).toBe(true);
    expect(tag.classList.contains('tone-success')).toBe(true);
    expect(container.querySelector('table')!.classList.contains('is-comfort')).toBe(true);
  });
});
