import { describe, expect, it } from 'vitest';
import { buildOperationRequest, type ErpOperation } from './erpOperations';
import { appendFixedQuery } from './fixedQuery';

const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const setActive = (fixedQuery: Record<string, unknown> | null | undefined, method = 'PATCH'): ErpOperation => ({
  name: 'finans.hesap.pasifeAl', label: 'Pasife al', module: 'Finans', kind: 'write', pageKind: 'update', method,
  route: '/api/finance/accounts/{id}/active', parameters: [{ name: 'id', in: 'route', type: 'guid', required: true },
    { name: 'note', in: 'query', type: 'text', required: false }],
  result: { shape: 'none', rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null,
  since: '2026-11-21', deprecated: false, allowed: true, fixedQuery,
});

describe('fixedQuery', () => {
  it('appends a false boolean as "false" (never dropped as empty)', () => {
    const request = buildOperationRequest(setActive({ isActive: false }), { id: guid }, null);
    expect(request.url).toBe(`/api/finance/accounts/${guid}/active?isActive=false`);
  });

  it('appends true, numbers and text after bound query parameters', () => {
    const request = buildOperationRequest(setActive({ isActive: true, level: 0, kind: 'Cash' }), { id: guid, note: 'x' }, null);
    expect(request.url).toBe(`/api/finance/accounts/${guid}/active?note=x&isActive=true&level=0&kind=Cash`);
  });

  it('works for GET requests too and is a no-op when absent (older server)', () => {
    expect(buildOperationRequest(setActive({ isActive: true }, 'GET'), { id: guid }, null).url).toBe(`/api/finance/accounts/${guid}/active?isActive=true`);
    expect(buildOperationRequest(setActive(undefined), { id: guid }, null).url).toBe(`/api/finance/accounts/${guid}/active`);
    expect(buildOperationRequest(setActive(null), { id: guid }, null).url).toBe(`/api/finance/accounts/${guid}/active`);
  });

  it('does not put fixed query values into the body', () => {
    const request = buildOperationRequest(setActive({ isActive: false }, 'POST'), { id: guid }, { id: guid, rowVersion: 'AAA=' });
    expect(JSON.parse(request.body!)).toEqual({ id: guid, rowVersion: 'AAA=' });
  });

  it('skips null, object and unsafe values; a fixed value wins over a bound one', () => {
    const query = new URLSearchParams('isActive=true');
    appendFixedQuery(query, { isActive: false, empty: null, nested: { a: 1 }, list: [1], __proto__x: 'ok', constructor: 'no', nan: Number.NaN });
    expect(query.toString()).toBe('isActive=false&__proto__x=ok');
  });
});
