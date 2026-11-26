import { describe, expect, it } from "vitest";
import type { CanvasBlock } from "./erpCanvasProtocol";
import { freeDropAt, freeDropMarker, freeDropRefusal, freePaletteDrop } from "./freeCanvasHit";
import { newFreeTemplateDefinition } from "./pageTemplates";
import { consultantPaletteKey } from "./panel/consultantPalette";
import {
  addBlock, addItem, addTab, FREE_BLOCK_FULL, FREE_BLOCKS_FULL, freeBlocks, freeTabs, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS,
} from "./panel/freeModel";
import type { ModelDefinition } from "./panel/listPanelModel";

const ok = <T extends object>(result: T | { reason: string }): T => {
  if ("reason" in result) throw new Error(`beklenmeyen neden: ${result.reason}`);
  return result;
};
const box = (id: string, x: number, y: number, width: number, height: number): CanvasBlock => ({ id, x, y, width, height });
const members = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!.props.members as string[];

/** Bölüm 1: [metin, gösterge, görsel(tam satır), bilgi]; Bölüm 2 boş. 2 kolon. */
function untabbed() {
  let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
  const first = freeBlocks(def)[0].id;
  const ids: string[] = [];
  for (const kind of ["text", "indicator", "image", "infoBox"] as const) {
    const added = ok(addItem(def, kind, { blockId: first }));
    def = added.def; ids.push(added.itemId);
  }
  const second = ok(addBlock(def, first));
  def = second.def;
  const [text, metric, image, info] = ids;
  const blocks = [
    box(first, 0, 0, 800, 300),
    box(text, 10, 40, 380, 60), box(metric, 410, 40, 380, 60),
    box(image, 10, 110, 780, 100),
    box(info, 10, 220, 380, 60),
    box(second.blockId, 0, 320, 800, 100),
  ];
  return { def, first, second: second.blockId, ids, blocks };
}

describe("serbest tuvalde bırakma yeri", () => {
  it("bileşen: bölüm içinde okuma sırasıyla; tam satır üye yüksekliğin ortasından bölünür", () => {
    const { def, first, blocks } = untabbed();
    expect(freeDropAt(blocks, def, { x: 50, y: 60 }, "item")).toEqual({ kind: "item", blockId: first, index: 0 });
    expect(freeDropAt(blocks, def, { x: 300, y: 60 }, "item")).toEqual({ kind: "item", blockId: first, index: 1 });
    expect(freeDropAt(blocks, def, { x: 500, y: 60 }, "item")).toEqual({ kind: "item", blockId: first, index: 1 });
    expect(freeDropAt(blocks, def, { x: 700, y: 60 }, "item")).toEqual({ kind: "item", blockId: first, index: 2 });
    // Görselin üst yarısında (x ne olursa olsun) önüne, alt yarısında arkasına.
    expect(freeDropAt(blocks, def, { x: 700, y: 130 }, "item")).toEqual({ kind: "item", blockId: first, index: 2 });
    expect(freeDropAt(blocks, def, { x: 50, y: 190 }, "item")).toEqual({ kind: "item", blockId: first, index: 3 });
    expect(freeDropAt(blocks, def, { x: 600, y: 250 }, "item")).toEqual({ kind: "item", blockId: first, index: 4 });
  });
  it("bileşen: boş bölüme sona, bölüm dışında yer yok", () => {
    const { def, second, blocks } = untabbed();
    expect(freeDropAt(blocks, def, { x: 100, y: 350 }, "item")).toEqual({ kind: "item", blockId: second, index: 0 });
    expect(freeDropAt(blocks, def, { x: 100, y: 500 }, "item")).toBeNull();
  });
  it("kutusu olmayan (gizli) üye sırayı kaydırmaz: dizin members sırasıdır", () => {
    const { def, first, ids, blocks } = untabbed();
    const withoutMetric = blocks.filter((b) => b.id !== ids[1]);
    expect(freeDropAt(withoutMetric, def, { x: 50, y: 130 }, "item")).toEqual({ kind: "item", blockId: first, index: 2 });
  });
  it("bölüm: sekmesiz sayfada bölümler arasında; bölüm sütununun dışında yer yok", () => {
    const { def, blocks } = untabbed();
    expect(freeDropAt(blocks, def, { x: 100, y: 100 }, "block")).toEqual({ kind: "block", tabIndex: null, index: 0 });
    expect(freeDropAt(blocks, def, { x: 100, y: 200 }, "block")).toEqual({ kind: "block", tabIndex: null, index: 1 });
    expect(freeDropAt(blocks, def, { x: 100, y: 390 }, "block")).toEqual({ kind: "block", tabIndex: null, index: 2 });
    expect(freeDropAt(blocks, def, { x: 900, y: 100 }, "block")).toBeNull();
  });
  it("bölüm: sekmeli sayfada görünen sekmenin içinde; sekme düğmesine bırakınca o sekmenin sonuna", () => {
    let def = untabbed().def;
    const genel = freeBlocks(def).map((block) => block.id);
    const tab = ok(addTab(def)); def = tab.def;
    const tabsId = def.components.find((component) => component.type === "tabs")!.id;
    const blocks = [box(`${tabsId}#tab0`, 0, 0, 80, 30), box(`${tabsId}#tab1`, 80, 0, 100, 30),
      box(genel[0], 0, 40, 800, 200), box(genel[1], 0, 250, 800, 100)];
    expect(freeDropAt(blocks, def, { x: 100, y: 330 }, "block")).toEqual({ kind: "block", tabIndex: 0, index: 2 });
    expect(freeDropAt(blocks, def, { x: 100, y: 15 }, "block")).toEqual({ kind: "block", tabIndex: 1, index: 1, onTab: true });
    expect(freeDropAt(blocks, def, { x: 100, y: 15 }, "item")).toBeNull();
    expect(freeTabs(def)![1].blockIds).toEqual([tab.blockId]);
  });
});

