import { describe, expect, it } from "vitest";
import type { CatalogAction } from "../catalogClient";
import { newFreeTemplateDefinition } from "../pageTemplates";
import {
  addBlock, addItem, addPageAction, addTab, blockOf, DEFAULT_BLOCK_TITLE, FREE_BLOCK_FULL, FREE_BLOCK_NOT_EMPTY, FREE_BLOCKS_FULL,
  FREE_LAST_BLOCK, FREE_TABS_FULL, freeBlocks, freeSelectionTab, freeTabs, shownFreeTab, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS, MAX_PAGE_ACTIONS, moveBlock, moveBlockToTab, moveItem,
  moveItemToBlock, PAGE_ACTION_BULK, PAGE_ACTION_NEEDS_INPUT, PAGE_ACTION_ROW, pageActionCodes, pageActionUsable, removeBlock, removeItem,
  removePageAction, removeTab, renameTab, setBlockColumns, setBlockTitle,
  addPageButton, FREE_PAGE_CODE_INVALID, moveTab, pageButtonCodeProblem, pageButtons, removePageButton,
} from "./freeModel";
import type { ModelDefinition } from "./listPanelModel";
import { ensureTemplateSlots } from "./templateGuards";

const fresh = () => newFreeTemplateDefinition() as unknown as ModelDefinition;
const ok = <T extends object>(result: T | { reason: string }): T => {
  if ("reason" in result) throw new Error(`beklenmeyen neden: ${result.reason}`);
  return result;
};
const block = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!;
const members = (def: ModelDefinition, id: string) => block(def, id).props.members as string[];
const tabsOf = (def: ModelDefinition) => def.components.filter((component) => component.type === "tabs");
/** Her bileşen (item) tam bir bölümde mi ve her bölüm (sekme varsa) tam bir sekmede mi. */
function assertShape(def: ModelDefinition) {
  const blocks = def.components.filter((component) => component.type === "section" && component.props.slot === "block");
  expect(blocks.length).toBeGreaterThan(0);
  for (const item of def.components.filter((component) => component.props.slot === "item")) {
    expect(blocks.filter((b) => (b.props.members as string[]).includes(item.id))).toHaveLength(1);
  }
  for (const b of blocks) expect((b.props.members as string[]).length).toBeLessThanOrEqual(MAX_BLOCK_MEMBERS);
  const tabs = freeTabs(def);
  if (tabs) {
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    for (const tab of tabs) expect(tab.blockIds.length).toBeGreaterThan(0);
    for (const b of blocks) expect(tabs.filter((tab) => tab.blockIds.includes(b.id))).toHaveLength(1);
  }
  expect(tabsOf(def).length).toBeLessThanOrEqual(1);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
const action = (code: string, extra: Partial<CatalogAction> = {}): CatalogAction =>
  ({ code, label: `${code} eylemi`, kind: "update", target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null, ...extra });

describe("serbest gövde modeli", () => {
  it("newFreeTemplateDefinition has one untitled-numbered block with two columns and passes ensureTemplateSlots unchanged", () => {
    const def = fresh();
    expect(def).toEqual({ schemaVersion: 2, template: { name: "free" }, queries: [],
      components: [{ id: "bolum", type: "section", props: { slot: "block", title: "Bölüm 1", columns: 2, members: [] } }] });
    expect(ensureTemplateSlots(def)).toBe(def);
    expect(freeTabs(def)).toBeNull();
    expect(freeBlocks(def).map((b) => b.id)).toEqual(["bolum"]);
    expect([DEFAULT_BLOCK_TITLE, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS]).toEqual(["Bölüm", 12, 20]);
  });

  it("addBlock numbers titles, uses two columns and inserts after the given block", () => {
    const first = ok(addBlock(fresh()));
    expect(block(first.def, first.blockId).props).toEqual({ slot: "block", title: "Bölüm 2", columns: 2, members: [] });
    const middle = ok(addBlock(first.def, "bolum"));
    expect(freeBlocks(middle.def).map((b) => b.id)).toEqual(["bolum", middle.blockId, first.blockId]);
    expect(block(middle.def, middle.blockId).props.title).toBe("Bölüm 3");
    // Silinmiş bölümün numarası boşalınca başlık yine benzersiz kalır.
    const removed = ok(removeBlock(middle.def, middle.blockId)).def;
    expect(block(ok(addBlock(removed)).def, ok(addBlock(removed)).blockId).props.title).toBe("Bölüm 3");
    const two = ok(addBlock(first.def));
    expect(block(two.def, two.blockId).props.title).toBe("Bölüm 3");
  });

  it("addBlock with tabs goes into the tab of afterBlockId, otherwise the first tab", () => {
    const tabbed = ok(addTab(fresh()));
    const intoSecond = ok(addBlock(tabbed.def, tabbed.blockId));
    expect(freeTabs(intoSecond.def)!.map((tab) => tab.blockIds)).toEqual([["bolum"], [tabbed.blockId, intoSecond.blockId]]);
    const intoFirst = ok(addBlock(tabbed.def));
    expect(freeTabs(intoFirst.def)!.map((tab) => tab.blockIds)).toEqual([["bolum", intoFirst.blockId], [tabbed.blockId]]);
    assertShape(intoFirst.def);
  });

  it("addBlock without afterBlockId goes to the given (shown) tab; an unknown tab falls back to the first", () => {
    const tabbed = ok(addTab(fresh()));
    const intoShown = ok(addBlock(tabbed.def, undefined, 1));
    expect(freeTabs(intoShown.def)!.map((tab) => tab.blockIds)).toEqual([["bolum"], [tabbed.blockId, intoShown.blockId]]);
    assertShape(intoShown.def);
    const unknown = ok(addBlock(tabbed.def, undefined, 7));
    expect(freeTabs(unknown.def)!.map((tab) => tab.blockIds)).toEqual([["bolum", unknown.blockId], [tabbed.blockId]]);
    // afterBlockId önce gelir.
    const after = ok(addBlock(tabbed.def, "bolum", 1));
    expect(freeTabs(after.def)!.map((tab) => tab.blockIds)).toEqual([["bolum", after.blockId], [tabbed.blockId]]);
  });

  it("freeSelectionTab finds the tab of a selected block or item", () => {
    const tabbed = ok(addTab(fresh()));
    const item = ok(addItem(tabbed.def, "text", { blockId: tabbed.blockId }));
    const tabsId = tabsOf(item.def)[0].id;
    expect(freeSelectionTab(item.def, tabbed.blockId)).toEqual({ tabsId, index: 1 });
    expect(freeSelectionTab(item.def, item.itemId)).toEqual({ tabsId, index: 1 });
    expect(freeSelectionTab(item.def, "bolum")).toEqual({ tabsId, index: 0 });
    // Sekme bileşeni, bilinmeyen kimlik, seçimsizlik ve sekmesiz sayfa: null.
    expect(freeSelectionTab(item.def, tabsId)).toBeNull();
    expect(freeSelectionTab(item.def, "yok")).toBeNull();
    expect(freeSelectionTab(item.def, null)).toBeNull();
    const plain = ok(addItem(fresh(), "text", {}));
    expect(freeSelectionTab(plain.def, plain.itemId)).toBeNull();
    // Bölüm başka sekmeye taşınınca sekmesi de değişir.
    const moved = moveBlockToTab(ok(addBlock(item.def, "bolum")).def, "bolum", 1);
    expect(freeSelectionTab(moved, "bolum")).toEqual({ tabsId, index: 1 });
  });

  it("shownFreeTab reads the shown tab from the canvas block ids", () => {
    const tabbed = ok(addTab(fresh()));
    expect(shownFreeTab(tabbed.def, ["bolum"])).toBe(0);
    expect(shownFreeTab(tabbed.def, [tabbed.blockId, "sekmeler"])).toBe(1);
    expect(shownFreeTab(tabbed.def, [])).toBe(-1);
    expect(shownFreeTab(fresh(), ["bolum"])).toBe(-1);
  });

  it("addBlock stops at twenty blocks", () => {
    let def = fresh();
    for (let index = 1; index < MAX_FREE_BLOCKS; index++) def = ok(addBlock(def)).def;
    expect(freeBlocks(def)).toHaveLength(20);
    expect(addBlock(def)).toEqual({ reason: FREE_BLOCKS_FULL });
    expect(addTab(def)).toEqual({ reason: FREE_BLOCKS_FULL });
  });

  it("addItem goes to selected block, then item's block, then last block", () => {
    const two = ok(addBlock(fresh()));
    const second = two.blockId;
    const last = ok(addItem(two.def, "text", {}));
    expect(blockOf(last.def, last.itemId)).toBe(second);
    expect(block(last.def, last.itemId)).toEqual({ id: last.itemId, type: "heading", props: { text: "Başlık", slot: "item" } });
    const selected = ok(addItem(last.def, "indicator", { blockId: "bolum", nearItemId: last.itemId }));
    expect(blockOf(selected.def, selected.itemId)).toBe("bolum");
    const near = ok(addItem(selected.def, "image", { nearItemId: selected.itemId }));
    expect(blockOf(near.def, near.itemId)).toBe("bolum");
    expect(members(near.def, "bolum")).toEqual([selected.itemId, near.itemId]);
    const table = ok(addItem(near.def, "table", { blockId: second }));
    expect(block(table.def, table.itemId)).toEqual({ id: table.itemId, type: "dataTable", props: { slot: "item" } });
    const info = ok(addItem(table.def, "infoBox", { blockId: "yok", nearItemId: "yok" }));
    expect(blockOf(info.def, info.itemId)).toBe(second);
    assertShape(info.def);
    expect(new Set(info.def.components.map((c) => c.id)).size).toBe(info.def.components.length);
  });

  it("addItem into full block returns reason", () => {
    let def = fresh();
    for (let index = 0; index < MAX_BLOCK_MEMBERS; index++) def = ok(addItem(def, "text", { blockId: "bolum" })).def;
    expect(members(def, "bolum")).toHaveLength(12);
    expect(addItem(def, "text", { blockId: "bolum" })).toEqual({ reason: FREE_BLOCK_FULL });
    expect(addItem(def, "text", {})).toEqual({ reason: FREE_BLOCK_FULL });
    expect(FREE_BLOCK_FULL).toBe("Bu bölüm dolu; yeni bir bölüm ekleyin.");
  });

  it("removeBlock with members returns reason; last block returns reason", () => {
    const item = ok(addItem(fresh(), "text", {}));
    const two = ok(addBlock(item.def));
    expect(removeBlock(two.def, "bolum")).toEqual({ reason: FREE_BLOCK_NOT_EMPTY });
    expect(FREE_BLOCK_NOT_EMPTY).toBe("Önce bu bölümdeki bileşenleri kaldırın ya da başka bölüme taşıyın.");
    expect(removeBlock(fresh(), "bolum")).toEqual({ reason: FREE_LAST_BLOCK });
    expect(FREE_LAST_BLOCK).toBe("Serbest gövdede en az bir bölüm olmalı.");
    const removed = ok(removeBlock(two.def, two.blockId)).def;
    expect(freeBlocks(removed).map((b) => b.id)).toEqual(["bolum"]);
  });

  it("removeBlock cleans the tabs: an emptied tab goes, one remaining tab removes the tabs component", () => {
    const tabbed = ok(addTab(fresh()));
    const removed = ok(removeBlock(tabbed.def, tabbed.blockId)).def;
    expect(freeTabs(removed)).toBeNull();
    expect(tabsOf(removed)).toEqual([]);
    const three = ok(addTab(tabbed.def));
    const fewer = ok(removeBlock(three.def, tabbed.blockId)).def;
    expect(freeTabs(fewer)!.map((tab) => tab.label)).toEqual(["Genel", "Yeni sekme 2"]);
    assertShape(fewer);
  });

  it("setBlockTitle, setBlockColumns and moveBlock", () => {
    const two = ok(addBlock(fresh()));
    expect(block(setBlockTitle(two.def, "bolum", "  Bugün "), "bolum").props.title).toBe("Bugün");
    expect(block(setBlockTitle(two.def, "bolum", "   "), "bolum").props).not.toHaveProperty("title");
    expect(block(setBlockColumns(two.def, "bolum", 3), "bolum").props.columns).toBe(3);
    expect(setBlockColumns(two.def, "bolum", 4 as never)).toBe(two.def);
    const moved = moveBlock(two.def, two.blockId, -1);
    expect(freeBlocks(moved).map((b) => b.id)).toEqual([two.blockId, "bolum"]);
    expect(moveBlock(moved, two.blockId, -1)).toBe(moved);
    const tabbed = ok(addBlock(ok(addTab(fresh())).def));
    const inTab = moveBlock(tabbed.def, tabbed.blockId, -1);
    expect(freeTabs(inTab)![0].blockIds).toEqual([tabbed.blockId, "bolum"]);
    expect(moveBlock(inTab, "bolum", 1)).toBe(inTab);
  });

  it("first addTab creates Genel with existing blocks and a new tab with a new empty block", () => {
    const two = ok(addBlock(ok(addItem(fresh(), "text", {})).def));
    const result = ok(addTab(two.def));
    expect(result.tabIndex).toBe(1);
    expect(freeTabs(result.def)).toEqual([{ label: "Genel", blockIds: ["bolum", two.blockId] }, { label: "Yeni sekme", blockIds: [result.blockId] }]);
    expect(block(result.def, result.blockId).props).toEqual({ slot: "block", title: "Bölüm 3", columns: 2, members: [] });
    expect(tabsOf(result.def)).toEqual([{ id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: ["Genel=bolum," + two.blockId, "Yeni sekme=" + result.blockId] } }]);
    assertShape(result.def);
    expect(ensureTemplateSlots(result.def)).toBe(result.def);
  });

  it("later addTab always brings a block", () => {
    let def = ok(addTab(fresh(), "Siparişler")).def;
    expect(freeTabs(def)!.map((tab) => tab.label)).toEqual(["Genel", "Siparişler"]);
    for (let index = 2; index < 8; index++) {
      const result = ok(addTab(def));
      expect(freeTabs(result.def)![result.tabIndex].blockIds).toEqual([result.blockId]);
      def = result.def;
      assertShape(def);
    }
    expect(freeTabs(def)).toHaveLength(8);
    expect(addTab(def)).toEqual({ reason: FREE_TABS_FULL });
    expect(freeTabs(ok(addTab(fresh(), "  A=b,c ")).def)![1].label).toBe("Abc");
  });

  it("renameTab cleans the label and ignores an empty one", () => {
    const def = ok(addTab(fresh())).def;
    expect(freeTabs(renameTab(def, 1, " Siparişler=, "))![1].label).toBe("Siparişler");
    expect(renameTab(def, 1, " ,= ")).toBe(def);
    expect(renameTab(def, 5, "X")).toBe(def);
    expect(freeTabs(renameTab(def, 0, "x".repeat(60)))![0].label).toHaveLength(40);
    expect(freeTabs(renameTab(def, 1, "{{a}} Sekme"))![1].label).toBe("a Sekme");
    expect(freeTabs(ok(addTab(fresh(), "{Ek}")).def)![1].label).toBe("Ek");
  });

  it("removeTab moves blocks to previous tab", () => {
    const a = ok(addTab(fresh()));
    const b = ok(addTab(a.def));
    const removed = removeTab(b.def, 2);
    expect(freeTabs(removed)).toEqual([{ label: "Genel", blockIds: ["bolum"] }, { label: "Yeni sekme", blockIds: [a.blockId, b.blockId] }]);
    const first = removeTab(b.def, 0);
    expect(freeTabs(first)).toEqual([{ label: "Yeni sekme", blockIds: [a.blockId, "bolum"] }, { label: "Yeni sekme 2", blockIds: [b.blockId] }]);
    assertShape(removed); assertShape(first);
    expect(removeTab(b.def, 9)).toBe(b.def);
    expect(removeTab(fresh(), 0)).toEqual(fresh());
  });

  it("removing down to one tab removes tabs component", () => {
    const a = ok(addTab(fresh()));
    const removed = removeTab(a.def, 1);
    expect(tabsOf(removed)).toEqual([]);
    expect(freeTabs(removed)).toBeNull();
    expect(freeBlocks(removed).map((b) => b.id)).toEqual(["bolum", a.blockId]);
    assertShape(removed);
    expect(ensureTemplateSlots(removed)).toBe(removed);
  });

  it("moving the only block out of a tab removes that tab", () => {
    const a = ok(addTab(fresh()));
    const b = ok(addTab(a.def));
    const moved = moveBlockToTab(b.def, a.blockId, 2);
    expect(freeTabs(moved)).toEqual([{ label: "Genel", blockIds: ["bolum"] }, { label: "Yeni sekme 2", blockIds: [b.blockId, a.blockId] }]);
    assertShape(moved);
    const single = moveBlockToTab(a.def, a.blockId, 0);
    expect(tabsOf(single)).toEqual([]);
    assertShape(single);
    expect(moveBlockToTab(b.def, a.blockId, 1)).toBe(b.def);
    expect(moveBlockToTab(fresh(), "bolum", 0)).toEqual(fresh());
  });

  it("moveItemToBlock keeps every item in exactly one block", () => {
    const two = ok(addBlock(fresh()));
    const x = ok(addItem(two.def, "text", { blockId: "bolum" }));
    const y = ok(addItem(x.def, "indicator", { blockId: "bolum" }));
    const moved = ok(moveItemToBlock(y.def, x.itemId, two.blockId)).def;
    expect(members(moved, "bolum")).toEqual([y.itemId]);
    expect(members(moved, two.blockId)).toEqual([x.itemId]);
    assertShape(moved);
    expect(ok(moveItemToBlock(moved, x.itemId, two.blockId)).def).toBe(moved);
    let full = moved;
    for (let index = 1; index < MAX_BLOCK_MEMBERS; index++) full = ok(addItem(full, "text", { blockId: two.blockId })).def;
    expect(moveItemToBlock(full, y.itemId, two.blockId)).toEqual({ reason: FREE_BLOCK_FULL });
    // Bölümsüz kalmış bir bileşen de tam bir bölüme girer.
    const orphan: ModelDefinition = { ...y.def, components: y.def.components.map((c) => c.id === "bolum" ? { ...c, props: { ...c.props, members: [y.itemId] } } : c) };
    const placed = ok(moveItemToBlock(orphan, x.itemId, two.blockId)).def;
    assertShape(placed);
  });

  it("moveItem reorders inside its block", () => {
    const x = ok(addItem(fresh(), "text", {}));
    const y = ok(addItem(x.def, "image", {}));
    const moved = moveItem(y.def, y.itemId, -1);
    expect(members(moved, "bolum")).toEqual([y.itemId, x.itemId]);
    expect(moveItem(moved, y.itemId, -1)).toBe(moved);
  });

  it("removeItem leaves empty block in place", () => {
    const two = ok(addBlock(fresh()));
    const x = ok(addItem(two.def, "text", { blockId: two.blockId }));
    const removed = removeItem(x.def, x.itemId);
    expect(removed.components.some((c) => c.id === x.itemId)).toBe(false);
    expect(block(removed, two.blockId).props.members).toEqual([]);
    expect(freeBlocks(removed).map((b) => b.id)).toEqual(["bolum", two.blockId]);
    assertShape(removed);
  });

  it("removeItem drops the item's queries that nothing else uses", () => {
    const table = ok(addItem(fresh(), "table", {}));
    const other = ok(addItem(table.def, "indicator", {}));
    const read = { id: "satislar", name: "satislar", kind: "read" as const, dataSource: "satislar", runOn: "load" as const, parameters: [] };
    const shared = { id: "ortak", name: "ortak", kind: "read" as const, dataSource: "ortak", runOn: "load" as const, parameters: [] };
    const def: ModelDefinition = { ...other.def, queries: [read, shared] as ModelDefinition["queries"], components: other.def.components.map((c) =>
      c.id === table.itemId ? { ...c, props: { ...c.props, query: "satislar", emptyText: "{{ortak.rows[0].x}}" } }
        : c.id === other.itemId ? { ...c, props: { ...c.props, query: "ortak" } } : c) };
    const removed = removeItem(def, table.itemId);
    expect(removed.queries.map((q) => q.id)).toEqual(["ortak"]);
  });

  it("removeItem keeps queries that are only word matches, not references", () => {
    const x = ok(addItem(fresh(), "text", {}));
    const query = (id: string) => ({ id, name: id, kind: "read" as const, dataSource: id, runOn: "load" as const, parameters: [] });
    // Bileşenin kimliği bir sorgu kimliğiyle aynı ve metni başka bir sorgunun adını bağlamasız anıyor: ikisi de başvuru değil.
    const def: ModelDefinition = { ...x.def, queries: [query(x.itemId), query("ortak")] as ModelDefinition["queries"],
      components: x.def.components.map((c) => c.id === x.itemId ? { ...c, props: { ...c.props, text: "ortak toplam" } } : c) };
    expect(removeItem(def, x.itemId).queries.map((q) => q.id)).toEqual([x.itemId, "ortak"]);
    // Bağlamayla başvurulan ve başka yerde kullanılmayan sorgu silinir; başka bir sorgunun parametresi bağlıyorsa kalır.
    const bound: ModelDefinition = { ...def, components: def.components.map((c) => c.id === x.itemId ? { ...c, props: { ...c.props, text: "{{ ortak.rows[0].toplam }}" } } : c) };
    expect(removeItem(bound, x.itemId).queries.map((q) => q.id)).toEqual([x.itemId]);
    const chained: ModelDefinition = { ...bound, queries: [...bound.queries, { ...query("detay"), parameters: [{ name: "p", type: "text", binding: "{{ortak.rows[0].kod}}" }] }] as ModelDefinition["queries"] };
    expect(removeItem(chained, x.itemId).queries.map((q) => q.id)).toEqual([x.itemId, "ortak", "detay"]);
  });

  it("addTab on a tabs component with no valid tab seeds Genel with the existing blocks", () => {
    const two = ok(addBlock(fresh()));
    const broken: ModelDefinition = { ...two.def, components: [{ id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [] } }, ...two.def.components] };
    const result = ok(addTab(broken));
    expect(result.tabIndex).toBe(1);
    expect(freeTabs(result.def)).toEqual([{ label: "Genel", blockIds: ["bolum", two.blockId] }, { label: "Yeni sekme", blockIds: [result.blockId] }]);
    assertShape(result.def);
  });

  it("pageActionUsable rejects row, bulk and parameterised actions", () => {
    expect(pageActionUsable(action("yenile"))).toEqual({ usable: true });
    expect(pageActionUsable(action("satir", { target: "row" }))).toEqual({ usable: false, reason: PAGE_ACTION_ROW });
    expect(PAGE_ACTION_ROW).toBe("Bu eylem bir satıra ait; serbest gövdede kullanılamaz.");
    expect(pageActionUsable(action("toplu", { target: "bulk", kind: "delete" }))).toEqual({ usable: false, reason: PAGE_ACTION_BULK });
    expect(pageActionUsable(action("girdi", { parameters: [{ name: "tarih", type: "date" }] }))).toEqual({ usable: false, reason: PAGE_ACTION_NEEDS_INPUT });
    expect(pageActionUsable({ ...action("kapali"), blockedReason: "Kapalı." } as CatalogAction)).toEqual({ usable: false, reason: "Kapalı." });
  });

  it("addPageAction writes an action query and a query button; delete stays last; removePageAction drops both", () => {
    const sil = action("temizle", { kind: "delete", confirmText: "Emin misiniz?" });
    let def = addPageAction(fresh(), sil);
    def = addPageAction(def, action("yenile"));
    expect(def.queries).toEqual([
      { id: "temizle", name: "temizle", kind: "delete", action: "temizle", runOn: "manual", parameters: [] },
      { id: "yenile", name: "yenile", kind: "update", action: "yenile", runOn: "manual", parameters: [] }]);
    const buttons = def.components.filter((c) => c.props.slot === "actions");
    expect(buttons).toEqual([
      { id: "yenileDugmesi", type: "button", props: { slot: "actions", text: "yenile eylemi", actionType: "query", queryId: "yenile" } },
      { id: "temizleDugmesi", type: "button", props: { slot: "actions", text: "temizle eylemi", actionType: "query", queryId: "temizle", confirmEnabled: true, confirmText: "Emin misiniz?" } }]);
    expect(pageActionCodes(def)).toEqual(["yenile", "temizle"]);
    expect(addPageAction(def, action("yenile"))).toBe(def);
    expect(addPageAction(def, action("satir", { target: "row" }))).toBe(def);
    expect(ensureTemplateSlots(def)).toBe(def);
    const removed = removePageAction(def, "temizle");
    expect(removed.queries.map((q) => q.id)).toEqual(["yenile"]);
    expect(pageActionCodes(removed)).toEqual(["yenile"]);
    let many = fresh();
    for (let index = 0; index < MAX_PAGE_ACTIONS + 2; index++) many = addPageAction(many, action(`e${index}`));
    expect(pageActionCodes(many)).toHaveLength(8);
  });

  it("addPageButton adds a screen-opening button; the first button stays the main one; the 8-button limit counts it", () => {
    const withAction = addPageAction(fresh(), action("yenile"));
    const paged = addPageButton(withAction, " satis-raporu ", "  Satış raporu ");
    expect(pageButtons(paged)).toEqual([{ id: "ekranDugmesi", text: "Satış raporu", pageCode: "satis-raporu" }]);
    expect(paged.components.at(-1)).toEqual({ id: "ekranDugmesi", type: "button",
      props: { slot: "actions", text: "Satış raporu", actionType: "page", pageCode: "satis-raporu" } });
    // İlk düğme ana düğmedir: sıra eklendiği gibi kalır.
    expect(paged.components.filter((c) => c.props.slot === "actions").map((c) => c.props.actionType)).toEqual(["query", "page"]);
    expect(addPageButton(withAction, "", "Rapor")).toBe(withAction);
    expect(addPageButton(withAction, "rapor", "  ")).toBe(withAction);
    expect(ensureTemplateSlots(paged)).toBe(paged);
    const second = addPageButton(paged, "stok", "Stok");
    expect(pageButtons(second).map((b) => b.id)).toEqual(["ekranDugmesi", "ekranDugmesi2"]);
    // Silme türündeki eylem sonradan eklense de en sağda kalır.
    const sil = addPageAction(second, action("temizle", { kind: "delete" }));
    expect(sil.components.filter((c) => c.props.slot === "actions").at(-1)!.id).toBe("temizleDugmesi");
    let many = fresh();
    for (let index = 0; index < MAX_PAGE_ACTIONS; index++) many = addPageButton(many, `ekran${index}`, `Ekran ${index}`);
    expect(pageButtons(many)).toHaveLength(MAX_PAGE_ACTIONS);
    expect(addPageButton(many, "fazla", "Fazla")).toBe(many);
    expect(addPageAction(many, action("yenile"))).toBe(many);
  });

  it("a screen code must be one the server accepts (custom page code or @screen key)", () => {
    for (const code of ["satis-raporu", "Rapor_2", "@satis-siparisleri", "a".repeat(40)]) expect(pageButtonCodeProblem(code), code).toBeNull();
    for (const code of ["Satış raporu", "rapor/1", "a".repeat(41), "@Satis", "@", "@a_b"]) expect(pageButtonCodeProblem(code), code).toBe(FREE_PAGE_CODE_INVALID);
    expect(pageButtonCodeProblem("  ")).toBeNull();
    expect(FREE_PAGE_CODE_INVALID).toBe("Ekran kodu harf, rakam, - ve _ içerebilir (en çok 40); sistem ekranları için @ ile başlayan küçük harfli anahtar yazın.");
    const def = fresh();
    expect(addPageButton(def, "Satış raporu", "Rapor")).toBe(def);
    expect(pageButtons(addPageButton(def, " @stok-kartlari ", "Stok"))[0].pageCode).toBe("@stok-kartlari");
  });

  it("removePageButton removes only screen-opening buttons", () => {
    const def = addPageButton(addPageAction(fresh(), action("yenile")), "rapor", "Rapor");
    const removed = removePageButton(def, "ekranDugmesi");
    expect(pageButtons(removed)).toEqual([]);
    expect(pageActionCodes(removed)).toEqual(["yenile"]);
    expect(removed.queries).toEqual(def.queries);
    expect(removePageButton(def, "yenileDugmesi")).toBe(def);
    expect(removePageButton(def, "yok")).toBe(def);
  });

  it("moveTab swaps a tab with its neighbour and keeps the blocks; at the ends nothing changes", () => {
    const first = ok(addTab(fresh(), "Satış"));
    const second = ok(addTab(first.def, "Stok"));
    const def = second.def;
    expect(freeTabs(def)!.map((tab) => tab.label)).toEqual(["Genel", "Satış", "Stok"]);
    const moved = moveTab(def, 2, -1);
    expect(freeTabs(moved)).toEqual([freeTabs(def)![0], freeTabs(def)![2], freeTabs(def)![1]]);
    assertShape(moved);
    expect(moveTab(def, 0, -1)).toBe(def);
    expect(moveTab(def, 2, 1)).toBe(def);
    expect(moveTab(def, 5, 1)).toBe(def);
    expect(moveTab(fresh(), 0, 1)).toEqual(fresh());
  });

  it("functions never mutate input", () => {
    const base = ok(addTab(ok(addItem(ok(addBlock(fresh())).def, "text", {})).def));
    const withAction = addPageAction(base.def, action("yenile"));
    const def = deepFreeze(JSON.parse(JSON.stringify(withAction)) as ModelDefinition);
    const snapshot = JSON.stringify(def);
    const itemId = def.components.find((c) => c.props.slot === "item")!.id;
    const calls = [
      () => addBlock(def, "bolum"), () => removeBlock(def, base.blockId), () => setBlockTitle(def, "bolum", "X"), () => setBlockColumns(def, "bolum", 1),
      () => moveBlock(def, "bolum", 1), () => addTab(def), () => renameTab(def, 0, "A"), () => removeTab(def, 0), () => moveBlockToTab(def, "bolum", 1),
      () => addItem(def, "image", { blockId: "bolum" }), () => moveItem(def, itemId, 1), () => moveItemToBlock(def, itemId, base.blockId),
      () => removeItem(def, itemId), () => addPageAction(def, action("baska")), () => removePageAction(def, "yenile"), () => ensureTemplateSlots(def),
      () => addPageButton(def, "rapor", "Rapor"), () => removePageButton(def, "yenileDugmesi"), () => moveTab(def, 0, 1),
    ];
    for (const call of calls) call();
    expect(JSON.stringify(def)).toBe(snapshot);
  });
});
