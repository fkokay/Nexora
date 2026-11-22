import { describe, expect, it } from 'vitest';
import { linkUrl, navigationTarget, pageParamValues } from './navigationActions';

const scope = { liste: { seciliSatir: { takipNo: 'A 1/2?x=#', host: 'evil.example.com', url: 'javascript:alert(1)' } } };

describe('linkUrl', () => {
  it('encodes every bound value and keeps the literal host', () => {
    expect(linkUrl('https://kargo.example.com/takip?no={{liste.seciliSatir.takipNo}}', scope))
      .toBe('https://kargo.example.com/takip?no=A%201%2F2%3Fx%3D%23');
  });

  it.each([
    'javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example.com/x', 'ftp://a.example.com/',
    '{{liste.seciliSatir.url}}', 'https://{{liste.seciliSatir.host}}/x', 'https://kargo.example.com{{liste.seciliSatir.host}}',
    'https://user@evil.example.com/', 'https://a.example.com\\@evil.example.com/', 'https://a.example.com/a b',
  ])('rejects %s', (template) => expect(linkUrl(template, scope)).toBeNull());
});

describe('pageParamValues', () => {
  it('interpolates up to six unique named parameters', () => {
    expect(pageParamValues(['no={{liste.seciliSatir.takipNo}}', 'kaynak=liste', 'no=tekrar', 'Bad=1', 'x'], scope))
      .toEqual({ no: 'A 1/2?x=#', kaynak: 'liste' });
  });
});

describe('navigationTarget', () => {
  it('opens links in a new tab by default and workspace pages in the same tab', () => {
    expect(navigationTarget({ actionType: 'link', href: 'https://a.example.com/' }, scope)).toEqual({ kind: 'link', url: 'https://a.example.com/', newTab: true });
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'customers', queryText: '{{liste.seciliSatir.takipNo}}' }, scope))
      .toEqual({ kind: 'workspace', page: 'customers', params: { q: 'A 1/2?x=#' }, replace: true });
    expect(navigationTarget({ actionType: 'page', pageCode: 'kargo-detay', params: ['no=1'], target: 'newTab' }, scope))
      .toEqual({ kind: 'workspace', page: 'custom-page:kargo-detay', params: { no: '1' }, replace: false });
    expect(navigationTarget({ actionType: 'page', pageCode: '@inventory-stock' }, scope))
      .toEqual({ kind: 'workspace', page: 'inventory-stock', params: {}, replace: true });
  });

  it('erpPage legacyScreen asks for the built-in screen; other values and actions do not', () => {
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'sales-orders', params: ['orderId=o1'], legacyScreen: true }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-orders', params: { orderId: 'o1' }, replace: true, legacy: true });
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'sales-orders', legacyScreen: 'true' }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-orders', params: {}, replace: true });
    expect(navigationTarget({ actionType: 'page', pageCode: '@sales-orders', legacyScreen: true }, scope))
      .toEqual({ kind: 'workspace', page: 'sales-orders', params: {}, replace: true });
  });

  it('returns null for invalid targets', () => {
    expect(navigationTarget({ actionType: 'link', href: 'javascript:alert(1)' }, scope)).toBeNull();
    expect(navigationTarget({ actionType: 'erpPage', pageKey: 'Bad Key' }, scope)).toBeNull();
    expect(navigationTarget({ actionType: 'page', pageCode: 'kötü kod' }, scope)).toBeNull();
    expect(navigationTarget({ actionType: 'query' }, scope)).toBeNull();
  });
});
