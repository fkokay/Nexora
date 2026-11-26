// Serbest gövde: tuvalde sürükle-bırakın konumlu model işlevleri (ekler planı, madde 6). Dizin her zaman taşımadan önceki
// listede "bunun önüne" konumudur; liste uzunluğu sonu demektir.
import { describe, expect, it } from "vitest";
import { newFreeTemplateDefinition } from "../pageTemplates";
import {
  addBlock, addItem, addTab, FREE_BLOCK_FULL, freeBlocks, freeFullRow, freeTabs, MAX_BLOCK_MEMBERS, moveBlockTo, moveItemToBlock,
} from "./freeModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

const fresh = () => newFreeTemplateDefinition() as unknown as ModelDefinition;
const ok = <T extends object>(result: T | { reason: string }): T => {
  if ("reason" in result) throw new Error(`beklenmeyen neden: ${result.reason}`);
  return result;
};
const members = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!.props.members as string[];
const firstBlock = (def: ModelDefinition) => freeBlocks(def)[0].id;
function assertShape(def: ModelDefinition) {
  const blocks = def.components.filter((component) => component.type === "section" && component.props.slot === "block");
  for (const item of def.components.filter((component) => component.props.slot === "item")) {
    expect(blocks.filter((b) => (b.props.members as string[]).includes(item.id))).toHaveLength(1);
  }
  const tabs = freeTabs(def);
  if (tabs) {
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    for (const tab of tabs) expect(tab.blockIds.length).toBeGreaterThan(0);
    for (const b of blocks) expect(tabs.filter((tab) => tab.blockIds.includes(b.id))).toHaveLength(1);
  }
}
/** Bir bölümde üç bileşen (a, b, c sırasıyla) ve ikinci, boş bir bölüm. */
function twoBlocks() {
  let def = fresh();
  const first = firstBlock(def);
  const ids: string[] = [];
  for (const kind of ["text", "infoBox", "indicator"] as const) {
    const added = ok(addItem(def, kind, { blockId: first }));
    def = added.def; ids.push(added.itemId);
  }
  const second = ok(addBlock(def, first));
  return { def: second.def, first, second: second.blockId, ids };
}

describe("freeFullRow (ERP freeTemplateModel ile aynı kural)", () => {
  const c = (type: string, props: Record<string, unknown> = {}): ModelComponent => ({ id: "x", type, props: { slot: "item", ...props } as ModelComponent["props"] });
  it("Liste, Görsel ve maddeli kutular tam satırdır", () => {
    expect(freeFullRow(c("dataTable"))).toBe(true);
    expect(freeFullRow(c("image"))).toBe(true);
    expect(freeFullRow(c("alert", { items: ["a", "b"] }))).toBe(true);
    expect(freeFullRow(c("card", { items: ["a"] }))).toBe(true);
    expect(freeFullRow(c("list", { items: ["a"] }))).toBe(true);
    expect(freeFullRow(c("alert", { text: "tek" }))).toBe(false);
    expect(freeFullRow(c("alert", { items: ["  "] }))).toBe(false);
    expect(freeFullRow(c("metric"))).toBe(false);
  });
});

describe("addItem konumla", () => {
  it("verilen sıraya girer; dizin yoksa ya da taşkınsa sona", () => {
    const { def, first, ids } = twoBlocks();
    const at1 = ok(addItem(def, "image", { blockId: first }, 1));
    expect(members(at1.def, first)).toEqual([ids[0], at1.itemId, ids[1], ids[2]]);
    const at0 = ok(addItem(def, "image", { blockId: first }, 0));
    expect(members(at0.def, first)[0]).toBe(at0.itemId);
    const end = ok(addItem(def, "image", { blockId: first }, 99));
    expect(members(end.def, first).at(-1)).toBe(end.itemId);
    const plain = ok(addItem(def, "image", { blockId: first }));
    expect(members(plain.def, first).at(-1)).toBe(plain.itemId);
    assertShape(at1.def);
  });
  it("dolu bölüme konumla da eklenmez; 5c'nin nedeni döner", () => {
    let def = fresh();
    const first = firstBlock(def);
    for (let index = 0; index < MAX_BLOCK_MEMBERS; index++) def = ok(addItem(def, "text", { blockId: first })).def;
    expect(addItem(def, "text", { blockId: first }, 0)).toEqual({ reason: FREE_BLOCK_FULL });
  });
});

