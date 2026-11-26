import { describe, expect, it } from 'vitest';
import { metricCompare } from './metricCompare';

describe('metricCompare', () => {
  it('returns up 12 for 112 vs 100', () => {
    expect(metricCompare(112, 100)).toEqual({ direction: 'up', percent: 12 });
    expect(metricCompare('112', '100')).toEqual({ direction: 'up', percent: 12 });
  });
  it('returns down with absolute percent and flat for equal values', () => {
    expect(metricCompare(88, 100)).toEqual({ direction: 'down', percent: 12 });
    expect(metricCompare(100, 100)).toEqual({ direction: 'flat', percent: 0 });
  });
  it('returns null for text or zero compare', () => {
    expect(metricCompare('abc', 100)).toBeNull();
    expect(metricCompare(100, 'abc')).toBeNull();
    expect(metricCompare(100, 0)).toBeNull();
    expect(metricCompare(100, '')).toBeNull();
    expect(metricCompare(null, 100)).toBeNull();
    expect(metricCompare(undefined, undefined)).toBeNull();
  });
});
