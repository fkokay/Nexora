import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { addNote, chooseRecordSource, fieldKey, fieldRemovalBlocked, removeBlock, removeField, sectionRemovalBlocked } from "./recordModel";
import { BELGE_TEMPLATE_SLOTS, ensureTemplateSlots, FREE_ITEM_TYPES, FREE_TEMPLATE_SLOTS, RECORD_TEMPLATE_SLOTS, TEMPLATE_SLOTS, dialogRemoval, isFreeItemType, recordRemoval, recordSelectionOf, templateDuplicateBlocked } from "./templateGuards";

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
    expect([...FREE_TEMPLATE_SLOTS].sort()).toEqual(["actions", "block", "dialog", "dialogs", "item", "tabs"]);
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

describe("commands slot (5b-2a)", () => {
  const bar = { id: "komutlar", type: "actionBar", props: { slot: "commands", hiddenCommands: ["print"], deleteQuery: "sil" } };
  const templates = { list: newListTemplateDefinition, record: newRecordTemplateDefinition, free: newFreeTemplateDefinition };

  it.each(Object.keys(templates) as (keyof typeof templates)[])("keeps the commands bar in place (%s)", (name) => {
    const base = templates[name]() as unknown as ModelDefinition;
    const def: ModelDefinition = { ...base, components: [...base.components, bar] };
    const fixed = ensureTemplateSlots(def);
    expect(fixed.components.find((c) => c.id === "komutlar")).toEqual(bar);
    // Serbest gövdede çubuk bir bölümün üyesi olmaz.
    expect(fixed.components.some((c) => Array.isArray(c.props.members) && c.props.members.includes("komutlar"))).toBe(false);
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });

  it.each(Object.keys(templates) as (keyof typeof templates)[])("gives a slotless first action bar the commands slot (%s)", (name) => {
    const base = templates[name]() as unknown as ModelDefinition;
    const def: ModelDefinition = { ...base, components: [...base.components, { id: "cubuk", type: "actionBar", props: { hiddenCommands: ["print"] } },
      { id: "ikinci", type: "actionBar", props: { slot: "list" } }] };
    const fixed = ensureTemplateSlots(def);
    expect(fixed.components.find((c) => c.id === "cubuk")!.props).toEqual({ hiddenCommands: ["print"], slot: "commands" });
    // İkinci çubuk "commands" yerine konmaz (sunucu reddeder; yer tablosu dışı kalır).
    expect(fixed.components.find((c) => c.id === "ikinci")!.props.slot).not.toBe("commands");
    // Serbest gövdede öğe olamayan tip her geçişte yeniden yerleştirilir (bugünkü davranış); çubuk yine yerinde kalır.
    if (name !== "free") expect(ensureTemplateSlots(fixed)).toBe(fixed);
    else expect(ensureTemplateSlots(fixed).components.find((c) => c.id === "cubuk")!.props.slot).toBe("commands");
  });

  it("does not take a non-bar component into the commands slot", () => {
    const def = page([list, { id: "yazi", type: "text", props: { slot: "commands" } }]);
    expect(ensureTemplateSlots(def).components.find((c) => c.id === "yazi")!.props.slot).toBe("below");
  });
});

