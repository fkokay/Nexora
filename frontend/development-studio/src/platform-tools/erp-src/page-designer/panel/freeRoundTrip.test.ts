import { describe, expect, it } from "vitest";
import type { CatalogAction, CatalogDataSource } from "../catalogClient";
import { parseTabs } from "../layoutRefs";
import { freeSourceProblem, LIST_SOURCE_HINT, NEW_FREE_BLOCK_ID, newFreeTemplateDefinition } from "../pageTemplates";
import { createConsultantComponent } from "./consultantPalette";
import {
  addBlock, addItem, addPageAction, addTab, isFreeBlock, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS, MAX_PAGE_ACTIONS, moveBlock, moveBlockToTab, moveItem,
  moveItemToBlock, removeBlock, removeItem, removePageAction, removeTab, renameTab, setBlockColumns, setBlockTitle,
} from "./freeModel";
import { chooseTableSource, setTableEmptyText, setTablePageSize } from "./freeTableModel";
import { setImageAddress, setImageDescription, setImageHeight } from "./imagePanelModel";
import { chooseIndicatorSource, setIndicatorCompare, setIndicatorKind, setIndicatorPlace, setIndicatorSize, setIndicatorTotal, setIndicatorValue } from "./indicatorPanelModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { ensureTemplateSlots, FREE_ITEM_TYPES, FREE_TEMPLATE_SLOTS, freeRemoval, templateDuplicateBlocked } from "./templateGuards";
import { setHideOnMobile, setInfoBox, setTextAlign, setTextContent, setTextStyle } from "./textPanelModel";

const col = (code: string, label: string, type = "text") => ({ code, label, type, key: false, longText: false, required: false, maxLength: null });
const ozet: CatalogDataSource = { code: "ozet", label: "Satış özeti", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("ciro", "Ciro", "money"), col("gecen", "Geçen ay", "money"), col("hedef", "Hedef", "number"), col("durum", "Durum")] };
const siparisler: CatalogDataSource = { code: "siparisler", label: "Son siparişler", source: "sql", erpOperation: null, parameters: [], opens: null,
  columns: [col("no", "Sipariş no"), col("cari", "Cari"), col("tutar", "Tutar", "money")] };
const action = (code: string, label: string, kind = "update"): CatalogAction =>
  ({ code, label, kind, target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null }) as unknown as CatalogAction;
const yenile = action("yenile", "Raporu yenile");
const temizle = action("temizle", "Eskileri sil", "delete");

const ok = <T extends object>(result: T | { reason: string }): T => { if ("reason" in result) throw new Error(result.reason); return result; };

/** Sunucunun serbest gövde kurallarının (PageTemplateRules) Studio eşi; ilk ihlali döner, yoksa null. */
function serverProblem(def: ModelDefinition): string | null {
  const top = def.components;
  const blocks = top.filter(isFreeBlock);
  const items = top.filter((c) => c.props.slot === "item");
  const tabs = top.filter((c) => c.type === "tabs");
  const hasNested = (list: unknown): boolean => Array.isArray(list) && list.some((c: ModelComponent) =>
    "width" in c.props || "widthWhen" in c.props || (Array.isArray(c.children) && c.children.length > 0) || hasNested(c.children));
  if (blocks.length < 1) return "no block";
  if (blocks.length > MAX_FREE_BLOCKS) return "too many blocks";
  if (tabs.length > 1) return "two tabs";
  if (top.filter((c) => c.props.slot === "actions").length > MAX_PAGE_ACTIONS) return "too many actions";
  for (const c of top) {
    if (typeof c.props.slot !== "string" || !FREE_TEMPLATE_SLOTS.has(c.props.slot)) return `slot ${c.id}`;
    if (["actionBar", "spacer", "divider"].includes(c.type)) return `forbidden ${c.id}`;
  }
  if (hasNested(top)) return "width or children";
  for (const block of blocks) {
    const members = block.props.members as string[];
    if (!Array.isArray(members) || members.length > MAX_BLOCK_MEMBERS) return `members ${block.id}`;
    if (![1, 2, 3].includes(block.props.columns as number)) return `columns ${block.id}`;
  }
  for (const item of items) {
    if (!FREE_ITEM_TYPES.has(item.type)) return `type ${item.id}`;
    if (item.type === "card" && item.props.variant === "panel") return `panel card ${item.id}`;
    const owners = blocks.filter((block) => (block.props.members as string[]).includes(item.id));
    if (owners.length !== 1) return `membership ${item.id}`;
    if (item.type === "dataTable") {
      const query = def.queries.find((q) => q.id === item.props.query);
      if (!query || query.kind !== "read") return `table query ${item.id}`;
    }
  }
  const itemIds = new Set(items.map((item) => item.id));
  for (const block of blocks) if ((block.props.members as string[]).some((id) => !itemIds.has(id))) return `dangling member ${block.id}`;
  if (tabs.length === 1) {
    const parsed = parseTabs(tabs[0].props.tabs);
    if (parsed.length < 2) return "tab count";
    for (const tab of parsed) if (tab.ids.length === 0) return `empty tab ${tab.label}`;
    for (const block of blocks) if (parsed.filter((tab) => tab.ids.includes(block.id)).length !== 1) return `block tab ${block.id}`;
  }
  return null;
}

