import { describe, expect, it } from 'vitest';
import { buildOperationRequest, chooseRoute, fieldErrorsByParameter, mapOperationResult, missingRouteValue, sourceRecordError, staleSourceError, type ErpOperation } from './erpOperations';

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

  it('null keeps the source value unless the parameter was cleared by the user', () => {
    const source = { id: guid, name: 'A', rowVersion: 'AAA=' };
    expect(JSON.parse(buildOperationRequest(update, { name: null }, source).body!)).toEqual(source);
    expect(JSON.parse(buildOperationRequest(update, { name: null }, source, null, new Set(['name'])).body!)).toEqual({ ...source, name: null });
    // Yalnız null değer temizler; dolu değer her zaman yazılır.
    expect(JSON.parse(buildOperationRequest(update, { name: 'B' }, source, null, new Set(['name'])).body!)).toEqual({ ...source, name: 'B' });
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

  it('rejects dot segments in text route params', () => {
    const byCode = op({ route: '/api/x/{code}', parameters: [{ name: 'code', in: 'route', type: 'text', required: true }] });
    expect(() => buildOperationRequest(byCode, { code: '..' }, null)).toThrow('Geçersiz parametre: code');
    expect(() => buildOperationRequest(byCode, { code: '.' }, null)).toThrow('Geçersiz parametre: code');
    expect(buildOperationRequest(byCode, { code: 'a/b' }, null).url).toBe('/api/x/a%2Fb');
  });

  it('null bound body value keeps the source value; empty string overwrites', () => {
    const withCategory = op({ method: 'PUT', kind: 'write', pageKind: 'update', route: '/api/x',
      parameters: [{ name: 'category', in: 'body', type: 'text', required: false }] });
    expect(JSON.parse(buildOperationRequest(withCategory, { category: null }, { category: 'A' }).body!)).toEqual({ category: 'A' });
    expect(JSON.parse(buildOperationRequest(withCategory, { category: undefined }, { Category: 'A' }).body!)).toEqual({ Category: 'A' });
    expect(JSON.parse(buildOperationRequest(withCategory, { category: '' }, { category: 'A' }).body!)).toEqual({ category: '' });
    expect(JSON.parse(buildOperationRequest(withCategory, { category: null }, null).body!)).toEqual({ category: null });
  });

  it('reports missing route values without throwing', () => {
    expect(missingRouteValue(update, { name: 'B' }, null)).toBe(true);
    expect(missingRouteValue(update, { id: '' }, { Id: guid })).toBe(false);
    expect(missingRouteValue(update, { id: '../x' }, null)).toBe(false);
  });

  it('sends no body for DELETE', () => {
    const remove = op({ method: 'DELETE', kind: 'write', pageKind: 'delete', route: '/api/stock/items/{id}',
      parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }] });
    expect(buildOperationRequest(remove, { id: guid }, null)).toEqual({ url: `/api/stock/items/${guid}`, method: 'DELETE' });
  });
});

describe('mapOperationResult', () => {
  it('maps list rows', () => {
    expect(mapOperationResult(list, { items: [{ a: 1 }], totalCount: 7 })).toEqual({ rows: [{ a: 1 }], rowCount: 7, columns, meta: {} });
  });

  it('maps a root array', () => {
    const rootList = op({ result: { shape: 'list', rowsPath: null, columns } });
    expect(mapOperationResult(rootList, [{ a: 1 }, { a: 2 }])).toEqual({ rows: [{ a: 1 }, { a: 2 }], rowCount: 2, columns, meta: {} });
  });

  it('maps a record', () => {
    expect(mapOperationResult(update, { id: guid, name: 'A' })).toEqual({ rows: [{ id: guid, name: 'A' }], rowCount: 1, columns, meta: {} });
  });

  it('maps shape none', () => {
    expect(mapOperationResult(deactivate, { ok: true })).toEqual({ rows: [], rowCount: 0, columns: [], meta: {} });
  });
});

