import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('../erpApi', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import { readPageQueries, usePageQueries, type PageQueryDefinition, type QueryState } from './usePageQueries';
import { useErpOperations } from './useErpOperations';
import type { ErpOperation } from './erpOperations';
import type { PageScope } from './pageBindings';

const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const columns = [{ code: 'id', label: 'Kimlik', dataType: 'guid' }];
const base = { module: 'Stok', sourceOperation: null, fixedBody: null, since: '2026-11-18', deprecated: false, allowed: true };
const listOp: ErpOperation = { ...base, name: 'stok.kart.listele', label: 'Stok kartları', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/stock/items',
  parameters: [{ name: 'q', in: 'query', type: 'text', required: false }], result: { shape: 'list', rowsPath: 'items', columns } };
const getOp: ErpOperation = { ...base, name: 'stok.kart.getir', label: 'Stok kartı', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/stock/items/{id}',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }], result: { shape: 'record', rowsPath: null, columns } };
const updateOp: ErpOperation = { ...base, name: 'stok.kart.guncelle', label: 'Stok kartı güncelle', kind: 'write', pageKind: 'update', method: 'PUT', route: '/api/stock/items/{id}',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text', required: false }],
  result: { shape: 'record', rowsPath: null, columns }, sourceOperation: 'stok.kart.getir' };
const catalog = new Map([listOp, getOp, updateOp].map((op) => [op.name, op]));

const listQuery: PageQueryDefinition = { id: 'q1', name: 'kartlar', kind: 'read', runOn: 'load', operation: 'stok.kart.listele',
  parameters: [{ name: 'q', binding: '{{ara.value}}', type: 'text' }] };
const getQuery: PageQueryDefinition = { id: 'q2', name: 'kart', kind: 'read', runOn: 'load', operation: 'stok.kart.getir',
  parameters: [{ name: 'id', binding: '{{secim.value}}', type: 'guid' }] };
const updateQuery: PageQueryDefinition = { id: 'q3', name: 'guncelle', kind: 'update', runOn: 'manual', operation: 'stok.kart.guncelle',
  parameters: [{ name: 'name', binding: '{{ad.value}}', type: 'text' }] };

const buildScope = (states: Record<string, QueryState>): PageScope => ({ ...states, ara: { value: 'ko' }, secim: { value: guid }, ad: { value: 'B' } });

function setup(queries: PageQueryDefinition[], operations: Map<string, ErpOperation> | null, previewId?: string) {
  return renderHook((props: { operations: Map<string, ErpOperation> | null }) =>
    usePageQueries({ queries, token: 't', pageCode: 'sayfa', previewId, buildScope, operations: props.operations }), { initialProps: { operations } });
}

afterEach(() => { apiMock.mockReset(); });

describe('usePageQueries ERP işlemleri', () => {
  it('reads operation from the page definition only when set', () => {
    const parsed = readPageQueries({ queries: [
      { id: 'a', name: 'a', kind: 'read', operation: 'stok.kart.listele', parameters: [] },
      { id: 'b', name: 'b', kind: 'read', parameters: [] },
    ] });
    expect(parsed[0].operation).toBe('stok.kart.listele');
    expect('operation' in parsed[1]).toBe(false);
  });

  it('runs operation read query and fills rows', async () => {
    apiMock.mockResolvedValue({ items: [{ id: guid }], totalCount: 5 });
    const { result } = setup([listQuery], catalog);
    await waitFor(() => expect(result.current.states.kartlar.ran).toBe(true));
    expect(apiMock).toHaveBeenCalledWith('/api/stock/items?q=ko', 't', { method: 'GET' });
    expect(result.current.states.kartlar).toMatchObject({ rows: [{ id: guid }], rowCount: 5, columns, loading: false, error: '' });
  });

  it('waits until catalog loads', async () => {
    apiMock.mockResolvedValue({ items: [], totalCount: 0 });
    const { result, rerender } = setup([listQuery], null);
    await act(async () => { await Promise.resolve(); });
    expect(apiMock).not.toHaveBeenCalled();
    expect(result.current.states.kartlar.loading).toBe(true);
    rerender({ operations: catalog });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.states.kartlar.loading).toBe(false));
  });

  it('unknown operation sets error without request', async () => {
    const { result } = setup([{ ...listQuery, operation: 'stok.kart.yok' }], catalog);
    await waitFor(() => expect(result.current.states.kartlar.error).toBe('ERP işlemi bulunamadı: stok.kart.yok'));
    expect(apiMock).not.toHaveBeenCalled();
    await expect(result.current.runWrite({ ...updateQuery, operation: 'stok.kart.yok' }, { name: 'B' })).rejects.toThrow('ERP işlemi bulunamadı: stok.kart.yok');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('refuses a write operation in a read query', async () => {
    const { result } = setup([{ ...listQuery, operation: 'stok.kart.guncelle' }], catalog);
    await waitFor(() => expect(result.current.states.kartlar.error).not.toBe(''));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('write merges source row and stores sonuc', async () => {
    apiMock.mockImplementation(async (_url: string, _token: string, init: { method: string }) =>
      init.method === 'GET' ? { Id: guid, name: 'A', rowVersion: 'AAA=' } : { id: guid, saved: true });
    const { result } = setup([getQuery, updateQuery], catalog);
    await waitFor(() => expect(result.current.states.kart.rows).toHaveLength(1));
    let written: unknown;
    await act(async () => { written = await result.current.runWrite(updateQuery, { name: 'B' }); });
    expect(written).toEqual({ affectedRows: 1 });
    const [url, token, init] = apiMock.mock.calls[1];
    expect(url).toBe(`/api/stock/items/${guid}`);
    expect(token).toBe('t');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ Id: guid, name: 'B', rowVersion: 'AAA=' });
    expect(result.current.states.guncelle).toMatchObject({ ran: true, loading: false, sonuc: { id: guid, saved: true } });
    expect(result.current.states.guncelle.fieldErrors).toBeUndefined();
  });

  it('write 400 sets fieldErrors and rethrows', async () => {
    const failure = Object.assign(new Error('Ad zorunlu.'), { status: 400, fieldErrors: { Name: ['Zorunlu.'] } });
    apiMock.mockImplementation(async (_url: string, _token: string, init: { method: string }) => {
      if (init.method === 'GET') return { Id: guid, name: 'A', rowVersion: 'AAA=' };
      throw failure;
    });
    const { result } = setup([getQuery, updateQuery], catalog);
    await waitFor(() => expect(result.current.states.kart.rows).toHaveLength(1));
    let thrown: unknown;
    await act(async () => { await result.current.runWrite(updateQuery, { name: '' }).catch((cause) => { thrown = cause; }); });
    expect(thrown).toBe(failure);
    expect(result.current.states.guncelle.fieldErrors).toEqual({ name: 'Zorunlu.' });
  });

  it('preview write is refused', async () => {
    apiMock.mockResolvedValue({ Id: guid, name: 'A', rowVersion: 'AAA=' });
    const { result } = setup([getQuery, updateQuery], catalog, 'taslak-1');
    await waitFor(() => expect(result.current.states.kart.rows).toHaveLength(1));
    expect(apiMock).toHaveBeenCalledWith(`/api/stock/items/${guid}`, 't', { method: 'GET' });
    await expect(result.current.runWrite(updateQuery, { name: 'B' }, true)).rejects.toThrow('Önizlemede ERP yazma işlemi çalıştırılmaz.');
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});

describe('useErpOperations', () => {
  it('fetches the catalog once per token, only when enabled', async () => {
    apiMock.mockResolvedValue({ operations: [listOp, getOp] });
    const { result, rerender } = renderHook((props: { token: string; enabled: boolean }) => useErpOperations(props.token, props.enabled),
      { initialProps: { token: 't', enabled: false } });
    await act(async () => { await Promise.resolve(); });
    expect(apiMock).not.toHaveBeenCalled();
    expect(result.current.operations).toBeNull();
    rerender({ token: 't', enabled: true });
    await waitFor(() => expect(result.current.operations?.get('stok.kart.getir')).toEqual(getOp));
    expect(apiMock).toHaveBeenCalledWith('/api/custom-pages/erp-operations', 't');
    rerender({ token: 't', enabled: true });
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('reports a catalog failure', async () => {
    apiMock.mockRejectedValue(new Error('Bu işlem için yetkiniz yok.'));
    const { result } = renderHook(() => useErpOperations('t', true));
    await waitFor(() => expect(result.current.error).toBe('Bu işlem için yetkiniz yok.'));
    expect(result.current.operations).toBeNull();
  });
});