type Step = [string, (def: ModelDefinition) => ModelDefinition];
const ids: Record<string, string> = {};
const steps: Step[] = [
  ["add block", (d) => { const r = ok(addBlock(d, NEW_FREE_BLOCK_ID)); ids.b2 = r.blockId; return r.def; }],
  ["block title", (d) => setBlockTitle(d, ids.b2, "Özet")],
  ["block columns", (d) => setBlockColumns(d, ids.b2, 3)],
  ["add text", (d) => { const r = ok(addItem(d, "text", { blockId: NEW_FREE_BLOCK_ID })); ids.text = r.itemId; return r.def; }],
  ["add info", (d) => { const r = ok(addItem(d, "infoBox", { nearItemId: ids.text })); ids.info = r.itemId; return r.def; }],
  ["add indicator", (d) => { const r = ok(addItem(d, "indicator", { blockId: ids.b2 })); ids.ind = r.itemId; return r.def; }],
  ["add image", (d) => { const r = ok(addItem(d, "image", { blockId: ids.b2 })); ids.img = r.itemId; return r.def; }],
  ["add table", (d) => { const r = ok(addItem(d, "table", { blockId: ids.b2 })); ids.table = r.itemId; return r.def; }],
  ["table source", (d) => chooseTableSource(d, ids.table, siparisler)],
  ["table page size", (d) => setTablePageSize(d, ids.table, 50)],
  ["table empty text", (d) => setTableEmptyText(d, ids.table, "Sipariş yok")],
  ["text style", (d) => setTextStyle(d, ids.text, "subheading")],
  ["text content", (d) => setTextContent(d, ids.text, "Bugünkü durum")],
  ["text align", (d) => setTextAlign(d, ids.text, "center")],
  ["text label", (d) => setTextStyle(d, ids.text, "label")],
  ["text hide on mobile", (d) => setHideOnMobile(d, ids.text, true)],
  ["info plain", (d) => setInfoBox(d, ids.info, { tone: "plain" })],
  ["info items", (d) => setInfoBox(d, ids.info, { items: ["a", "b"], dismissible: true })],
  ["info warning", (d) => setInfoBox(d, ids.info, { tone: "warning", title: "Dikkat" })],
  ["indicator source", (d) => chooseIndicatorSource(d, ids.ind, ozet)],
  ["indicator value", (d) => setIndicatorValue(d, ids.ind, "ciro", "money")],
  ["indicator compare", (d) => setIndicatorCompare(d, ids.ind, "gecen")],
  ["indicator size", (d) => setIndicatorSize(d, ids.ind, "lg")],
  ["indicator progress", (d) => setIndicatorKind(d, ids.ind, "progress")],
  ["progress total", (d) => setIndicatorTotal(d, ids.ind, "hedef")],
  ["indicator status", (d) => setIndicatorKind(d, ids.ind, "status")],
  ["status value", (d) => setIndicatorValue(d, ids.ind, "durum")],
  ["indicator number", (d) => setIndicatorKind(d, ids.ind, "number")],
  ["image address", (d) => setImageAddress(d, ids.img, "https://ornek.com/logo.png")],
  ["image height", (d) => setImageHeight(d, ids.img, "large")],
  ["image description", (d) => setImageDescription(d, ids.img, "Logo")],
  ["move item down", (d) => moveItem(d, ids.text, 1)],
  ["move item to block", (d) => ok(moveItemToBlock(d, ids.text, ids.b2)).def],
  ["move block", (d) => moveBlock(d, ids.b2, -1)],
  ["add tab", (d) => { const r = ok(addTab(d, "Ayrıntı")); ids.b3 = r.blockId; return r.def; }],
  ["rename tab", (d) => renameTab(d, 1, "Detay")],
  ["block to tab", (d) => moveBlockToTab(d, ids.b2, 1)],
  ["second tab", (d) => ok(addTab(d)).def],
  ["remove tab", (d) => removeTab(d, 2)],
  ["page action", (d) => addPageAction(d, yenile)],
  ["delete action", (d) => addPageAction(d, temizle)],
  ["remove action", (d) => removePageAction(d, "yenile")],
  ["remove item", (d) => removeItem(d, ids.img)],
  ["remove empty block", (d) => ok(removeBlock(d, ids.b3)).def],
  ["remove tab to none", (d) => removeTab(d, 0)],
];

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Free template output through the designer", { timeout: 30_000 }, () => {
  it("round trip: every free setter then ensureTemplateSlots and reconcileDefinition keeps the definition server-valid", async () => {
    const { designerInternals } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerInternals.reconcileDefinition>[0];
    let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
    expect(ensureTemplateSlots(def)).toBe(def);
    for (const [label, step] of steps) {
      const next = step(def);
      expect(next, label).not.toBe(def);
      def = next;
      expect(ensureTemplateSlots(def), label).toBe(def);
      // Kaynaksız Liste sunucuda geçersizdir; kayıt `freeSourceProblem` ipucuyla durur, sunucuya gitmez.
      if (label === "add table") {
        expect(freeSourceProblem(def), label).toBe(LIST_SOURCE_HINT);
        expect(serverProblem(def), label).toBe(`table query ${ids.table}`);
      } else {
        expect(freeSourceProblem(def), label).toBeNull();
        expect(serverProblem(def), label).toBeNull();
      }
      for (const queryEditable of [false, true]) {
        const reconciled = designerInternals.reconcileDefinition(def as unknown as Def, { catalog: { status: "ready", operations: [] }, previous: def as unknown as Def, queryEditable });
        expect(reconciled, `${label} queryEditable=${queryEditable}`).toEqual(def);
      }
    }
    expect(def.components.some((c) => c.type === "tabs")).toBe(false);
    expect(designerInternals.managedKeys.has("members")).toBe(true);
  });

  it("round trip: 5a panel setters on a free item never write an above, below or indicators slot", () => {
    let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const metric = ok(addItem(def, "indicator", {})); def = metric.def;
    const image = ok(addItem(def, "image", {})); def = image.def;
    const text = ok(addItem(def, "text", {})); def = text.def;
    const all: Step[] = [
      ["source", (d) => chooseIndicatorSource(d, metric.itemId, ozet)],
      ["progress", (d) => setIndicatorKind(d, metric.itemId, "progress")],
      ["status", (d) => setIndicatorKind(d, metric.itemId, "status")],
      ["number", (d) => setIndicatorKind(d, metric.itemId, "number")],
      ["place below", (d) => setIndicatorPlace(d, metric.itemId, "below")],
      ["place indicators", (d) => setIndicatorPlace(d, metric.itemId, "indicators")],
      ["image address", (d) => setImageAddress(d, image.itemId, "https://ornek.com/a.png")],
      ["text style", (d) => setTextStyle(d, text.itemId, "heading")],
      ["text label", (d) => setTextStyle(d, text.itemId, "label")],
    ];
    for (const [label, step] of all) {
      def = step(def);
      for (const id of [metric.itemId, image.itemId, text.itemId])
        expect(def.components.find((c) => c.id === id)!.props.slot, `${label} ${id}`).toBe("item");
      expect(serverProblem(def), label).toBeNull();
    }
  });
});