describe('fieldErrorsByParameter', () => {
  it('maps field errors case-insensitively', () => {
    const create = op({ parameters: [{ name: 'code', in: 'body', type: 'text', required: true }] });
    expect(fieldErrorsByParameter(create, { Code: ['Zorunlu.'] })).toEqual({ code: 'Zorunlu.' });
    expect(fieldErrorsByParameter(create, undefined)).toEqual({});
  });
});

const balances = op({
  name: 'stok.bakiye.sayfa', route: '/api/warehouses/balances/page',
  routeVariants: [{ route: '/api/warehouses/{warehouseId}/balances/page', when: 'warehouseId' }],
  parameters: [
    { name: 'warehouseId', in: 'route', type: 'guid', required: false },
    { name: 'q', in: 'query', type: 'text', required: false },
  ],
  result: { shape: 'list', rowsPath: 'items', columns: [{ code: 'balance.code', label: 'Kod', dataType: 'text' }],
    flatten: ['balance', 'stockItem'], metaPaths: ['page', 'pageSize', 'totalCount', 'belowMinimumCount'] },
});
const saveFields = op({
  name: 'stok.kart.ozelAlanKaydet', kind: 'write', pageKind: 'update', method: 'PUT', route: '/api/stock/items/{id}/custom-fields',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }], result: { shape: 'none', rowsPath: null, columns: [] },
  bodyMap: { property: 'values', sourceOperation: 'stok.kart.ozelAlanDegerleri', keyColumn: 'code', valueColumn: 'value' },
});

describe('route variants', () => {
  it('chooses variant route when warehouseId set', () => {
    expect(chooseRoute(balances, { warehouseId: guid })).toBe('/api/warehouses/{warehouseId}/balances/page');
    const request = buildOperationRequest(balances, { warehouseId: guid, q: 'a' }, null);
    expect(request).toEqual({ url: `/api/warehouses/${guid}/balances/page?q=a`, method: 'GET' });
    expect(request.url.split('?')[1]).not.toContain(guid);
  });

  it('chooses base route for empty warehouseId', () => {
    expect(chooseRoute(balances, { warehouseId: '' })).toBe('/api/warehouses/balances/page');
    expect(buildOperationRequest(balances, { warehouseId: '' }, null)).toEqual({ url: '/api/warehouses/balances/page', method: 'GET' });
    expect(buildOperationRequest(balances, { warehouseId: null }, null).url).toBe('/api/warehouses/balances/page');
  });

  it('missingRouteValue is false for unset optional variant param', () => {
    expect(missingRouteValue(balances, { warehouseId: '' }, null)).toBe(false);
    expect(missingRouteValue(balances, {}, null)).toBe(false);
  });

  it('sourceRecordError checks the chosen route', () => {
    const sourced = op({ ...balances, kind: 'write', sourceOperation: 'x' });
    expect(sourceRecordError(sourced, { warehouseId: guid }, { warehouseId: guid.replace('1', '2') })).toBe('Kaynak kayıt seçili kayıtla eşleşmiyor.');
    expect(sourceRecordError(sourced, { warehouseId: '' }, { warehouseId: 'other' })).toBeNull();
  });
});