describe("bırakma çizgisi", () => {
  it("yarım üyenin önünde dikey, tam satır üyenin önünde yatay, son üyenin arkasında", () => {
    const { def, first, blocks } = untabbed();
    expect(freeDropMarker(blocks, def, { kind: "item", blockId: first, index: 1 })).toEqual({ x: 408, y: 40, width: 3, height: 60 });
    expect(freeDropMarker(blocks, def, { kind: "item", blockId: first, index: 2 })).toEqual({ x: 10, y: 104, width: 780, height: 3 });
    expect(freeDropMarker(blocks, def, { kind: "item", blockId: first, index: 4 })).toEqual({ x: 391, y: 220, width: 3, height: 60 });
  });
  it("boş bölümde bölümün içinde; bölümler arasında yatay; sekme düğmesinin altında", () => {
    const { def, second, blocks } = untabbed();
    expect(freeDropMarker(blocks, def, { kind: "item", blockId: second, index: 0 })).toEqual({ x: 8, y: 408, width: 784, height: 3 });
    expect(freeDropMarker(blocks, def, { kind: "block", tabIndex: null, index: 1 })).toEqual({ x: 0, y: 309, width: 800, height: 3 });
    expect(freeDropMarker(blocks, def, { kind: "block", tabIndex: null, index: 2 })).toEqual({ x: 0, y: 424, width: 800, height: 3 });
    expect(freeDropMarker(blocks, def, null)).toBeNull();
  });
});

describe("ret ve paletten bırakma", () => {
  function fullFirst() {
    let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const first = freeBlocks(def)[0].id;
    for (let index = 0; index < MAX_BLOCK_MEMBERS; index++) def = ok(addItem(def, "text", { blockId: first })).def;
    const second = ok(addBlock(def, first));
    const outsider = ok(addItem(second.def, "text", { blockId: second.blockId }));
    return { def: outsider.def, first, outsider: outsider.itemId };
  }
  it("dolu bölüme yeni ya da başka bölümden gelen bileşen gerekçeyle reddedilir; kendi üyesinin sırası değişebilir", () => {
    const { def, first, outsider } = fullFirst();
    const drop = { kind: "item", blockId: first, index: 0 } as const;
    expect(freeDropRefusal(def, drop, null)).toBe(FREE_BLOCK_FULL);
    expect(freeDropRefusal(def, drop, { itemId: outsider })).toBe(FREE_BLOCK_FULL);
    expect(freeDropRefusal(def, drop, { itemId: members(def, first)[3] })).toBeNull();
    expect(freePaletteDrop(def, consultantPaletteKey("text"), drop)).toEqual({ reason: FREE_BLOCK_FULL });
  });
  it("paletten bileşen bölümün o sırasına girer", () => {
    const { def, first, ids } = untabbed();
    const added = ok(freePaletteDrop(def, consultantPaletteKey("indicator"), { kind: "item", blockId: first, index: 1 }));
    expect(members(added.def, first)).toEqual([ids[0], added.id, ...ids.slice(1)]);
    const list = ok(freePaletteDrop(def, consultantPaletteKey("list"), { kind: "item", blockId: first, index: 0 }));
    expect(added.def.components.find((component) => component.id === added.id)!.type).toBe("metric");
    expect(list.def.components.find((component) => component.id === list.id)!.type).toBe("dataTable");
  });
  it("paletten Bölümler bölümler arasına yeni bölüm açar; 20 bölümde reddedilir", () => {
    const { def, first, second } = untabbed();
    const added = ok(freePaletteDrop(def, consultantPaletteKey("sections"), { kind: "block", tabIndex: null, index: 1 }));
    expect(freeBlocks(added.def).map((block) => block.id)).toEqual([first, added.id, second]);
    let full = def;
    while (freeBlocks(full).length < MAX_FREE_BLOCKS) full = ok(addBlock(full)).def;
    expect(freePaletteDrop(full, consultantPaletteKey("sections"), { kind: "block", tabIndex: null, index: 0 })).toEqual({ reason: FREE_BLOCKS_FULL });
    expect(freeDropRefusal(full, { kind: "block", tabIndex: null, index: 0 }, null)).toBe(FREE_BLOCKS_FULL);
  });
  it("serbest gövdede kullanılamayan öğe ve yanlış yer gerekçeyle reddedilir", () => {
    const { def, first } = untabbed();
    const form = freePaletteDrop(def, consultantPaletteKey("form"), { kind: "item", blockId: first, index: 0 });
    expect("reason" in form && form.reason).toBe("Bu bileşen Kayıt kartı kalıbında kullanılır.");
    expect("reason" in freePaletteDrop(def, consultantPaletteKey("text"), { kind: "block", tabIndex: null, index: 0 })).toBe(true);
    expect("reason" in freePaletteDrop(def, "heading", { kind: "item", blockId: first, index: 0 })).toBe(true);
  });
});
