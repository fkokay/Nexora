import { describe, expect, it } from 'vitest';
import { customFieldSpecs, customFieldValues, validateCustomFields } from './customFields';

const definitions = [
  { code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: true, maxLength: 20 },
  { code: 'AGIRLIK', label: 'Ağırlık', dataType: 'Decimal', isRequired: false, maxLength: null },
  { code: 'URETIM', label: 'Üretim tarihi', dataType: 'Date', isRequired: false },
  { code: 'IHRAC', label: 'İhraç', dataType: 'Boolean', isRequired: true },
  { code: 'ESKI', label: 'Eski', dataType: 'Text', isRequired: true, isActive: false },
  { code: 'DIGER', label: 'Diğer', dataType: 'Gizemli', isRequired: false, maxLength: 900 },
];

describe('customFields', () => {
  it('specs map dataType and skip inactive', () => {
    expect(customFieldSpecs(definitions)).toEqual([
      { code: 'RENK', label: 'Renk', inputType: 'text', required: true, maxLength: 20 },
      { code: 'AGIRLIK', label: 'Ağırlık', inputType: 'number', required: false },
      { code: 'URETIM', label: 'Üretim tarihi', inputType: 'date', required: false },
      { code: 'IHRAC', label: 'İhraç', inputType: 'checkbox', required: true },
      { code: 'DIGER', label: 'Diğer', inputType: 'text', required: false, maxLength: 500 },
    ]);
    expect(customFieldSpecs([{ label: 'Kodsuz', dataType: 'Text' }, { code: '__proto__', label: 'x', dataType: 'Text' }, { code: 'RENK', dataType: 'Text' }, { code: 'RENK', label: 'İkinci', dataType: 'Text' }]))
      .toEqual([{ code: 'RENK', label: 'RENK', inputType: 'text', required: false }]);
  });

  it('values prefer typed then source then empty', () => {
    const specs = customFieldSpecs(definitions);
    const values = customFieldValues(specs, [{ code: 'RENK', value: 'Mavi' }, { code: 'AGIRLIK', value: '1.5' }, { code: 'IHRAC', value: null }, { code: 'YOK', value: 'x' }], { AGIRLIK: '2' });
    expect(values).toEqual({ RENK: 'Mavi', AGIRLIK: '2', URETIM: '', IHRAC: 'false', DIGER: '' });
    expect(customFieldValues(specs, [], { RENK: '' }).RENK).toBe('');
    // Boolean: no typed/source value defaults to "false"; typed and stored values win.
    expect(customFieldValues(specs, [], {}).IHRAC).toBe('false');
    expect(customFieldValues(specs, [{ code: 'IHRAC', value: 'true' }], {}).IHRAC).toBe('true');
    expect(customFieldValues(specs, [], { IHRAC: 'true' }).IHRAC).toBe('true');
  });

  it('required text empty fails, boolean never fails', () => {
    const specs = customFieldSpecs(definitions);
    expect(validateCustomFields(specs, { RENK: '  ', AGIRLIK: '', URETIM: '', IHRAC: '', DIGER: '' })).toEqual({ RENK: 'Bu alan zorunludur.' });
    expect(validateCustomFields(specs, { RENK: 'Mavi', IHRAC: 'false' })).toEqual({});
    expect(validateCustomFields(specs, { RENK: 'x'.repeat(21) })).toEqual({ RENK: 'En fazla 20 karakter girilebilir.' });
  });

  it('decimal invalid fails with Geçerli bir sayı girin.', () => {
    const specs = customFieldSpecs(definitions);
    for (const value of ['1,5', 'abc', '1e3', '.5']) {
      expect(validateCustomFields(specs, { RENK: 'Mavi', AGIRLIK: value }), value).toEqual({ AGIRLIK: 'Geçerli bir sayı girin.' });
    }
    expect(validateCustomFields(specs, { RENK: 'Mavi', AGIRLIK: '-12.25' })).toEqual({});
  });

  it('max 40 fields', () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ code: `ALAN${index}`, label: `Alan ${index}`, dataType: 'Text' }));
    const specs = customFieldSpecs(many);
    expect(specs).toHaveLength(40);
    expect(specs[39].code).toBe('ALAN39');
  });
});