describe('flatten and meta', () => {
  it('flattens nested rows and keeps nested objects', () => {
    const json = { items: [{ balance: { code: 'A', quantityOnHand: 3 }, stockItem: { id: 'x', tags: ['t'] } }] };
    const before = JSON.stringify(json);
    const { rows } = mapOperationResult(balances, json);
    expect(rows[0]['balance.code']).toBe('A');
    expect(rows[0]['balance.quantityOnHand']).toBe(3);
    expect(rows[0]['stockItem.id']).toBe('x');
    expect('stockItem.tags' in rows[0]).toBe(false);
    expect((rows[0].balance as { code: string }).code).toBe('A');
    expect(JSON.stringify(json)).toBe(before);
    expect(rows[0]).not.toBe(json.items[0]);
  });

  it('flattens a record row too', () => {
    const record = op({ ...balances, result: { ...balances.result, shape: 'record', rowsPath: null } });
    expect(mapOperationResult(record, { balance: { code: 'A' } }).rows[0]['balance.code']).toBe('A');
  });

  it('copies metaPaths into meta', () => {
    const mapped = mapOperationResult(balances, { items: [], totalCount: 7, belowMinimumCount: 2, extra: 1 });
    expect(mapped.meta).toEqual({ totalCount: 7, belowMinimumCount: 2 });
    expect(mapped.rowCount).toBe(7);
    expect(mapOperationResult(balances, [1, 2]).meta).toEqual({});
    expect(mapOperationResult(balances, 'x').meta).toEqual({});
  });

  it('ops without new fields still map', () => {
    const legacy = { ...list, result: { shape: 'list' as const, rowsPath: 'items', columns } };
    expect(mapOperationResult(legacy, { items: [{ a: { b: 1 } }], totalCount: 1 })).toEqual({ rows: [{ a: { b: 1 } }], rowCount: 1, columns, meta: {} });
    const nulls = { ...legacy, routeVariants: null, bodyMap: null, result: { ...legacy.result, flatten: null, metaPaths: null } } as unknown as ErpOperation;
    expect(mapOperationResult(nulls, { items: [] }).meta).toEqual({});
    expect(buildOperationRequest(nulls, { q: 'a', extra: 'x' }, null)).toEqual({ url: '/api/stock/items?q=a', method: 'GET' });
  });
});

describe('body map', () => {
  it('bodyMap merges source rows and bound values', () => {
    const source = [{ code: 'RENK', value: 'Mavi' }, { code: 'BOY', value: '10' }];
    const request = buildOperationRequest(saveFields, { id: guid, RENK: 'Kırmızı', BOY: null }, null, source);
    expect(request.url).toBe(`/api/stock/items/${guid}/custom-fields`);
    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body!)).toEqual({ values: { RENK: 'Kırmızı', BOY: '10' } });
  });

  it('empty string clears a mapped value and unknown codes are added', () => {
    const request = buildOperationRequest(saveFields, { id: guid, BOY: '', YENI: 'v' }, null, [{ code: 'BOY', value: '10' }]);
    expect(JSON.parse(request.body!)).toEqual({ values: { BOY: '', YENI: 'v' } });
  });

  it('bodyMap without loaded source throws', () => {
    expect(() => buildOperationRequest(saveFields, { id: guid, RENK: 'x' }, null, null)).toThrow('Kaynak kayıt yüklenmedi; önce bir kayıt seçin.');
    expect(() => buildOperationRequest(saveFields, { id: guid, RENK: 'x' }, null)).toThrow('Kaynak kayıt yüklenmedi; önce bir kayıt seçin.');
  });

  it('undeclared values are ignored without a bodyMap', () => {
    const request = buildOperationRequest(update, { name: 'B', RENK: 'x' }, { Id: guid });
    expect(JSON.parse(request.body!)).toEqual({ Id: guid, name: 'B' });
  });
});

