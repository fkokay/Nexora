import { describe, expect, it } from 'vitest';
import { buildOperationRequest, dottedBodyName, fieldErrorsByParameter, type ErpOperation } from './erpOperations';

const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const body = (name: string, type = 'text') => ({ name, in: 'body' as const, type, required: false });

function op(extra: Partial<ErpOperation>): ErpOperation {
  return {
    name: 'cari.olustur', label: 'Cari oluştur', module: 'Cari', kind: 'write', pageKind: 'insert', method: 'POST', route: '/api/customers',
    parameters: [body('code'), body('name'), body('address.city'), body('address.addressLine'), body('address.latitude', 'decimal')],
    result: { shape: 'record', rowsPath: null, columns: [] }, sourceOperation: null, fixedBody: null,
    since: '2026-11-21', deprecated: false, allowed: true, ...extra,
  };
}
const create = op({});
const update = op({
  name: 'cari.guncelle', pageKind: 'update', method: 'PUT', route: '/api/customers/{id}', sourceOperation: 'cari.getir',
  parameters: [{ name: 'id', in: 'route', type: 'guid', required: true }, ...create.parameters],
});
const sent = (request: { body?: string }) => JSON.parse(request.body ?? 'null');

describe('dotted body parameters', () => {
  it('parses one-level names only', () => {
    expect(dottedBodyName('address.city')).toEqual(['address', 'city']);
    expect(dottedBodyName('city')).toBeNull();
    expect(dottedBodyName('a.b.c')).toBeNull();
    expect(dottedBodyName('a.1b')).toBeNull();
    expect(dottedBodyName('__proto__.x')).toBeNull();
    expect(dottedBodyName('a.constructor')).toBeNull();
  });

  it('nests dotted names on the wire', () => {
    const request = buildOperationRequest(create, { code: 'C1', name: 'Ad', 'address.city': 'Konya', 'address.addressLine': 'Mah.', 'address.latitude': 37.87 }, null);
    expect(sent(request)).toEqual({ code: 'C1', name: 'Ad', address: { city: 'Konya', addressLine: 'Mah.', latitude: 37.87 } });
  });

  it('omits the nested object when all its fields are empty', () => {
    const request = buildOperationRequest(create, { code: 'C1', name: 'Ad', 'address.city': '', 'address.addressLine': null, 'address.latitude': null }, null);
    expect(sent(request)).toEqual({ code: 'C1', name: 'Ad' });
  });

  it('merges the nested source object on a source-backed update', () => {
    const source = { id: guid, code: 'C1', name: 'Ad', rowVersion: 'AAA=', Address: { city: 'Ankara', addressLine: 'Eski', postalCode: '06000' } };
    const request = buildOperationRequest(update, { 'address.city': 'Konya', 'address.addressLine': null, 'address.latitude': null }, source);
    // Çözülemeyen alt değer kaynağı korur; boş alt alan yazılmaz; büyük/küçük harf farklı üst ad tek nesnede birleşir.
    expect(sent(request)).toEqual({ id: guid, code: 'C1', name: 'Ad', rowVersion: 'AAA=', address: { city: 'Konya', addressLine: 'Eski', postalCode: '06000' } });
    expect(source.Address.city).toBe('Ankara');
  });

  it('writes null over the source value when the user cleared the field', () => {
    const source = { id: guid, address: { city: 'Ankara', addressLine: 'Eski' } };
    const request = buildOperationRequest(update, { 'address.city': 'Konya', 'address.addressLine': null }, source, null, new Set(['address.addressLine']));
    expect(sent(request).address).toEqual({ city: 'Konya', addressLine: null });
  });

  it('does not write empty bound fields inside the nested object', () => {
    const request = buildOperationRequest(create, { code: 'C1', 'address.city': 'Konya', 'address.addressLine': '', 'address.latitude': null }, null);
    expect(sent(request)).toEqual({ code: 'C1', address: { city: 'Konya' } });
  });

  it('adds dotted fixedBody keys only to a nested object that is sent', () => {
    const fixed = op({ fixedBody: { isActive: true, 'address.kind': 'General', 'address.isDefault': true, 'other.flag': 1 } });
    expect(sent(buildOperationRequest(fixed, { code: 'C1', 'address.city': 'Konya' }, null)))
      .toEqual({ code: 'C1', isActive: true, address: { city: 'Konya', kind: 'General', isDefault: true } });
    // Bağlı alanların hepsi boş: sabit alanlar nesneyi göndermez; noktalı sabit anahtar düz anahtar olarak da gitmez.
    expect(sent(buildOperationRequest(fixed, { code: 'C1', 'address.city': '', 'address.addressLine': null }, null))).toEqual({ code: 'C1', isActive: true });
    // Bağlı parametre aynı alanı yazdıysa sabit değer onu ezmez.
    const both = op({ fixedBody: { 'address.city': 'Sabit' } });
    expect(sent(buildOperationRequest(both, { 'address.city': 'Konya' }, null))).toEqual({ address: { city: 'Konya' } });
  });

  it('does not copy flattened source keys as literal dotted keys', () => {
    const source = { id: guid, code: 'C1', address: { city: 'Ankara' }, 'address.city': 'Ankara', 'defaultAddress.label': 'Merkez' };
    const request = buildOperationRequest(update, { 'address.city': 'Konya' }, source);
    expect(Object.keys(sent(request)).filter((key) => key.includes('.'))).toEqual([]);
    expect(sent(request).address).toEqual({ city: 'Konya' });
  });

  it('replaces a scalar source value under the parent name with a nested object', () => {
    const request = buildOperationRequest(update, { 'address.city': 'Konya' }, { id: guid, address: 'metin' });
    expect(sent(request).address).toEqual({ city: 'Konya' });
  });

  it('maps server errors keyed by dotted names to the dotted parameter', () => {
    expect(fieldErrorsByParameter(create, { 'address.addressLine': ['Adres satırı zorunludur.'], 'Address.City': ['İl zorunludur.'], bank: ['Banka'] }))
      .toEqual({ 'address.addressLine': 'Adres satırı zorunludur.', 'address.city': 'İl zorunludur.' });
  });
});