describe("dialogs and groups (5b-2 adım 2)", () => {
  const c = (id: string, type: string, props: ModelDefinition["components"][number]["props"] = {}, children?: ModelDefinition["components"]) =>
    ({ id, type, name: id, props, ...(children ? { children } : {}) });
  const parts = () => [
    c("pencere", "dialog", { slot: "dialogs", presentation: "dialog", size: "xl", title: "Sipariş", contains: ["pOzet", "durum", "pSekmeler"] }),
    c("pOzet", "recordHeader", { slot: "dialog" }),
    c("durum", "section", { slot: "dialog", visibleWhen: "x == 1" }, [c("rozet", "badge", { text: "Taslak", width: 6 }), c("dugme", "button", { text: "Yenile" })]),
    c("pSekmeler", "tabs", { slot: "dialog", tabs: ["Bilgiler=teslim"] }),
    c("teslim", "section", { slot: "dialog" }, [c("form", "formCard", { inputs: ["tarih"] })]),
    c("tarih", "input", { slot: "dialog", inputType: "date" }),
  ];
  const byId = (def: ModelDefinition, id: string) => def.components.find((item) => item.id === id)!;
  const templates = [
    ["list", () => ({ ...(newListTemplateDefinition() as unknown as ModelDefinition) })],
    ["record", () => newRecordTemplateDefinition() as unknown as ModelDefinition],
    ["free", () => newFreeTemplateDefinition() as unknown as ModelDefinition],
  ] as const;

  it.each(templates)("leaves dialogs, dialog contents and group children in place (%s)", (_name, base) => {
    const start = base();
    const def: ModelDefinition = { ...start, components: [...start.components, ...parts()] };
    const fixed = ensureTemplateSlots(def);
    for (const id of ["pencere", "pOzet", "durum", "pSekmeler", "teslim", "tarih"]) expect(byId(fixed, id).props.slot).toBe(byId(def, id).props.slot);
    // Grup çocukları taşınmaz; yalnız genişlik atılır.
    expect(byId(fixed, "durum").children).toEqual([c("rozet", "badge", { text: "Taslak" }), c("dugme", "button", { text: "Yenile" })]);
    expect(byId(fixed, "durum").props.visibleWhen).toBe("x == 1");
    // Pencere içeriği Serbest gövdede bir bölüme girmez.
    expect(fixed.components.some((item) => Array.isArray(item.props.members) && item.props.members.some((id) => ["pOzet", "durum", "tarih"].includes(id)))).toBe(false);
    expect(ensureTemplateSlots(fixed)).toBe(fixed);
  });

  it.each(templates)("puts a slotless dialog into dialogs and its contents into dialog (%s)", (_name, base) => {
    const start = base();
    const def: ModelDefinition = { ...start, components: [...start.components,
      c("pencere", "dialog", { presentation: "dialog", contains: ["metin"] }), c("metin", "text", { text: "İçerik" }), c("serbest", "text", { slot: "dialog", text: "Sahipsiz" })] };
    const fixed = ensureTemplateSlots(def);
    expect(byId(fixed, "pencere").props.slot).toBe("dialogs");
    expect(byId(fixed, "metin").props.slot).toBe("dialog");
    // Hiçbir pencereye ait olmayan `dialog` yerindeki bileşen kalıbın ek yerine düşer.
    expect(byId(fixed, "serbest").props.slot).toBe(_name === "free" ? "item" : "below");
  });

  it("a list detail card group stays in detail", () => {
    const def = page([list, c("detayKart", "card", { slot: "detail", title: "Seçili" }, [c("kod", "text", { text: "{{liste.seciliSatir.code}}" })])]);
    expect(ensureTemplateSlots(def)).toBe(def);
  });

  it("belge has no dialogs slot", () => {
    expect(BELGE_TEMPLATE_SLOTS.has("dialogs")).toBe(false);
    expect([...TEMPLATE_SLOTS].filter((slot) => slot.startsWith("dialog")).sort()).toEqual(["dialog", "dialogs"]);
    expect([...RECORD_TEMPLATE_SLOTS].filter((slot) => slot.startsWith("dialog")).sort()).toEqual(["dialog", "dialogs"]);
  });

describe("generic delete and duplicate on window parts (5b-2 adım 2)", () => {
  const c = (id: string, type: string, props: ModelDefinition["components"][number]["props"] = {}) => ({ id, type, name: id, props });
  const withDialogs = (base: ModelDefinition, opener: boolean): ModelDefinition => ({ ...base, components: [...base.components,
    c("pencere", "dialog", { slot: "dialogs", presentation: "dialog", title: "P", contains: ["pMetin"] }), c("pMetin", "text", { slot: "dialog", text: "x" }),
    ...(opener ? [c("pAc", "button", { slot: (base.template as { name: string } | undefined)?.name === "free" ? "actions" : "below", text: "Aç", actionType: "openDialog", dialogId: "pencere" })] : [])] });

  it("record card: window parts are not card parts (generic delete / duplicate)", () => {
    const def = withDialogs(newRecordTemplateDefinition() as unknown as ModelDefinition, false);
    expect(recordSelectionOf(def, "pMetin")).toBeNull();
    expect(recordSelectionOf(def, "pencere")).toBeNull();
    expect(recordRemoval(def, "pMetin")).toEqual({ kind: "generic" });
  });

  it.each([["list", newListTemplateDefinition], ["record", newRecordTemplateDefinition]] as const)(
    "Ctrl+D on a window or its content does nothing (%s): the copy would claim the content twice or be left unowned", (_name, base) => {
      const def = withDialogs(base() as unknown as ModelDefinition, false);
      expect(templateDuplicateBlocked(def, "pencere")).toBe(true);
      expect(templateDuplicateBlocked(def, "pMetin")).toBe(true);
      expect(templateDuplicateBlocked({ ...def, components: [...def.components, c("ek", "text", { slot: "below", text: "y" })] }, "ek")).toBe(false);
    });

  const formWindow = (base: ModelDefinition): ModelDefinition => ({ ...base, components: [...base.components,
    c("pencere", "dialog", { slot: "dialogs", presentation: "dialog", title: "P", contains: ["form", "pSekmeler", "grup"] }),
    c("form", "formCard", { slot: "dialog", inputs: ["g1", "ortak"] }),
    c("pSekmeler", "tabs", { slot: "dialog", tabs: ["Bir=hedef", "İki=hedefGrup"] }),
    c("hedef", "text", { slot: "dialog", text: "t" }),
    { ...c("hedefGrup", "section", { slot: "dialog" }), children: [c("icForm", "formCard", { inputs: ["g2"] })] },
    { ...c("grup", "card", { slot: "dialog" }), children: [c("grupForm", "formCard", { inputs: ["g3", "ortak"] })] },
    c("g1", "input", { slot: "dialog" }), c("g2", "input", { slot: "dialog" }), c("g3", "input", { slot: "dialog" }), c("ortak", "input", { slot: "dialog" })] });
  const idsOf = (removal: ReturnType<typeof dialogRemoval>) => (removal as { def: ModelDefinition }).def.components.map((item) => item.id);

  it.each([["list", newListTemplateDefinition], ["record", newRecordTemplateDefinition], ["free", newFreeTemplateDefinition]] as const)(
    "Delete on a window form card or tabs also removes the content only it owned, so nothing is left unowned (%s)", (_name, base) => {
      const def = formWindow(base() as unknown as ModelDefinition);
      const baseIds = (base() as unknown as ModelDefinition).components.map((item) => item.id);
      // Form kartı: kendi girişi gider, öteki formun da listelediği giriş kalır.
      const form = dialogRemoval(def, "form");
      expect(form.kind).toBe("removed");
      expect(idsOf(form)).toEqual([...baseIds, "pencere", "pSekmeler", "hedef", "hedefGrup", "grup", "g2", "g3", "ortak"]);
      // Sekmeler: işaret ettikleri ve hedef grubun formunun girişi gider.
      expect(idsOf(dialogRemoval(def, "pSekmeler"))).toEqual([...baseIds, "pencere", "form", "grup", "g1", "g3", "ortak"]);
      // Grubun içindeki form kartı (iç içe bileşen): girişi gider, grup kalır.
      const child = dialogRemoval(def, "grupForm");
      expect(idsOf(child)).toEqual([...baseIds, "pencere", "form", "pSekmeler", "hedef", "hedefGrup", "grup", "g1", "g2", "ortak"]);
      expect((child as { def: ModelDefinition }).def.components.find((item) => item.id === "grup")!.children).toEqual([]);
      // Bir şey sahipsiz kalmıyorsa genel yol.
      expect(dialogRemoval(def, "hedef")).toEqual({ kind: "generic" });
      expect(dialogRemoval(def, "g1")).toEqual({ kind: "generic" });
    });

  it.each([["list", newListTemplateDefinition], ["record", newRecordTemplateDefinition], ["free", newFreeTemplateDefinition]] as const)(
    "a window a button opens is not deleted; one without openers goes with its own content (%s)", (_name, base) => {
      const opened = withDialogs(base() as unknown as ModelDefinition, true);
      expect(dialogRemoval(opened, "pencere")).toEqual({ kind: "none" });
      const free = withDialogs(base() as unknown as ModelDefinition, false);
      const removed = dialogRemoval(free, "pencere");
      expect(removed.kind).toBe("removed");
      expect((removed as { def: ModelDefinition }).def.components.map((item) => item.id)).toEqual((base() as unknown as ModelDefinition).components.map((item) => item.id));
      expect(dialogRemoval(free, "pMetin")).toEqual({ kind: "generic" });
    });
  it("pages without a template use the generic path", () => {
    const def = page([c("pencere", "dialog", { contains: [] })], false);
    expect(dialogRemoval(def, "pencere")).toEqual({ kind: "generic" });
  });
});
});
