import { describe, expect, it } from 'vitest';
import { collectBlocks, parseStudioCanvasMessage, readCanvasParams } from './canvasProtocol';

describe('readCanvasParams', () => {
  it('reads the preview id', () => {
    expect(readCanvasParams('?designerCanvas=1&embeddedStudio=1&preview=abc-1')).toEqual({ previewId: 'abc-1' });
  });
  it('reads the optional system screen key', () => {
    expect(readCanvasParams('?designerCanvas=1&embeddedStudio=1&preview=abc&page=customers')).toEqual({
      previewId: 'abc',
      systemScreenKey: 'customers',
    });
  });
  it.each([
    ['embeddedStudio missing', '?designerCanvas=1&preview=abc'],
    ['designerCanvas missing', '?embeddedStudio=1&preview=abc'],
    ['empty preview', '?designerCanvas=1&embeddedStudio=1&preview='],
    ['bad preview pattern', '?designerCanvas=1&embeddedStudio=1&preview=a/b'],
    ['page too long', `?designerCanvas=1&embeddedStudio=1&preview=abc&page=${'a'.repeat(65)}`],
  ])('returns null when %s', (_name, search) => {
    expect(readCanvasParams(search)).toBeNull();
  });
});

describe('parseStudioCanvasMessage', () => {
  it('accepts a reload message', () => {
    const msg = { nx: 'nexora-canvas', v: 1, type: 'reload', revision: 3 };
    expect(parseStudioCanvasMessage(msg)).toEqual(msg);
  });
  it.each([
    ['wrong version', { nx: 'nexora-canvas', v: 2, type: 'reload', revision: 1 }],
    ['wrong type', { nx: 'nexora-canvas', v: 1, type: 'layout', revision: 1 }],
    ['negative revision', { nx: 'nexora-canvas', v: 1, type: 'reload', revision: -1 }],
    ['fractional revision', { nx: 'nexora-canvas', v: 1, type: 'reload', revision: 1.5 }],
    ['string', 'string'],
    ['null', null],
  ])('rejects %s', (_name, data) => {
    expect(parseStudioCanvasMessage(data)).toBeNull();
  });
});

function setRect(el: Element, rect: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
}

describe('collectBlocks', () => {
  it('measures the element after the anchor relative to the root', () => {
    document.body.innerHTML = '<div id="root"><template data-cp-anchor="a"></template><section></section></div>';
    const root = document.getElementById('root') as HTMLElement;
    setRect(root, { left: 0, top: 20, width: 500, height: 500 });
    setRect(root.querySelector('section') as Element, { left: 10, top: 30, width: 100, height: 40 });
    expect(collectBlocks(root)).toEqual([{ id: 'a', x: 10, y: 10, width: 100, height: 40 }]);
  });
  it('skips anchors without a following element or with an empty box', () => {
    document.body.innerHTML =
      '<div id="root"><template data-cp-anchor="a"></template><section></section><template data-cp-anchor="b"></template></div>';
    const root = document.getElementById('root') as HTMLElement;
    setRect(root, { left: 0, top: 0, width: 500, height: 500 });
    setRect(root.querySelector('section') as Element, { left: 0, top: 0, width: 0, height: 40 });
    expect(collectBlocks(root)).toEqual([]);
  });
});
