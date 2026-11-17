import { describe, expect, it } from 'vitest';
import { buildOperationRequest, fieldErrorsByParameter, mapOperationResult, type ErpOperation } from './erpOperations';

const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const columns = [{ code: 'id', label: 'Kimlik', dataType: 'guid' }];

function op(extra: Partial<ErpOperation>): ErpOperation {
  return {
    name: 'stok.kart.listele', label: 'Stok kartları', module: 'Stok', kind: 'read', pageKind: 'read', method: 'GET', route: '/api/stock/items',
    parameters: [], result: { shape: 'list', rowsPath: 'items', columns }, sourceOperation: null, fixedBody: null,
    since: '2026-11-18', deprecated: false, allowed: true, ...extra,
  };
}

const list = op({ parameters: [
  { name: 'q', in: 'query', type: 'text', required: false },
  { name: 'page', in: 'query', type: 'int', required: false },
  { name: 'pageSize', in: 'query', type: 'int', required: false },
] });
const update = op({
  name: 'stok.kart.guncelle', kind: 'write', pageKind: 'update', method: 'PUT', route: '/api/stock/items/{id}',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }, { name: 'name', in: 'body', type: 'text', required: false }],
  result: { shape: 'record', rowsPath: null, columns }, sourceOperation: 'stok.kart.getir',
});
const deactivate = op({
  name: 'stok.kart.pasiflestir', kind: 'write', pageKind: 'update', method: 'POST', route: '/api/stock/items/{id}/deactivate',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }],
  result: { shape: 'none', rowsPath: null, columns: [] }, sourceOperation: 'stok.kart.getir', fixedBody: { confirmation: true },
});

describe('buildOperationRequest', () => {
  it('builds the GET list URL', () => {
    const request = buildOperationRequest(list, { q: 'ko li', page: 2, pageSize: null }, null);
    expect(request).toEqual({ url: '/api/stock/items?q=ko+li&page=2', method: 'GET' });
    expect(request.body).toBeUndefined();
  });

  it('fills route from source when unbound', () => {
    const request = buildOperationRequest(update, { name: 'B' }, { Id: guid, name: 'A', rowVersion: 'AAA=' });
    expect(request.url).toBe(`/api/stock/items/${guid}`);
    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body!)).toEqual({ Id: guid, name: 'B', rowVersion: 'AAA=' });
  });

  it('merges fixedBody', () => {
    const request = buildOperationRequest(deactivate, {}, { id: guid, rowVersion: 'BBB=' });
    expect(request.url).toBe(`/api/stock/items/${guid}/deactivate`);
    const body = JSON.parse(request.body!);
    expect(body.confirmation).toBe(true);
    expect(body.rowVersion).toBe('BBB=');
  });

  it('rejects bad guid route param', () => {
    expect(() => buildOperationRequest(update, { id: '../x', name: 'B' }, null)).toThrow('Geçersiz parametre: id');
  });

  it('rejects a missing required route param', () => {
    expect(() => buildOperationRequest(update, { name: 'B' }, null)).toThrow('Geçersiz parametre: id');
  });

  it('rejects a non-integer int route param', () => {
    const byNumber = op({ route: '/api/x/{no}', parameters: [{ name: 'no', in: 'route', type: 'int', required: true }] });
    expect(() => buildOperationRequest(byNumber, { no: '1/2' }, null)).toThrow('Geçersiz parametre: no');
    expect(buildOperationRequest(byNumber, { no: 12 }, null).url).toBe('/api/x/12');
  });

  it('sends no body for DELETE', () => {
    const remove = op({ method: 'DELETE', kind: 'write', pageKind: 'delete', route: '/api/stock/items/{id}',
      parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }] });
    expect(buildOperationRequest(remove, { id: guid }, null)).toEqual({ url: `/api/stock/items/${guid}`, method: 'DELETE' });
  });
});

describe('mapOperationResult', () => {
  it('maps list rows', () => {
    expect(mapOperationResult(list, { items: [{ a: 1 }], totalCount: 7 })).toEqual({ rows: [{ a: 1 }], rowCount: 7, columns });
  });

  it('maps a root array', () => {
    const rootList = op({ result: { shape: 'list', rowsPath: null, columns } });
    expect(mapOperationResult(rootList, [{ a: 1 }, { a: 2 }])).toEqual({ rows: [{ a: 1 }, { a: 2 }], rowCount: 2, columns });
  });

  it('maps a record', () => {
    expect(mapOperationResult(update, { id: guid, name: 'A' })).toEqual({ rows: [{ id: guid, name: 'A' }], rowCount: 1, columns });
  });

  it('maps shape none', () => {
    expect(mapOperationResult(deactivate, { ok: true })).toEqual({ rows: [], rowCount: 0, columns: [] });
  });
});

describe('fieldErrorsByParameter', () => {
  it('maps field errors case-insensitively', () => {
    const create = op({ parameters: [{ name: 'code', in: 'body', type: 'text', required: true }] });
    expect(fieldErrorsByParameter(create, { Code: ['Zorunlu.'] })).toEqual({ code: 'Zorunlu.' });
    expect(fieldErrorsByParameter(create, undefined)).toEqual({});
  });
});
