import { describe, expect, it } from 'vitest';
import { openParamRow, openParamTargets, sameOpenRequest } from './openParam';

const table = (props: Record<string, unknown>, name: string | undefined = 'liste') => ({ id: `t-${name}`, type: 'dataTable', name, props });

describe('dataTable openParam', () => {
  it('targets only named tables with a row open button and a filled, valid param', () => {
    const components = [
      table({ openParam: 'orderId', rowOpenAction: 'ac' }),
      table({ openParam: 'orderId' }, 'butonsuz'),
      table({ openParam: 'orderId', rowOpenAction: 'ac' }, ''),
      table({ openParam: 'Bad-Name', rowOpenAction: 'ac' }, 'gecersiz'),
      table({ openParam: 'quoteId', rowOpenAction: 'ac' }, 'bos'),
      { id: 'x', type: 'metric', name: 'm', props: { openParam: 'orderId', rowOpenAction: 'ac' } },
    ];
    expect(openParamTargets(components, { orderId: ' o1 ', quoteId: '' }).map((target) => [target.table.name, target.button, target.param, target.value]))
      .toEqual([['liste', 'ac', 'orderId', 'o1']]);
    expect(openParamTargets(components, {})).toEqual([]);
  });

  it('opens the loaded row when its id matches, otherwise a root selection with only the id', () => {
    const rows = [{ id: 'A1', code: 'S-1' }, { id: 'b2', code: 'S-2' }];
    expect(openParamRow(rows, 'a1')).toBe(rows[0]);
    expect(openParamRow(rows, 'c3')).toEqual({ id: 'c3' });
    expect(openParamRow(undefined, 'c3')).toEqual({ id: 'c3' });
  });

  it('a request with the same params reopens; different params rebuild the page instead', () => {
    expect(sameOpenRequest({ orderId: 'o1' }, { orderId: 'o1' })).toBe(true);
    expect(sameOpenRequest({ orderId: 'o2' }, { orderId: 'o1' })).toBe(false);
    expect(sameOpenRequest({ orderId: 'o1', q: 'x' }, { orderId: 'o1' })).toBe(false);
  });
});