describe('Faz A inceleme düzeltmeleri', () => {
  it('staleSourceError compares bound route values with the source run values', () => {
    const other = '3f2504e0-4f89-11d3-9a0c-0305e82c3302';
    expect(staleSourceError(saveFields, { id: other }, { id: guid })).toBe('Kaynak kayıt seçili kayıtla eşleşmiyor.');
    expect(staleSourceError(saveFields, { id: guid.toUpperCase() }, { ID: guid })).toBeNull();
    expect(staleSourceError(saveFields, { id: other }, undefined)).toBeNull();
    expect(staleSourceError(saveFields, { id: other }, { q: 'x' })).toBeNull();
  });

  it('never writes prototype keys into the body', () => {
    const source = JSON.parse('{"__proto__":{"polluted":true},"constructor":"x","Id":"' + guid + '","name":"A"}');
    const request = buildOperationRequest(update, { name: 'B' }, source);
    const body = JSON.parse(request.body!);
    expect(Object.keys(body).sort()).toEqual(['Id', 'name']);
    const rows = JSON.parse('[{"code":"__proto__","value":"x"},{"code":"prototype","value":"y"},{"code":"RENK","value":"Mavi"}]');
    const mapped = JSON.parse(buildOperationRequest(saveFields, { id: guid }, null, rows).body!);
    expect(mapped).toEqual({ values: { RENK: 'Mavi' } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('collection parameters', () => {
  const createCard = op({
    name: 'stok.kart.olustur', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/stock/items',
    parameters: [
      { name: 'code', in: 'body', type: 'text', required: true, items: null },
      { name: 'customFields', in: 'body', type: 'map', required: false, items: null },
      { name: 'variants', in: 'body', type: 'list', required: false, items: [
        { code: 'code', label: 'Kod', dataType: 'text', required: true }, { code: 'attributes', label: 'Özellikler', dataType: 'map', required: true }] },
    ],
    result: { shape: 'record', rowsPath: null, columns },
  });
  const saveFieldsMap = op({ ...saveFields, parameters: [...saveFields.parameters, { name: 'values', in: 'body', type: 'map', required: false, items: null }] });
  const movement = op({
    name: 'stok.hareket.ekle', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/stock/movements',
    parameters: [{ name: 'tracking', in: 'body', type: 'list', required: false, items: [{ code: 'trackingCode', label: 'Kod', dataType: 'text', required: true }] }],
    result: { shape: 'record', rowsPath: null, columns },
  });

  it('list parameter is written to body as array', () => {
    const variants = [{ code: 'TS-KIRMIZI', attributes: { Renk: 'Kırmızı' } }];
    const request = buildOperationRequest(createCard, { code: 'TS', variants }, null);
    expect(JSON.parse(request.body!)).toEqual({ code: 'TS', variants });
  });

  it('null map parameter is omitted', () => {
    const request = buildOperationRequest(createCard, { code: 'TS', customFields: null, variants: null }, null);
    expect(request.body).toBe('{"code":"TS"}');
    expect(buildOperationRequest(createCard, { code: 'TS', customFields: { RENK: 'Mavi' } }, null).body).toBe('{"code":"TS","customFields":{"RENK":"Mavi"}}');
  });

  it('map parameter merges over body map source', () => {
    const source = [{ code: 'RENK', value: 'Mavi' }, { code: 'BOY', value: '10' }];
    const request = buildOperationRequest(saveFieldsMap, { id: guid, values: { RENK: 'Kırmızı', BOY: null }, EN: '5' }, null, source);
    expect(request.body).toBe('{"values":{"RENK":"Kırmızı","BOY":"10","EN":"5"}}');
    // Tek tek bağlı büyük harfli parametre eşlem değerini ezer; bağlanmamış eşlem kaynağı korur.
    expect(JSON.parse(buildOperationRequest(saveFieldsMap, { id: guid, values: { RENK: 'Kırmızı' }, RENK: 'Sarı' }, null, source).body!))
      .toEqual({ values: { RENK: 'Sarı', BOY: '10' } });
    expect(JSON.parse(buildOperationRequest(saveFieldsMap, { id: guid, values: null }, null, source).body!)).toEqual({ values: { RENK: 'Mavi', BOY: '10' } });
  });

  it('field errors keep map and list keys', () => {
    expect(fieldErrorsByParameter(saveFieldsMap, { 'values.RENK': ['x'] })).toEqual({ 'values.RENK': 'x' });
    expect(fieldErrorsByParameter(movement, { 'tracking[1].trackingCode': ['y'] })).toEqual({ 'tracking[1].trackingCode': 'y' });
    expect(fieldErrorsByParameter(createCard, { 'CustomFields.RENK': ['z'], 'code.x': ['w'], Code: ['v'] })).toEqual({ 'customFields.RENK': 'z', code: 'v' });
  });
});
