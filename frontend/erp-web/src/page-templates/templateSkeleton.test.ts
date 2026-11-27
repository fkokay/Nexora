import { describe, expect, it } from 'vitest';
import { orderDialogParts, orderGroupChildren } from './templateSkeleton';

describe('templateSkeleton', () => {
  it('orderDialogParts puts the summary first, tabs last and top-level buttons in the footer', () => {
    const types: Record<string, string> = { a: 'text', ozet: 'recordHeader', b: 'section', tabs1: 'tabs', btn: 'button' };
    expect(orderDialogParts(['a', 'ozet', 'b', 'tabs1', 'btn'], (id) => types[id])).toEqual({ body: ['ozet', 'a', 'b', 'tabs1'], footer: ['btn'] });
  });

  it('orderDialogParts keeps contains order otherwise and keeps unknown ids in the body', () => {
    const types: Record<string, string> = { t: 'tabs', b1: 'button', m: 'metric', b2: 'button', f: 'formCard' };
    expect(orderDialogParts(['t', 'b1', 'm', 'yok', 'b2', 'f'], (id) => types[id])).toEqual({ body: ['m', 'yok', 'f', 't'], footer: ['b1', 'b2'] });
  });

  it('orderGroupChildren splits badges, body and buttons keeping order', () => {
    const text = { id: 'x', type: 'text' };
    const badge1 = { id: 'r1', type: 'badge' };
    const button = { id: 'd', type: 'button' };
    const badge2 = { id: 'r2', type: 'badge' };
    expect(orderGroupChildren([text, badge1, button, badge2])).toEqual({ badges: [badge1, badge2], body: [text], buttons: [button] });
  });
});
