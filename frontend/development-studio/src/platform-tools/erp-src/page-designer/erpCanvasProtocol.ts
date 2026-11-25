// erp-web/src/designer-canvas/canvasProtocol.ts ile aynı tutulmalı.
export const CANVAS_PROTOCOL = 'nexora-canvas';
export const CANVAS_VERSION = 1;

export type CanvasBlock = { id: string; x: number; y: number; width: number; height: number };
export type StudioToCanvas = { nx: 'nexora-canvas'; v: 1; type: 'reload'; revision: number };
export type CanvasToStudio =
  | { nx: 'nexora-canvas'; v: 1; type: 'ready'; revision: number }
  | { nx: 'nexora-canvas'; v: 1; type: 'layout'; revision: number; height: number; blocks: CanvasBlock[] }
  | { nx: 'nexora-canvas'; v: 1; type: 'error'; revision: number; message: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const isRevision = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isSize = (v: unknown): v is number => isCoord(v) && v >= 0;

function parseBlock(raw: unknown): CanvasBlock | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || !ID_PATTERN.test(b.id)) return null;
  if (!isCoord(b.x) || !isCoord(b.y) || !isSize(b.width) || !isSize(b.height)) return null;
  return { id: b.id, x: b.x, y: b.y, width: b.width, height: b.height };
}

export function parseCanvasMessage(data: unknown): CanvasToStudio | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.nx !== CANVAS_PROTOCOL || m.v !== CANVAS_VERSION || !isRevision(m.revision)) return null;
  const head = { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, revision: m.revision } as const;
  if (m.type === 'ready') return { ...head, type: 'ready' };
  if (m.type === 'error') return typeof m.message === 'string' ? { ...head, type: 'error', message: m.message } : null;
  if (m.type === 'layout') {
    if (!isSize(m.height) || !Array.isArray(m.blocks)) return null;
    const blocks: CanvasBlock[] = [];
    for (const raw of m.blocks) {
      const block = parseBlock(raw);
      if (!block) return null;
      blocks.push(block);
    }
    return { ...head, type: 'layout', height: m.height, blocks };
  }
  return null;
}

export function canvasFrameUrl(platformOrigin: string, target: { previewId: string; systemScreenKey?: string }): string {
  const origin = platformOrigin.replace(/\/+$/, '');
  const page = target.systemScreenKey ? `&page=${encodeURIComponent(target.systemScreenKey)}` : '';
  return `${origin}/?designerCanvas=1&embeddedStudio=1&preview=${encodeURIComponent(target.previewId)}${page}`;
}

export function reloadMessage(revision: number): StudioToCanvas {
  return { nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'reload', revision };
}
