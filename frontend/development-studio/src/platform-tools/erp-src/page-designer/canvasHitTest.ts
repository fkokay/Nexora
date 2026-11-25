import type { CanvasBlock } from "./erpCanvasProtocol";

/** (x,y)'yi içeren en küçük blok; yoksa null. */
export function pickBlock(blocks: CanvasBlock[], x: number, y: number): string | null {
  let best: CanvasBlock | null = null;
  for (const b of blocks) {
    if (x < b.x || x >= b.x + b.width || y < b.y || y >= b.y + b.height) continue;
    if (!best || b.width * b.height < best.width * best.height) best = b;
  }
  return best ? best.id : null;
}

/** Üst düzey bileşenler arasında y için ekleme sırası (0..topLevelIds.length). */
export function dropIndex(blocks: CanvasBlock[], topLevelIds: string[], y: number): number {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (let i = 0; i < topLevelIds.length; i++) {
    const b = byId.get(topLevelIds[i]);
    if (!b || y > b.y + b.height) continue;
    return y >= b.y + b.height / 2 ? i + 1 : i;
  }
  return topLevelIds.length;
}
