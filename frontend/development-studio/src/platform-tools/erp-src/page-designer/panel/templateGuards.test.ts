import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { addNote, chooseRecordSource, fieldKey, fieldRemovalBlocked, removeBlock, removeField, sectionRemovalBlocked } from "./recordModel";
import { ensureTemplateSlots, FREE_ITEM_TYPES, FREE_TEMPLATE_SLOTS, isFreeItemType, recordRemoval, templateDuplicateBlocked } from "./templateGuards";

const page = (components: ModelDefinition["components"], template = true): ModelDefinition => {
  const base = newListTemplateDefinition() as unknown as ModelDefinition;
  return template ? { ...base, components } : { schemaVersion: 2, queries: [], components };
};
const list = { id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "kaynak", rowActions: ["satirDugmesi"], rowOpenAction: "ac" } };

describe("template guards (I2, M4)", () => {
  it("gives legacy-created top-level components a valid slot and strips width", () => {
    const def = page([list,
      { id: "satirDugmesi", type: "button", props: { label: "Satır işlemi", actionType: "page" } },
      { id: "yeni", type: "button", props: { label: "Yeni", width: 4 } },
      { id: "kart", type: "card", props: { slot: "indicators", widthWhen: "6=x" }, children: [{ id: "ic", type: "text", props: { width: 6 } }] }]);
    const fixed = ensureTemplateSlots(def);
    const by = (id: string) => fixed.components.find((component) => component.id === id)!;
    expect(by("satirDugmesi").props.slot).toBe("rowActions");
    expect(by("yeni").props).toEqual({ label: "Yeni", slot: "below" });
    expect(by("kart").props).toEqual({ slot: "below" });
    expect((by("kart").children as ModelDefinition["components"])[0].props).toEqual({});
    expect(def.components[1].props.slot).toBeUndefined();
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });
  it("leaves pages without a template unchanged", () => {
    const def = page([{ id: "b", type: "button", props: { width: 4 } }], false);
    expect(ensureTemplateSlots(def)).toBe(def);
  });
  it("blocks duplicating the list, the detail panel and the open button", () => {
    const def = page([list, { id: "ac", type: "button", props: { slot: "rowActions" } }, { id: "detay", type: "contextPanel", props: { slot: "detail" } },
      { id: "not", type: "text", props: { slot: "below" } }]);
    expect(["liste", "ac", "detay", "not"].map((id) => templateDuplicateBlocked(def, id))).toEqual([true, true, true, false]);
  });

  it("ensureTemplateSlots uses record slots", () => {
    const base = newRecordTemplateDefinition() as unknown as ModelDefinition;
    const def: ModelDefinition = { ...base, components: [...base.components,
      { id: "bolum", type: "formCard", props: { slot: "section" } }, { id: "not", type: "text", props: { slot: "note" } },
      { id: "satir", type: "dataTable", props: { slot: "lines" } }, { id: "alan", type: "input", props: { slot: "field" } },
      { id: "yanlis", type: "text", props: { slot: "lines" } }, { id: "yanlis2", type: "button", props: { slot: "section" } },
      { id: "liste", type: "dataTable", props: { slot: "list" } }, { id: "yeni", type: "button", props: { width: 4 } }] };
    const fixed = ensureTemplateSlots(def);
    const slot = (id: string) => fixed.components.find((c) => c.id === id)!.props.slot;
    expect(["ozet", "sekmeler", "bolum", "not", "satir", "alan"].map(slot)).toEqual(["summary", "tabs", "section", "note", "lines", "field"]);
    expect(slot("liste")).toBe("below");
    expect(slot("yanlis")).toBe("below");
    expect(slot("yanlis2")).toBe("below");
    expect(slot("yeni")).toBe("below");
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });
});

