import { describe, expect, it } from 'vitest';
import { bindingsAllEmpty, coerceParameter, joinTextParts } from './pageBindings';

describe('coerceParameter collections', () => {
  it('coerce list drops non-objects and unsafe keys', () => {
    const value = JSON.parse('[{"code":"A","__proto__":{"x":"1"},"constructor":"c","n":2,"b":true,"z":null},"metin",3,null,[1],{"code":"B"}]');
    const coerced = coerceParameter(value, 'list') as Record<string, unknown>[];
    expect(coerced).toEqual([{ code: 'A', n: 2, b: true, z: null }, { code: 'B' }]);
    expect(Object.keys(coerced[0])).toEqual(['code', 'n', 'b', 'z']);
    expect(Object.getPrototypeOf(coerced[0])).toBe(Object.prototype);
    expect(coerceParameter({ code: 'A' }, 'list')).toBeNull();
    expect(coerceParameter('x', 'list')).toBeNull();
    expect(coerceParameter([], 'list')).toEqual([]);
    expect(coerceParameter(Array.from({ length: 250 }, () => ({ a: 1 })), 'list')).toHaveLength(200);
  });

  it('coerce map caps at 40 keys and string values', () => {
    const big = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`K${index}`, `v${index}`]));
    const coerced = coerceParameter(big, 'map') as Record<string, unknown>;
    expect(Object.keys(coerced)).toHaveLength(40);
    expect(coerced.K39).toBe('v39');
    const mixed = JSON.parse('{"A":"a","B":null,"C":5,"D":{"x":"y"},"prototype":"p","__proto__":"q"}');
    expect(coerceParameter(mixed, 'map')).toEqual({ A: 'a', B: null });
    expect(coerceParameter(['a'], 'map')).toBeNull();
    expect(coerceParameter('a', 'map')).toBeNull();
  });

  it('coerce list nested map one level only', () => {
    const value = JSON.parse('[{"code":"A","attributes":{"Renk":"Mavi","Boy":10,"Derin":{"x":"y"},"__proto__":"p","Bos":null},"liste":["a"]}]');
    expect(coerceParameter(value, 'list')).toEqual([{ code: 'A', attributes: { Renk: 'Mavi' } }]);
  });

  it('scalar coercion unchanged', () => {
    expect(coerceParameter(' 5 ', 'int')).toBe('5');
    expect(coerceParameter({ a: 1 }, 'text')).toBeNull();
    expect(coerceParameter([{ a: 1 }], 'text')).toBeNull();
  });
});

describe('parçalı metin (parts)', () => {
  const scope = { kart: { rows: [{ code: 'QA-1', groupName: null, paymentTermDays: 0, currencyCode: 'TRY', taxNumber: '  ' }] } };
  const parts = ['{{kart.rows[0].code}}', '{{kart.rows[0].groupName}}', 'Vade {{kart.rows[0].paymentTermDays}} gün', '{{kart.rows[0].currencyCode}}', 'Vergi no {{kart.rows[0].taxNumber}}'];
  it('bütün bağlamaları boş parça etiketi ve ayracıyla düşer; 0 boş değildir', () => {
    expect(joinTextParts(parts, scope)).toBe('QA-1 · Vade 0 gün · TRY');
  });
  it('bağlamasız parça hep kalır, kısmen dolu parça kalır', () => {
    expect(joinTextParts(['Sabit', '{{kart.rows[0].code}} / {{kart.rows[0].groupName}}'], scope)).toBe('Sabit · QA-1 /');
    expect(joinTextParts(['{{yok.alan}}'], scope)).toBe('');
  });
  it('dizi olmayan değer ve metin olmayan öğeler yok sayılır', () => {
    expect(joinTextParts('metin', scope)).toBe('');
    expect(joinTextParts([3, null, '{{kart.rows[0].code}}'], scope)).toBe('QA-1');
  });
  it('bindingsAllEmpty: bağlamasız şablon boş sayılmaz', () => {
    expect(bindingsAllEmpty('Sabit', scope)).toBe(false);
    expect(bindingsAllEmpty('{{kart.rows[0].groupName}} {{kart.rows[0].taxNumber}}', scope)).toBe(true);
    expect(bindingsAllEmpty('{{kart.rows[0].groupName}} {{kart.rows[0].code}}', scope)).toBe(false);
  });
});