describe("moveItemToBlock konumla", () => {
  it("bölüm içinde ileri ve geri taşır; aynı yere bırakma tanımı değiştirmez", () => {
    const { def, first, ids: [a, b, c] } = twoBlocks();
    expect(members(ok(moveItemToBlock(def, a, first, 3)).def, first)).toEqual([b, c, a]);
    expect(members(ok(moveItemToBlock(def, a, first, 2)).def, first)).toEqual([b, a, c]);
    expect(members(ok(moveItemToBlock(def, c, first, 0)).def, first)).toEqual([c, a, b]);
    expect(ok(moveItemToBlock(def, b, first, 1)).def).toBe(def);
    expect(ok(moveItemToBlock(def, b, first, 2)).def).toBe(def);
  });
  it("bölümler arasında taşır; bileşen tek bölümde kalır", () => {
    const { def, first, second, ids: [a, b, c] } = twoBlocks();
    const once = ok(moveItemToBlock(def, b, second, 0)).def;
    expect(members(once, first)).toEqual([a, c]);
    expect(members(once, second)).toEqual([b]);
    const twice = ok(moveItemToBlock(once, c, second, 0)).def;
    expect(members(twice, second)).toEqual([c, b]);
    assertShape(twice);
  });
  it("dolu bölümde sıra değişir, başka bölümden gelen reddedilir", () => {
    let def = fresh();
    const first = firstBlock(def);
    for (let index = 0; index < MAX_BLOCK_MEMBERS; index++) def = ok(addItem(def, "text", { blockId: first })).def;
    const second = ok(addBlock(def, first));
    const outsider = ok(addItem(second.def, "text", { blockId: second.blockId }));
    def = outsider.def;
    const last = members(def, first).at(-1)!;
    expect(members(ok(moveItemToBlock(def, last, first, 0)).def, first)[0]).toBe(last);
    expect(moveItemToBlock(def, outsider.itemId, first, 3)).toEqual({ reason: FREE_BLOCK_FULL });
  });
  it("dizinsiz çağrı eski davranışı korur (sona; zaten tek sahipse değişmez)", () => {
    const { def, first, second, ids: [a] } = twoBlocks();
    expect(ok(moveItemToBlock(def, a, first)).def).toBe(def);
    expect(members(ok(moveItemToBlock(def, a, second)).def, second)).toEqual([a]);
  });
});

describe("moveBlockTo", () => {
  it("sekmesiz sayfada bölüm sırasını değiştirir", () => {
    let def = fresh();
    const one = firstBlock(def);
    const two = ok(addBlock(def, one)); def = two.def;
    const three = ok(addBlock(def, two.blockId)); def = three.def;
    const ids = () => freeBlocks(def).map((block) => block.id);
    expect(ids()).toEqual([one, two.blockId, three.blockId]);
    const moved = moveBlockTo(def, three.blockId, null, 0);
    expect(freeBlocks(moved).map((block) => block.id)).toEqual([three.blockId, one, two.blockId]);
    expect(freeBlocks(moveBlockTo(def, one, null, 3)).map((block) => block.id)).toEqual([two.blockId, three.blockId, one]);
    expect(moveBlockTo(def, one, null, 0)).toBe(def);
    expect(moveBlockTo(def, one, null, 1)).toBe(def);
    expect(moveBlockTo(def, one, 0, 0)).toBe(def); // sekmesiz sayfada sekme dizini yok sayılmaz, değişmez
  });
  it("sekmeli sayfada sekme içinde ve sekmeler arasında taşır; boş sekme oluşmaz", () => {
    let def = fresh();
    const genel = firstBlock(def);
    const extra = ok(addBlock(def, genel)); def = extra.def;
    const tab = ok(addTab(def)); def = tab.def;
    // Genel: [genel, extra], Yeni sekme: [tab.blockId]
    expect(freeTabs(def)!.map((item) => item.blockIds)).toEqual([[genel, extra.blockId], [tab.blockId]]);
    const within = moveBlockTo(def, extra.blockId, 0, 0);
    expect(freeTabs(within)![0].blockIds).toEqual([extra.blockId, genel]);
    const across = moveBlockTo(def, genel, 1, 0);
    expect(freeTabs(across)!.map((item) => item.blockIds)).toEqual([[extra.blockId], [genel, tab.blockId]]);
    assertShape(across);
    expect(moveBlockTo(def, genel, null, 0)).toBe(def);
    expect(moveBlockTo(def, genel, 5, 0)).toBe(def);
    expect(moveBlockTo(def, genel, 0, 1)).toBe(def);
  });
  it("sekmenin son bölümü taşınınca sekme kalkar; tek sekme kalırsa sekme bileşeni de", () => {
    let def = fresh();
    const genel = firstBlock(def);
    const tab = ok(addTab(def)); def = tab.def;
    const merged = moveBlockTo(def, tab.blockId, 0, 0);
    expect(freeTabs(merged)).toBeNull();
    expect(freeBlocks(merged).map((block) => block.id)).toEqual([tab.blockId, genel]);
    assertShape(merged);
    const third = ok(addTab(def)); def = third.def;
    const moved = moveBlockTo(def, tab.blockId, 2, 1);
    expect(freeTabs(moved)!.map((item) => item.blockIds)).toEqual([[genel], [third.blockId, tab.blockId]]);
    assertShape(moved);
  });
});
