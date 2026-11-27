import { cleanup, fireEvent, render as renderPlain, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { api } from '../erpApi';
import { forgetOpener, setPageParams } from '../pageNavigation';
import TenantCustomPage from '../TenantCustomPage';
import { recordComponents, recordDefinition, recordRow } from './recordTemplateFixture';

// Ortak kalıp özellikleri: Kayıt kartında sekmede özel alan bloğu; pencerede satır tablosu (`editableGrid`, list kipi).

const render = (ui: Parameters<typeof renderPlain>[0]) => renderPlain(ui, { wrapper: CommandProvider });
vi.mock('../erpApi', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const TAB = 'custom-page:p';
const T = { timeout: 5000 };
let definition: unknown;

beforeEach(() => {
  localStorage.clear();
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (endpoint: string, _token?: string, init?: RequestInit) => {
    if (endpoint.includes('/published')) return { id: 'p', code: 'p', name: 'Cari kartı', revision: 1, forms: [], definitionJson: JSON.stringify(definition), rights: { view: true, insert: true, update: true, delete: true } } as never;
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: [] } as never;
    const body = typeof init?.body === 'string' ? init.body : '';
    if (endpoint.includes('/queries/tanim/run'))
      return { columns: [], rows: [{ code: 'RENK', label: 'Renk kodu', dataType: 'Text' }], rowCount: 1, truncated: false } as never;
    if (endpoint.includes('/queries/kayit/run')) return { columns: [], rows: body.includes('C-1001') ? [recordRow] : [], rowCount: 1, truncated: false } as never;
    return { columns: [], rows: [], rowCount: 0, truncated: false } as never;
  });
});
afterEach(() => { cleanup(); setPageParams(TAB, {}); forgetOpener(TAB); });

describe('kalıplı sayfada özel alan bloğu ve satır tablosu', () => {
  it('draws the custom fields block inside its tab on a Kayıt kartı', async () => {
    const queries = [
      { id: 'kayit', name: 'kayit', kind: 'read', runOn: 'load', sql: 'SELECT * FROM C WHERE Code = @kod', parameters: [{ name: 'kod', binding: '{{sayfa.parametre.kod}}', type: 'text' }] },
      { id: 'tanim', name: 'tanim', kind: 'read', runOn: 'load', sql: 'SELECT 1', parameters: [] },
    ];
    const components = recordComponents.filter((component) => component.id !== 'l1' && component.id !== 'b_ekstre').map((component) => component.id === 't'
      ? { ...component, props: { ...component.props, tabs: ['Genel=s1,n1', 'Özel alanlar=ozel'] } } : component);
    definition = { ...recordDefinition(components), queries, components: [...components,
      { id: 'ozel', type: 'customFieldsBlock', name: 'ozel', props: { slot: 'customFields', title: 'Özel alanlar', definitionsQuery: 'tanim', columns: 2 } }] };
    setPageParams(TAB, { kod: 'C-1001' });
    render(<TenantCustomPage code="p" token="t" />);
    await waitFor(() => expect(screen.getByText('Genel')).toBeTruthy(), T);
    fireEvent.click(screen.getByRole('tab', { name: /Özel alanlar/ }));
    expect(await screen.findByLabelText(/Renk kodu/, undefined, T)).toBeTruthy();
  });

  it('draws the row table and the custom fields block inside a templated window and adds rows', async () => {
    const queries = [
      { id: 'liste', name: 'liste', kind: 'read', runOn: 'load', sql: 'SELECT 1 AS x', parameters: [] },
      { id: 'tanim', name: 'tanim', kind: 'read', runOn: 'load', sql: 'SELECT 1', parameters: [] },
      { id: 'kaydet', name: 'kaydet', kind: 'insert', runOn: 'manual', sql: 'INSERT INTO N (A) VALUES (1)', parameters: [] },
    ];
    definition = { schemaVersion: 2, template: { name: 'list' }, queries, components: [
      { id: 'liste_t', type: 'dataTable', name: 'liste', props: { slot: 'list', query: 'liste', title: 'Liste', columns: ['x'] } },
      { id: 'ac', type: 'button', props: { slot: 'actions', text: 'Hareket', actionType: 'openDialog', dialogId: 'pencere' } },
      { id: 'pencere', type: 'dialog', props: { slot: 'dialogs', presentation: 'dialog', size: 'lg', title: 'Hareket', contains: ['izleme', 'ozel'], saveQuery: 'kaydet' } },
      { id: 'izleme', type: 'editableGrid', name: 'izleme', props: { slot: 'dialog', gridMode: 'list', title: 'Lot / seri satırları', description: 'Seri numaralarında miktar 1 olmalıdır.', maxRows: 200,
        gridColumns: ['trackingCode|Lot / seri kodu|text|required,unique', 'quantity|Miktar|number|required,min:0.0001'] } },
      { id: 'ozel', type: 'customFieldsBlock', name: 'ozel', props: { slot: 'dialog', title: 'Özel alanlar', definitionsQuery: 'tanim' } },
    ] };
    render(<TenantCustomPage code="p" token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hareket' }, T));
    const dialog = await screen.findByRole('dialog', undefined, T);
    expect(await screen.findByText('Lot / seri satırları', undefined, T)).toBeTruthy();
    expect(screen.getByText('Seri numaralarında miktar 1 olmalıdır.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    expect(await screen.findByLabelText(/Lot \/ seri kodu \(satır 1\)/, undefined, T)).toBeTruthy();
    expect(await screen.findByLabelText(/Renk kodu/, undefined, T)).toBeTruthy();
    expect(dialog.contains(screen.getByLabelText(/Renk kodu/))).toBe(true);
  });
});
