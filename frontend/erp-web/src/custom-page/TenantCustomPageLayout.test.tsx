import { cleanup, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { CommandProvider } from '../commands/CommandProvider';
// Gelişmiş ızgara (dataTable) sayfa komutlarını kaydeder; uygulamadaki gibi CommandProvider içinde çizilir.
const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantCustomPage from '../TenantCustomPage';

const definition = {
  schemaVersion: 2,
  components: [
    { id: 'in1', type: 'input', name: 'sube', props: { inputType: 'text', label: 'Şube Adı' } },
    { id: 'in2', type: 'input', name: 'serbest', props: { inputType: 'text', label: 'Serbest Giriş' } },
    { id: 'fc', type: 'formCard', props: { title: 'Form', columns: 2, inputs: ['in1'] } },
    { id: 'tbl', type: 'dataTable', name: 'Siparisler', props: { title: 'Tablo' } },
    { id: 'cp', type: 'contextPanel', props: { title: 'Detay', table: 'tbl', fields: ['Ad=Ünvan'] } },
  ],
  queries: [],
};

vi.mock('../erpApi', () => ({
  api: vi.fn(async (endpoint: string) => endpoint.includes('/published')
    ? { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], definitionJson: JSON.stringify(definition) }
    : { entity: { name: 'x', fields: [] }, items: [], total: 0 }),
}));

afterEach(cleanup);

describe('TenantCustomPage yerleşim bileşenleri', () => {
  it('formCard girişi tam bir kez ve form kartı içinde çizilir; bağlam paneli boş durumu gösterir', async () => {
    const { container } = render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(screen.getAllByText('Serbest Giriş').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Şube Adı').length).toBe(1);
    expect(container.querySelector('.tenant-page-form-card')!.textContent).toContain('Şube Adı');
    expect(container.querySelector('.tenant-page-form-card')!.textContent).not.toContain('Serbest Giriş');
    expect(screen.getByText('Bir satır seçin')).toBeTruthy();
  });
});
