import { describe, expect, it, vi } from 'vitest';
import { applyTyping, boundInputNames, inputRules, validateInputValue, VALIDATION_BLOCKED, type InputRules } from './inputValidation';

const rules = (extra: Partial<InputRules> = {}): InputRules => ({ required: false, upperCase: false, ...extra });

describe('inputValidation', () => {
  it('required and empty', () => {
    expect(validateInputValue('text', rules({ required: true }), '')).toBe('Bu alan zorunludur.');
    expect(validateInputValue('text', rules({ required: true }), '  ')).toBe('Bu alan zorunludur.');
    expect(validateInputValue('checkbox', rules({ required: true }), false)).toBe('Bu alan zorunludur.');
    expect(validateInputValue('checkbox', rules({ required: true }), true)).toBeNull();
    expect(validateInputValue('text', rules({ required: true }), 'a')).toBeNull();
  });

  it('number not parsable', () => {
    expect(validateInputValue('number', rules(), 'abc')).toBe('Geçerli bir sayı girin.');
  });

  it('number below min', () => {
    expect(validateInputValue('number', rules({ min: 2 }), '1')).toBe('En az 2 olmalıdır.');
    expect(validateInputValue('number', rules({ min: 2 }), '2')).toBeNull();
  });

  it('number above max', () => {
    expect(validateInputValue('number', rules({ max: 10 }), '11')).toBe('En fazla 10 olmalıdır.');
  });

  it('date before min', () => {
    expect(validateInputValue('date', rules({ min: '2026-01-01' }), '2025-12-31')).toBe('En erken 2026-01-01 olabilir.');
    expect(validateInputValue('date', rules({ min: '2026-01-01' }), '2026-01-01')).toBeNull();
  });

  it('date after max', () => {
    expect(validateInputValue('date', rules({ max: '2026-12-31' }), '2027-01-01')).toBe('En geç 2026-12-31 olabilir.');
  });

  it('step', () => {
    expect(validateInputValue('number', rules({ step: 0.5 }), '1.25')).toBe('Değer 0.5 adımlarına uymalıdır.');
    expect(validateInputValue('number', rules({ step: 0.1 }), '0.3')).toBeNull();
  });

  it('length above maxLength', () => {
    expect(validateInputValue('text', rules({ maxLength: 3 }), 'abcd')).toBe('En fazla 3 karakter girilebilir.');
    expect(validateInputValue('text', rules({ maxLength: 3 }), 'abc')).toBeNull();
  });

  it('pattern fails', () => {
    expect(validateInputValue('text', rules({ pattern: '[A-Z]{3}' }), 'AB')).toBe('Değer beklenen biçimde değil.');
    expect(validateInputValue('text', rules({ pattern: '[A-Z]{3}', patternMessage: 'Üç büyük harf.' }), 'ABCD')).toBe('Üç büyük harf.');
    expect(validateInputValue('text', rules({ pattern: 'a|b' }), 'a')).toBeNull();
  });

  it('checks run in table order', () => {
    expect(validateInputValue('number', rules({ min: 5, step: 2 }), '3')).toBe('En az 5 olmalıdır.');
    expect(validateInputValue('text', rules({ maxLength: 2, pattern: '\\d+' }), 'abc')).toBe('En fazla 2 karakter girilebilir.');
  });

  it('empty optional value passes', () => {
    const all = rules({ min: 1, max: 2, step: 1, maxLength: 1, pattern: 'x' });
    expect(validateInputValue('number', all, '')).toBeNull();
    expect(validateInputValue('text', all, '')).toBeNull();
    expect(validateInputValue('date', rules({ min: '2026-01-01' }), '')).toBeNull();
    expect(validateInputValue('checkbox', rules(), false)).toBeNull();
  });

  it('applyTyping upper-cases with invariant rules', () => {
    expect(applyTyping(rules({ upperCase: true }), 'istif')).toBe('ISTIF');
    expect(applyTyping(rules({ upperCase: true, maxLength: 2 }), 'istif')).toBe('ISTIF');
    expect(applyTyping(rules(), 'istif')).toBe('istif');
  });

  it('invalid pattern is skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateInputValue('text', rules({ pattern: '(' }), 'abc')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pattern longer than 200 characters is ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(inputRules({ pattern: 'a'.repeat(201) }).pattern).toBeUndefined();
    expect(inputRules({ pattern: 'a'.repeat(200) }).pattern).toBe('a'.repeat(200));
    expect(validateInputValue('text', rules({ pattern: 'a'.repeat(201) }), 'b')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('number parsing is strict when min, max or step is set', () => {
    for (const ruled of [rules({ min: 0 }), rules({ max: 1000 }), rules({ step: 0.5 })]) {
      expect(validateInputValue('number', ruled, ' 12 ')).toBeNull();
      for (const bad of ['1e3', '0x10', '1,5', '.5', '1.', 'Infinity', '+1']) {
        expect(validateInputValue('number', ruled, bad), bad).toBe('Geçerli bir sayı girin.');
      }
    }
    expect(validateInputValue('number', rules({ min: -5 }), '-1.5')).toBeNull();
  });

  it('unruled number input accepts whatever the browser number input accepts', () => {
    for (const ok of ['1e3', '.5', '-1.5', ' 12 ']) expect(validateInputValue('number', rules(), ok), ok).toBeNull();
    expect(validateInputValue('number', rules({ required: true }), '1e3')).toBeNull();
  });

  it('date limits accept only YYYY-MM-DD', () => {
    expect(inputRules({ min: '2026-1-1', max: 'yarın' })).toEqual({ required: false, upperCase: false });
    expect(validateInputValue('date', rules({ min: 5 }), '2026-01-01')).toBeNull();
    expect(validateInputValue('number', rules({ min: '2026-01-01' }), '1')).toBeNull();
  });

  it('boundInputNames ignores non-value bindings', () => {
    expect(boundInputNames({ parameters: [{ binding: '{{ad.value}}' }, { binding: '{{liste.seciliSatir.id}}' }] })).toEqual(['ad']);
    expect(boundInputNames({ parameters: [{ binding: '{{b.value}}' }, { binding: '{{a.value}}' }, { binding: '{{b.value}}' }] })).toEqual(['b', 'a']);
  });

  it('reads rules from props', () => {
    expect(inputRules({ required: true, min: 1, max: '2026-01-01', step: 0.5, maxLength: 10, pattern: 'x', patternMessage: 'm', upperCase: true }))
      .toEqual({ required: true, min: 1, max: '2026-01-01', step: 0.5, maxLength: 10, pattern: 'x', patternMessage: 'm', upperCase: true });
    expect(inputRules({ required: 'yes', step: -1, maxLength: 'x', min: {} })).toEqual({ required: false, upperCase: false });
    expect(VALIDATION_BLOCKED).toBe('Formda düzeltilmesi gereken alanlar var.');
  });
});
