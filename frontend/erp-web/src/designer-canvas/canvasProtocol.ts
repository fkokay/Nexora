// Message protocol between Nexora Studio (parent window) and the ERP designer canvas (iframe). Pure TypeScript.
export const CANVAS_PROTOCOL = 'nexora-canvas';
export const CANVAS_VERSION = 1;
export const ANCHOR_ATTRIBUTE = 'data-cp-anchor';

export type CanvasBlock = { id: string; x: number; y: number; width: number; height: number };
export type StudioToCanvas =
  | { nx: 'nexora-canvas'; v: 1; type: 'reload'; revision: number }
  /** Kayıt kartı: `tabsId` bileşeninin `index`. sekmesini gösterir (sekme düğmesi kutuları `"<tabsId>#tab<i>"`). */
  | { nx: 'nexora-canvas'; v: 1; type: 'showTab'; tabsId: string; index: number }
  /** Belge kalıbı: tuvalde çizilen örnek belgenin durumu (ör. Draft, Open, Fulfilled). */
  | { nx: 'nexora-canvas'; v: 1; type: 'previewState'; state: string };
export type CanvasToStudio =
  | { nx: 'nexora-canvas'; v: 1; type: 'ready'; revision: number }
  | { nx: 'nexora-canvas'; v: 1; type: 'layout'; revision: number; height: number; blocks: CanvasBlock[] }
  | { nx: 'nexora-canvas'; v: 1; type: 'error'; revision: number; message: string };
export type CanvasParams = { previewId: string; systemScreenKey?: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TAB_INDEX = 99;
const PREVIEW_STATE = /^[A-Za-z]{1,32}$/;

export function readCanvasParams(search: string): CanvasParams | null {
  const params = new URLSearchParams(search);
  if (!params.has('designerCanvas') || !params.has('embeddedStudio')) return null;
  const previewId = params.get('preview') ?? '';
  if (!ID_PATTERN.test(previewId)) return null;
  const page = params.get('page');
  if (page === null || page === '') return { previewId };
  if (!ID_PATTERN.test(page)) return null;
  return { previewId, systemScreenKey: page };
}

export function parseStudioCanvasMessage(data: unknown): StudioToCanvas | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.nx !== CANVAS_PROTOCOL || m.v !== CANVAS_VERSION) return null;
  if (m.type === 'showTab') {
    if (typeof m.tabsId !== 'string' || !ID_PATTERN.test(m.tabsId)) return null;
    if (typeof m.index !== 'number' || !Number.isInteger(m.index) || m.index < 0 || m.index > MAX_TAB_INDEX) return null;
    return { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'showTab', tabsId: m.tabsId, index: m.index };
  }
  if (m.type === 'previewState') {
    if (typeof m.state !== 'string' || !PREVIEW_STATE.test(m.state)) return null;
    return { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'previewState', state: m.state };
  }
  if (m.type !== 'reload') return null;
  if (typeof m.revision !== 'number' || !Number.isInteger(m.revision) || m.revision < 0) return null;
  return { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'reload', revision: m.revision };
}

export function collectBlocks(root: HTMLElement): CanvasBlock[] {
  const origin = root.getBoundingClientRect();
  const blocks: CanvasBlock[] = [];
  root.querySelectorAll(`template[${ANCHOR_ATTRIBUTE}]`).forEach((anchor) => {
    const id = anchor.getAttribute(ANCHOR_ATTRIBUTE);
    const target = anchor.nextElementSibling;
    if (!id || !target) return;
    const box = target.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    blocks.push({
      id,
      x: Math.round(box.left - origin.left),
      y: Math.round(box.top - origin.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
  });
  return blocks;
}
