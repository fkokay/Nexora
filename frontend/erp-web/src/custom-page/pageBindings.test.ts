import { describe, expect, it } from 'vitest';
import { coerceParameter } from './pageBindings';

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