describe("free template guards", () => {
  const free = (components: ModelDefinition["components"]): ModelDefinition => ({ ...(newFreeTemplateDefinition() as unknown as ModelDefinition), components });
  const blockC = (id: string, members: string[]) => ({ id, type: "section", props: { slot: "block", title: id, columns: 2, members } });
  const membersOf = (def: ModelDefinition, id: string) => def.components.find((c) => c.id === id)!.props.members;

  it("FREE_TEMPLATE_SLOTS", () => {
    expect([...FREE_TEMPLATE_SLOTS].sort()).toEqual(["actions", "block", "item", "tabs"]);
  });

  it("only a catalog code is a free item; inline code is not (server rule)", () => {
    expect(FREE_ITEM_TYPES.has("code")).toBe(false);
    expect(isFreeItemType({ id: "y", type: "code", props: { slot: "item", catalogComponent: "harita" } })).toBe(true);
    expect(isFreeItemType({ id: "k", type: "code", props: { slot: "item", css: ".a{}", javascript: "x()" } })).toBe(false);
    expect(isFreeItemType({ id: "b", type: "code", props: { slot: "item", catalogComponent: "" } })).toBe(false);
    expect(isFreeItemType({ id: "m", type: "metric", props: { slot: "item" } })).toBe(true);
    expect(isFreeItemType({ id: "s", type: "spacer", props: { slot: "item" } })).toBe(false);
  });

  it("puts a component without a place into the last block as an item", () => {
    const def = free([blockC("a", ["m"]), blockC("b", []), { id: "m", type: "metric", props: { slot: "item" } },
      { id: "yeni", type: "text", props: { width: 4 } }, { id: "alt", type: "section", props: { title: "Alt başlık" } },
      { id: "dugme", type: "button", props: { text: "Yenile" } }, { id: "kayip", type: "badge", props: { slot: "item" } }]);
    const fixed = ensureTemplateSlots(def);
    const slot = (id: string) => fixed.components.find((c) => c.id === id)!.props.slot;
    expect(["yeni", "alt", "kayip"].map(slot)).toEqual(["item", "item", "item"]);
    expect(slot("dugme")).toBe("actions");
    expect(fixed.components.find((c) => c.id === "yeni")!.props).toEqual({ slot: "item" });
    expect(membersOf(fixed, "a")).toEqual(["m"]);
    expect(membersOf(fixed, "b")).toEqual(["yeni", "alt", "kayip"]);
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });

  it("skips a full last block, drops dangling members and duplicate membership", () => {
    const full = Array.from({ length: 12 }, (_, index) => `f${index}`);
    const def = free([blockC("a", ["x", "silinmis"]), blockC("b", [...full]), ...full.map((id) => ({ id, type: "text", props: { slot: "item" } })),
      { id: "x", type: "text", props: { slot: "item" } }, { id: "y", type: "text", props: {} }]);
    const twice = { ...def, components: def.components.map((c) => c.id === "b" ? { ...c, props: { ...c.props, members: [...full.slice(0, 11), "x"] } } : c) };
    const fixed = ensureTemplateSlots(def);
    expect(membersOf(fixed, "a")).toEqual(["x", "y"]);
    expect(membersOf(fixed, "b")).toEqual(full);
    const fixedTwice = ensureTemplateSlots(twice);
    // x önce a'da olduğu için b'den çıkar; b'de açılan yere bölümsüz f11 girer, y yine a'ya düşer.
    expect(membersOf(fixedTwice, "a")).toEqual(["x", "y"]);
    expect(membersOf(fixedTwice, "b")).toEqual(full);
  });

  it("opens a new block when every block is full", () => {
    const full = Array.from({ length: 12 }, (_, index) => `f${index}`);
    const def = free([blockC("bolum", [...full]), ...full.map((id) => ({ id, type: "text", props: { slot: "item" } })), { id: "y", type: "image", props: {} }]);
    const fixed = ensureTemplateSlots(def);
    expect(fixed.components.at(-1)).toEqual({ id: "bolum2", type: "section", props: { slot: "block", title: "Bölüm 2", columns: 2, members: ["y"] } });
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });

  it("removes a tabs component that carries no valid tab instead of crashing", () => {
    for (const tabs of [[], ["geçersiz"], ["=a"]]) {
      const def = free([blockC("a", []), { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs } }]);
      const fixed = ensureTemplateSlots(def);
      expect(fixed.components.map((c) => c.id)).toEqual(["a"]);
      expect(ensureTemplateSlots(fixed)).toBe(fixed);
    }
  });

  it("caps block members at twelve and moves the overflow to a block with room", () => {
    const thirteen = Array.from({ length: 13 }, (_, index) => `m${index}`);
    const def = free([blockC("a", [...thirteen]), blockC("b", []), ...thirteen.map((id) => ({ id, type: "text", props: { slot: "item" } }))]);
    const fixed = ensureTemplateSlots(def);
    expect(membersOf(fixed, "a")).toEqual(thirteen.slice(0, 12));
    expect(membersOf(fixed, "b")).toEqual(["m12"]);
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });

  it("titles overflow blocks with a unique Bölüm N and stops opening blocks at twenty", () => {
    const full = Array.from({ length: 12 }, (_, index) => `f${index}`);
    const titled = { ...blockC("a", [...full]), props: { ...blockC("a", [...full]).props, title: "Bölüm 2" } };
    const fixed = ensureTemplateSlots(free([titled, ...full.map((id) => ({ id, type: "text", props: { slot: "item" } })),
      { id: "y", type: "text", props: {} }, { id: "z", type: "text", props: {} }]));
    const opened = fixed.components.filter((c) => c.type === "section" && c.id !== "a");
    expect(opened.map((c) => c.props.title)).toEqual(["Bölüm 3"]);
    expect(opened[0].props.members).toEqual(["y", "z"]);

    const blocks = Array.from({ length: 20 }, (_, b) => blockC(`b${b}`, Array.from({ length: 12 }, (_, i) => `i${b}_${i}`)));
    const items = blocks.flatMap((b) => (b.props.members as string[]).map((id) => ({ id, type: "text", props: { slot: "item" } })));
    const capped = ensureTemplateSlots(free([...blocks, ...items, { id: "fazla", type: "text", props: {} }]));
    expect(capped.components.filter((c) => c.type === "section" && c.props.slot === "block")).toHaveLength(20);
    expect(membersOf(capped, "b19")).toHaveLength(13);
    expect((membersOf(capped, "b19") as string[]).at(-1)).toBe("fazla");
  });

  it("opens an empty block when none is left", () => {
    const empty = ensureTemplateSlots(free([]));
    expect(empty.components).toEqual([{ id: "bolum", type: "section", props: { slot: "block", title: "Bölüm 1", columns: 2, members: [] } }]);
    expect(ensureTemplateSlots(empty)).toBe(empty);
    const onlyItem = ensureTemplateSlots(free([{ id: "x", type: "text", props: { slot: "item" } }]));
    expect(onlyItem.components.find((c) => c.type === "section")!.props.members).toEqual(["x"]);
  });

  it("puts a block that is in no tab into the last tab and drops unknown tab entries", () => {
    const def = free([blockC("a", []), blockC("b", []), blockC("c", []), { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: ["Genel=a,yok", "İkinci=b"] } }]);
    const fixed = ensureTemplateSlots(def);
    expect(fixed.components.find((c) => c.id === "sekmeler")!.props.tabs).toEqual(["Genel=a", "İkinci=b,c"]);
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
    const single = free([blockC("a", []), { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: ["Genel=a", "Boş=yok"] } }]);
    expect(ensureTemplateSlots(single).components.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("record card guards for the designer's generic delete and duplicate", () => {
  const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
    ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
  const cari: CatalogDataSource = { code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
    columns: [col("kod", "Cari kodu", { key: true }), col("unvan", "Unvan"), col("vade", "Vade", { type: "int" })] };
  const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
    parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
  const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [ekle] };
  const base = addNote(chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog), 0, 1, "Not");
  const def = { ...base, components: [...base.components, { id: "ek", type: "text", props: { slot: "below", text: "x" } }] };
  const field = (column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column)!.id;
  const of = (slot: string) => def.components.find((component) => component.props.slot === slot)!.id;

  it("Delete on a bound field is refused with the reason", () => {
    const result = recordRemoval(def, field("unvan"));
    expect(result).toEqual({ kind: "blocked", reason: fieldRemovalBlocked(def, field("unvan")) });
    expect((result as { reason: string }).reason).toContain("Kaydet");
  });
  it("Delete on a section bound to Kaydet is refused with section wording", () => {
    const result = recordRemoval(def, "genel");
    expect(result).toEqual({ kind: "blocked", reason: sectionRemovalBlocked(def, "genel") });
    expect((result as { reason: string }).reason).toMatch(/^Bu bölümdeki ".+" alanı Kaydet için gerekli/);
  });
  it("Delete on a free field and on a note uses the record model", () => {
    expect(recordRemoval(def, field("vade"))).toEqual({ kind: "removed", def: removeField(def, field("vade")) });
    expect(recordRemoval(def, of("note"))).toEqual({ kind: "removed", def: removeBlock(def, of("note")) });
  });
  it("Delete on a section removes its fields, or is refused while a field is bound", () => {
    // Kaydet düğmesi ve eylem sorguları kalkınca hiçbir alan eyleme bağlı değildir.
    const unbound = { ...def, components: def.components.filter((component) => component.props.slot !== "actions"), queries: def.queries.filter((query) => query.kind === "read") };
    const result = recordRemoval(unbound, "genel");
    expect(result.kind).toBe("removed");
    const after = (result as { def: ModelDefinition }).def;
    expect(after.components.some((component) => component.type === "input" && component.props.slot === "field")).toBe(false);
    expect(after.components.some((component) => component.id === "genel")).toBe(false);
    expect(recordRemoval(def, "genel").kind).toBe("blocked");
  });
  it("summary, tabs and action buttons are never deleted; extra areas use the generic path", () => {
    expect(recordRemoval(def, of("summary"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, of("tabs"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, of("actions"))).toEqual({ kind: "none" });
    expect(recordRemoval(def, "ek")).toEqual({ kind: "generic" });
    expect(recordRemoval(page([list]), "liste")).toEqual({ kind: "generic" });
  });
  it("Ctrl+D on a record part does nothing; extra areas can still be copied", () => {
    for (const id of [field("vade"), "genel", of("note"), of("summary"), of("tabs"), of("actions")]) expect(templateDuplicateBlocked(def, id), id).toBe(true);
    expect(templateDuplicateBlocked(def, "ek")).toBe(false);
  });
});
