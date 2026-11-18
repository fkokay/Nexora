import { describe, expect, it } from 'vitest';
import vectors from './conditions.vectors.json';
import { conditionHolds, evaluateCondition, parseCondition } from './conditions';

describe('conditions', () => {
  it('valid syntax vectors parse with roots', () => {
    for (const vector of vectors.syntax.valid) {
      const parsed = parseCondition(vector.text);
      expect(parsed, vector.text).toMatchObject({ ok: true });
      if (parsed.ok) expect(parsed.roots, vector.text).toEqual(vector.roots);
    }
  });

  it('invalid syntax vectors fail', () => {
    for (const text of vectors.syntax.invalid) {
      const parsed = parseCondition(text);
      expect(parsed.ok, text).toBe(false);
      if ('error' in parsed) expect(parsed.error, text).not.toBe('');
    }
  });

  it('eval vectors', () => {
    for (const vector of vectors.eval) {
      const parsed = parseCondition(vector.text);
      expect(parsed.ok, vector.text).toBe(true);
      if (parsed.ok) expect(evaluateCondition(parsed.node, vector.scope), vector.text).toBe(vector.expected);
    }
  });

  it('conditionHolds falls back on unparsable text', () => {
    expect(conditionHolds('a ==', {}, true)).toBe(true);
    expect(conditionHolds('a ==', {}, false)).toBe(false);
    expect(conditionHolds(42, {}, true)).toBe(true);
    expect(conditionHolds('a.value == 1', { a: { value: 1 } }, false)).toBe(true);
  });

  it('rejects 301 characters', () => {
    const ok = 'xx' + '.a'.repeat(149);
    expect(ok).toHaveLength(300);
    expect(parseCondition(ok).ok).toBe(true);
    const tooLong = 'xxx' + '.a'.repeat(149);
    expect(tooLong).toHaveLength(301);
    expect(parseCondition(tooLong).ok).toBe(false);
  });

  it('accepts eight levels of parentheses', () => {
    expect(parseCondition('(((((((( a.value ))))))))').ok).toBe(true);
    expect(parseCondition('((((((((( a.value )))))))))').ok).toBe(false);
  });

  it('limits string literals to 100 characters', () => {
    expect(parseCondition(`a.value == '${'x'.repeat(100)}'`).ok).toBe(true);
    expect(parseCondition(`a.value == '${'x'.repeat(101)}'`).ok).toBe(false);
  });

  it('rejects keyword roots', () => {
    expect(parseCondition('true.x == 1').ok).toBe(false);
    expect(parseCondition('null').ok).toBe(true);
  });
});