describe("free designer delete and duplicate", () => {
  const start = () => {
    let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const item = ok(addItem(def, "text", {})); def = item.def;
    const second = ok(addBlock(def)); def = second.def;
    def = addPageAction(def, yenile);
    return { def, item: item.itemId, block: second.blockId };
  };

  it("Delete on an item removes it from its block", () => {
    const { def, item } = start();
    const result = freeRemoval(def, item);
    expect(result.kind).toBe("removed");
    if (result.kind !== "removed") return;
    expect(result.def.components.some((c) => c.id === item)).toBe(false);
    expect(serverProblem(result.def)).toBeNull();
  });

  it("Delete on a block uses the block rule with its reason", () => {
    const { def, block } = start();
    expect(freeRemoval(def, NEW_FREE_BLOCK_ID)).toEqual({ kind: "blocked", reason: "Önce bu bölümdeki bileşenleri kaldırın ya da başka bölüme taşıyın." });
    const removed = freeRemoval(def, block);
    expect(removed.kind).toBe("removed");
    const single = newFreeTemplateDefinition() as unknown as ModelDefinition;
    expect(freeRemoval(single, NEW_FREE_BLOCK_ID)).toEqual({ kind: "blocked", reason: "Serbest gövdede en az bir bölüm olmalı." });
  });

  it("Delete on a page action removes the action and its query; tabs are not deleted", () => {
    const { def } = start();
    const button = def.components.find((c) => c.props.slot === "actions")!;
    const result = freeRemoval(def, button.id);
    expect(result.kind).toBe("removed");
    if (result.kind === "removed") {
      expect(result.def.components.some((c) => c.props.slot === "actions")).toBe(false);
      expect(result.def.queries).toHaveLength(0);
    }
    const tabbed = ok(addTab(def)).def;
    expect(freeRemoval(tabbed, tabbed.components.find((c) => c.type === "tabs")!.id).kind).toBe("none");
  });

  it("other templates keep the generic path; free page components are never duplicated", () => {
    const { def, item, block } = start();
    for (const id of [item, block, NEW_FREE_BLOCK_ID, def.components.find((c) => c.props.slot === "actions")!.id])
      expect(templateDuplicateBlocked(def, id), id).toBe(true);
    const legacy: ModelDefinition = { schemaVersion: 2, queries: [], components: [createConsultantComponent("text", "m")] };
    expect(freeRemoval(legacy, "m").kind).toBe("generic");
    expect(templateDuplicateBlocked(legacy, "m")).toBe(false);
  });
});
