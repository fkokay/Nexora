import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';

// Kayıttan sonraki eylem (afterSaveButton ve afterSaveAction: page) az önce biten yazmanın sonucunu (`{{<sorgu>.sonuc.id}}`) görür:
// sonuç sayfa kapsamına çizimden önce bindirilir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const operations = [{
  name: 'test.olustur', label: 'Oluştur', module: 'Test', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/things',
  parameters: [{ name: 'name', in: 'body', type: 'text', required: true, items: null }],
  result: { shape: 'record', rowsPath: null, columns: [{ code: 'id', label: 'id', dataType: 'guid' }], flatten: [], metaPaths: [] },
  sourceOperation: null, fixedBody: null, since: '2026-11-22', deprecated: false, allowed: true, routeVariants: [], bodyMap: null,
}];
const NEW_ID = '99999999-9999-9999-9999-999999999999';
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function setup(barProps: Record<string, unknown>, extra: unknown[] = []) {
  const components = [
    { id: 'ad', type: 'input', name: 'ad', props: { inputType: 'text', label: 'Ad' } },
    { id: 'kart', type: 'formCard', props: { inputs: ['ad'] } },
    ...extra,
    { id: 'bar', type: 'actionBar', props: { saveQuery: 'olustur', ...barProps } },
  ];
  const queries = [{ id: 'olustur', name: 'olustur', kind: 'insert', runOn: 'manual', operation: 'test.olustur',
    parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }] }];
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint.endsWith('/published')) {
      return { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    if (endpoint === '/api/things' && init?.method === 'POST') return { id: NEW_ID };
    return {};
  });
  return render(<CommandProvider><ActionBar locale="tr" />
    <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews><ConfirmDialogHost /></CommandProvider>);
}

const T = { timeout: 5000 };
const save = async () => {
  const command = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>('[data-command="save"]')!;
  await waitFor(() => expect(command().getAttribute('aria-disabled')).not.toBe('true'), T);
  fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'Yeni' } });
  fireEvent.click(command());
};

beforeEach(() => { navigations = []; api.mockReset(); window.addEventListener(OPEN_PAGE_EVENT, onNavigate); });
afterEach(() => { window.removeEventListener(OPEN_PAGE_EVENT, onNavigate); cleanup(); });

describe('after-save actions see the finished write result', () => {
  it('afterSaveButton erpPage navigation binds {{olustur.sonuc.id}}', async () => {
    setup({ afterSaveButton: 'ac' }, [{ id: 'ac', type: 'button', props: { text: 'Aç', actionType: 'erpPage', pageKey: 'sales-purchasing',
      params: ['thingId={{olustur.sonuc.id}}'] } }]);
    await save();
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'sales-purchasing', params: { thingId: NEW_ID } });
  });
});
