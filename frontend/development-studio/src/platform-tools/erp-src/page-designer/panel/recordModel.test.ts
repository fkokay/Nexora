import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import {
  actionMissingField, addExtraAction, addField, addLines, addNote, addSection, addTab, chooseRecordSource, deleteAction, extraActions, fieldKey,
  fieldLocks, fieldRemovalBlocked, recordPartTab, sectionRemovalBlocked, LINES_SOURCE_NEEDS_KEY, linesSourceUsable, missingRecordColumns, moveBlock, moveField, recordActionUsable,
  recordSourceUsable, recordTabs, RECORD_SOURCE_NEEDS_KEY, removeBlock, removeExtraAction, removeField, removeSection, removeTab, renameTab,
  saveActions, setDeleteAction, setFieldProps, setLinesProps, setNoteText, setSaveActions, setSectionColumns, setSectionTitle, setSectionVisibleWhen, setSummary,
  usedColumns,
} from "./recordModel";

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("unvan", "Ünvan", { required: true, maxLength: 200 }), col("kod", "Cari kodu", { key: true, required: true }),
    col("notlar", "Notlar", { longText: true }), col("vade", "Vade", { type: "int" }), col("acilis", "Açılış", { type: "date" }),
    col("aktif", "Aktif", { type: "bool" }), col("ref", "Referans", { type: "guid" })],
};
const stok: CatalogDataSource = { ...cari, code: "stokKart", parameters: [{ name: "id", type: "guid" }],
  columns: [col("id", "Kimlik", { key: true, type: "guid" }), col("ad", "Stok adı")] };
const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
const guncelle: CatalogAction = { ...ekle, code: "cariGuncelle", label: "Cari güncelle", kind: "update", target: "row",
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }, { name: "vade", type: "int" }] };
const sil: CatalogAction = { ...ekle, code: "cariSil", label: "Cari sil", kind: "delete", target: "row", parameters: [{ name: "kod", type: "text" }], confirmText: "Silinsin mi?" };
const pasif: CatalogAction = { ...ekle, code: "pasifeAl", label: "Pasife al", kind: "update", target: "row", parameters: [{ name: "kod", type: "text" }] };
const catalog = (actions: CatalogAction[] = [ekle, guncelle, sil], dataSources: CatalogDataSource[] = [cari]): ActiveCatalog =>
  ({ version: "1", dataSources, actions });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
const fresh = () => deepFreeze(newRecordTemplateDefinition() as unknown as ModelDefinition);
const built = (actions?: CatalogAction[]) => deepFreeze(chooseRecordSource(fresh(), cari, catalog(actions)));
const byId = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!;
const fieldOf = (def: ModelDefinition, column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column)!;
const section = (def: ModelDefinition, id = "genel") => byId(def, id);
const buttons = (def: ModelDefinition) => def.components.filter((component: ModelComponent) => component.type === "button" && component.props.slot === "actions");

describe("recordSourceUsable", () => {
  it("recordSourceUsable rejects source without key-named parameter", () => {
    expect(recordSourceUsable(cari)).toEqual({ usable: true });
    expect(recordSourceUsable({ ...cari, parameters: [] })).toEqual({ usable: false, reason: RECORD_SOURCE_NEEDS_KEY });
    expect(recordSourceUsable({ ...cari, parameters: [{ name: "id", type: "guid" }] })).toEqual({ usable: false, reason: RECORD_SOURCE_NEEDS_KEY });
    expect(recordSourceUsable({ ...cari, parameters: [{ name: "kod", type: "text" }, { name: "q", type: "text" }] }).usable).toBe(false);
    expect(recordSourceUsable({ ...cari, columns: cari.columns.map((column) => ({ ...column, key: false })) }).usable).toBe(false);
    expect(recordSourceUsable({ ...cari, blockedReason: "ERP işlem listesi yükleniyor…" } as CatalogDataSource))
      .toEqual({ usable: false, reason: "ERP işlem listesi yükleniyor…" });
  });
});

describe("chooseRecordSource", () => {
  it("chooseRecordSource builds Genel tab with one two-column section and key first", () => {
    const input = fresh();
    const def = chooseRecordSource(input, cari, catalog([]));
    expect(input).toEqual(newRecordTemplateDefinition());
    expect(def.queries).toEqual([{ id: "kayit", name: "kayit", kind: "read", dataSource: "cariKart", runOn: "load",
      parameters: [{ name: "kod", type: "text", binding: "{{sayfa.parametre.kod}}" }] }]);
    expect(recordTabs(def)).toEqual([{ label: "Genel", ids: ["genel"] }]);
    expect(section(def).props).toEqual({ slot: "section", title: "Genel bilgiler", columns: 2, recordKey: "{{kayit.rows[0].kod}}", trackChanges: true,
      inputs: ["kod", "unvan", "notlar", "vade", "acilis", "aktif", "ref"] });
    expect(byId(def, "ozet").props).toEqual({ slot: "summary", title: "{{kayit.rows[0].unvan}}", subtitle: "{{kayit.rows[0].kod}}" });
    expect(fieldOf(def, "vade").props).toMatchObject({ slot: "field", inputType: "number", label: "Vade", defaultValue: "{{kayit.rows[0].vade}}" });
    expect(fieldOf(def, "acilis").props.inputType).toBe("date");
    expect(fieldOf(def, "aktif").props.inputType).toBe("checkbox");
    expect(fieldOf(def, "ref").props).toMatchObject({ inputType: "text", readOnly: true });
    expect(fieldOf(def, "kod").name).toBe("kod");
    expect(def.components.every((component) => typeof component.props.slot === "string")).toBe(true);
  });

  it("chooseRecordSource maps longText to multiline and copies required and maxLength", () => {
    const def = built([]);
    expect(fieldOf(def, "notlar").props).toMatchObject({ inputType: "text", multiline: true });
    expect(fieldOf(def, "unvan").props).toMatchObject({ required: true, maxLength: 200 });
    expect(fieldOf(def, "vade").props.required).toBeUndefined();
    expect(fieldOf(def, "vade").props.maxLength).toBeUndefined();
  });

  it("typed key gets disabledWhen; system key gets readOnly and (otomatik)", () => {
    const typed = built();
    expect(fieldOf(typed, "kod").props).toMatchObject({ disabledWhen: "kayit.rows[0].kod != null", disabledReason: "Kayıt kodu değiştirilemez." });
    expect(fieldOf(typed, "kod").props.readOnly).toBeUndefined();
    const system = built([{ ...ekle, parameters: [{ name: "unvan", type: "text" }] }, guncelle]);
    expect(fieldOf(system, "kod").props).toMatchObject({ readOnly: true, placeholder: "(otomatik)" });
    expect(fieldOf(system, "kod").props.disabledWhen).toBeUndefined();
    // Kaydet'ten ekle kalkınca anahtarı artık sistem üretir.
    const after = setSaveActions(typed, null, guncelle);
    expect(fieldOf(after, "kod").props).toMatchObject({ readOnly: true, placeholder: "(otomatik)" });
    expect(fieldOf(after, "kod").props.disabledReason).toBeUndefined();
  });

  it("chooseRecordSource binds save when exactly one matching insert and update exist", () => {
    const def = built();
    const [save, remove] = buttons(def);
    expect(save.props).toMatchObject({ text: "Kaydet", actionType: "sequence", saveSequence: ["cariEkle", "cariGuncelle"],
      sequenceWhen: ["cariEkle=kayit.rows[0].kod == null", "cariGuncelle=kayit.rows[0].kod != null"] });
    expect(remove.props).toMatchObject({ text: "Sil", actionType: "query", queryId: "cariSil", confirmEnabled: true, confirmText: "Silinsin mi?" });
    expect(saveActions(def)).toEqual({ insert: "cariEkle", update: "cariGuncelle" });
    expect(deleteAction(def)).toBe("cariSil");
    // Kartta bilgisi olmayan eylem eşleşmez.
    const unmatched = built([{ ...guncelle, parameters: [...guncelle.parameters, { name: "surum", type: "int" }] }]);
    expect(buttons(unmatched)).toEqual([]);
  });

  it("chooseRecordSource leaves save empty when two insert actions match", () => {
    const def = built([ekle, { ...ekle, code: "cariEkle2" }, guncelle]);
    expect(saveActions(def)).toEqual({ insert: null, update: null });
    expect(buttons(def)).toEqual([]);
    expect(def.queries.map((query) => query.id)).toEqual(["kayit"]);
  });

  it("changing the source rebuilds fields, sections, tabs and actions", () => {
    let def = built();
    def = deepFreeze(addTab(def).def);
    def = deepFreeze(addNote(def, 0, 1, "Bilgi"));
    const next = chooseRecordSource(def, stok, catalog([]));
    expect(recordTabs(next)).toEqual([{ label: "Genel", ids: ["genel"] }]);
    expect(next.components.map((component) => component.id)).toEqual(["ozet", "sekmeler", "genel", "id", "ad"]);
    expect(next.queries.map((query) => query.id)).toEqual(["kayit"]);
    expect(next.queries[0].parameters[0].binding).toBe("{{sayfa.parametre.id}}");
    expect(chooseRecordSource(next, stok, catalog([]))).toBe(next);
  });

  it("ids avoid reserved names; required checkbox is not copied", () => {
    const odd = { ...cari, columns: [...cari.columns, col("sayfa", "Sayfa"), col("kayit", "Kayıt"), col("onay", "Onay", { type: "bool", required: true })] };
    const def = chooseRecordSource(fresh(), odd, catalog([], [odd]));
    expect(fieldOf(def, "sayfa").id).toBe("sayfa2");
    expect(fieldOf(def, "kayit").id).toBe("kayit2");
    expect(fieldOf(def, "onay").props.required).toBeUndefined();
    expect(fieldLocks(def, fieldOf(def, "onay").id, catalog([], [odd])).required).toBe(false);
  });

  it("update or delete without the key parameter is not auto-bound", () => {
    const def = built([{ ...guncelle, parameters: [{ name: "unvan", type: "text" }] }, { ...sil, parameters: [] }]);
    expect(buttons(def)).toEqual([]);
  });

  it("spills more than 12 columns into further sections of the same tab", () => {
    const wide = { ...cari, columns: [...cari.columns, ...Array.from({ length: 8 }, (_, index) => col(`ek${index}`, `Ek ${index}`))] };
    const def = chooseRecordSource(fresh(), wide, catalog([]));
    expect(recordTabs(def)).toEqual([{ label: "Genel", ids: ["genel", "bolum"] }]);
    expect((section(def).props.inputs as string[]).length).toBe(12);
    expect(section(def, "bolum").props).toMatchObject({ title: "Diğer bilgiler", inputs: ["ek5", "ek6", "ek7"] });
  });
});

describe("fields", () => {
  it("addField ignores a column already used", () => {
    const def = built();
    expect(addField(def, cari.columns[0], "genel", 0)).toBe(def);
    const removed = deepFreeze(removeField(def, fieldOf(def, "notlar").id));
    expect(usedColumns(removed).has("notlar")).toBe(false);
    const added = addField(removed, cari.columns[2], "genel", 1);
    expect((section(added).props.inputs as string[]).slice(0, 3)).toEqual(["kod", "notlar", "unvan"]);
    expect(fieldOf(added, "notlar").props.multiline).toBe(true);
  });

  it("moveField to another section keeps one owner", () => {
    const { def: withSection, sectionId } = addSection(built(), 0);
    const def = deepFreeze(withSection);
    const moved = moveField(def, "vade", sectionId, 0);
    expect(section(moved, sectionId).props.inputs).toEqual(["vade"]);
    expect(section(moved).props.inputs).not.toContain("vade");
    const owners = moved.components.filter((component) => component.type === "formCard" && (component.props.inputs as string[]).includes("vade"));
    expect(owners).toHaveLength(1);
    // Aynı bölümde sıra değişir.
    expect((section(moveField(def, "vade", "genel", 0)).props.inputs as string[])[0]).toBe("vade");
  });

  it("moving the last field leaves an empty section", () => {
    const { def: withSection, sectionId } = addSection(built(), 0);
    const one = deepFreeze(moveField(withSection, "vade", sectionId, 0));
    const back = moveField(one, "vade", "genel", 99);
    expect(section(back, sectionId).props.inputs).toEqual([]);
    expect(recordTabs(back)[0].ids).toEqual(["genel", sectionId]);
  });

  it("removeField refuses a field bound to save and gives the reason", () => {
    const def = built();
    expect(removeField(def, "unvan")).toBe(def);
    expect(fieldRemovalBlocked(def, "unvan")).toBe("Bu alan Kaydet için gerekli; önce Kaydet'ten eylemi kaldırın.");
    expect(fieldRemovalBlocked(def, "notlar")).toBeNull();
    const extra = deepFreeze(addExtraAction(built([]), { ...pasif, label: "Onayla", parameters: [{ name: "kod", type: "text" }, { name: "notlar", type: "text" }] }));
    expect(fieldRemovalBlocked(extra, "notlar")).toBe("Bu alan Onayla için gerekli; önce Onayla'dan eylemi kaldırın.");
    const deleting = deepFreeze(setDeleteAction(built([]), { ...sil, parameters: [{ name: "kod", type: "text" }, { name: "vade", type: "int" }] }));
    expect(fieldRemovalBlocked(deleting, "vade")).toBe("Bu alan Sil için gerekli; önce Sil'den eylemi kaldırın.");
  });

  it("sectionRemovalBlocked names the section's field and the action", () => {
    const def = built();
    expect(sectionRemovalBlocked(def, "genel")).toBe("Bu bölümdeki \"Cari kodu\" alanı Kaydet için gerekli; önce Kaydet'ten eylemi kaldırın.");
    const deleting = deepFreeze(setDeleteAction(built([]), { ...sil, parameters: [{ name: "kod", type: "text" }, { name: "vade", type: "int" }] }));
    expect(sectionRemovalBlocked(deleting, "genel")).toContain("alanı Sil için gerekli; önce Sil'den eylemi kaldırın.");
    const free = { ...def, components: def.components.filter((c) => c.props.slot !== "actions"), queries: def.queries.filter((q) => q.kind === "read") };
    expect(sectionRemovalBlocked(free, "genel")).toBeNull();
    expect(removeSection(def, "genel")).toBe(def);
  });

  it("recordPartTab finds the tab of a section or field", () => {
    const def = built();
    expect(recordPartTab(def, "genel")).toBe(0);
    expect(recordPartTab(def, "unvan")).toBe(0);
    expect(recordPartTab(def, "yok")).toBe(-1);
  });

  it("update and delete bind the key to the record row, insert to the key field", () => {
    const def = built();
    const query = (id: string) => def.queries.find((item) => item.id === id)!;
    expect(query("cariEkle")).toMatchObject({ kind: "insert", action: "cariEkle", runOn: "manual",
      parameters: [{ name: "kod", type: "text", binding: "{{kod.value}}" }, { name: "unvan", type: "text", binding: "{{unvan.value}}" }] });
    expect(query("cariGuncelle").parameters.map((parameter) => parameter.binding)).toEqual(["{{kayit.rows[0].kod}}", "{{unvan.value}}", "{{vade.value}}"]);
    expect(query("cariSil").parameters).toEqual([{ name: "kod", type: "text", binding: "{{kayit.rows[0].kod}}" }]);
  });

  it("setFieldProps cannot unset catalog required", () => {
    const def = built();
    const locked = setFieldProps(def, "unvan", { required: false, label: "Ad", description: "Yasal ad" }, catalog());
    expect(fieldOf(locked, "unvan").props).toMatchObject({ required: true, label: "Ad", description: "Yasal ad" });
    expect(fieldLocks(def, "unvan", catalog())).toEqual({ required: true, readOnly: false });
    expect(fieldLocks(def, "kod", catalog())).toEqual({ required: true, readOnly: true });
    // Danışman sıkılaştırabilir ve kendi koyduğu kuralı geri alabilir.
    const tight = deepFreeze(setFieldProps(def, "notlar", { required: true, readOnly: true, visibleWhen: "kayit.rows[0].kod != null" }, catalog()));
    expect(fieldOf(tight, "notlar").props).toMatchObject({ required: true, readOnly: true, visibleWhen: "kayit.rows[0].kod != null" });
    const loose = setFieldProps(tight, "notlar", { required: false, readOnly: false, visibleWhen: "" }, catalog());
    expect(fieldOf(loose, "notlar").props.required).toBeUndefined();
    expect(fieldOf(loose, "notlar").props.readOnly).toBeUndefined();
    expect(fieldOf(loose, "notlar").props.visibleWhen).toBeUndefined();
    // Anahtarın değiştirilemezliği kayıt kipinden gelir: yazılan anahtara readOnly yazılmaz.
    expect(setFieldProps(def, "kod", { readOnly: true })).toBe(def);
  });
});

describe("sections and tabs", () => {
  it("removeSection frees its columns", () => {
    const { def: withSection, sectionId } = addSection(built([]), 0);
    const def = deepFreeze(moveField(withSection, "notlar", sectionId, 0));
    const removed = removeSection(def, sectionId);
    expect(removed.components.some((component) => component.id === sectionId || component.id === "notlar")).toBe(false);
    expect(usedColumns(removed).has("notlar")).toBe(false);
    expect(recordTabs(removed)[0].ids).toEqual(["genel"]);
    // Kaydet'e bağlı alanı taşıyan bölüm silinmez.
    const bound = built();
    expect(removeSection(bound, "genel")).toBe(bound);
  });

  it("section settings", () => {
    const def = built();
    expect(section(setSectionColumns(def, "genel", 3)).props.columns).toBe(3);
    expect(section(setSectionTitle(def, "genel", "  Kimlik ")).props.title).toBe("Kimlik");
    expect(setSectionTitle(def, "genel", " ")).toBe(def);
    const shown = deepFreeze(setSectionVisibleWhen(def, "genel", "kayit.rows[0].aktif == true"));
    expect(section(shown).props.visibleWhen).toBe("kayit.rows[0].aktif == true");
    expect(section(setSectionVisibleWhen(shown, "genel", null)).props.visibleWhen).toBeUndefined();
  });

  it("last tab cannot be removed", () => {
    const def = built([]);
    expect(removeTab(def, 0)).toBe(def);
    const { def: two, tabIndex } = addTab(def);
    expect(tabIndex).toBe(1);
    expect(recordTabs(two)[1]).toEqual({ label: "Yeni sekme", ids: ["bolum"] });
    expect(byId(two, "bolum").props).toMatchObject({ title: "Yeni bölüm", columns: 2, inputs: [] });
    expect(recordTabs(addTab(deepFreeze(two)).def)[2].label).toBe("Yeni sekme 2");
    const renamed = deepFreeze(renameTab(deepFreeze(two), 1, "Ad=res, Not"));
    expect(recordTabs(renamed)[1].label).toBe("Adres Not");
    const removed = removeTab(renamed, 1);
    expect(recordTabs(removed)).toEqual([{ label: "Genel", ids: ["genel"] }]);
    expect(removed.components.some((component) => component.id === "bolum")).toBe(false);
  });

  it("tab and section limits leave the definition unchanged", () => {
    let def: ModelDefinition = built([]);
    for (let index = 0; index < 7; index++) def = addTab(def).def;
    expect(recordTabs(def)).toHaveLength(8);
    expect(addTab(deepFreeze(def))).toEqual({ def, tabIndex: -1 });
    // Bölüm en çok 12 alan alır.
    const wide = { ...cari, columns: [...cari.columns, ...Array.from({ length: 6 }, (_, index) => col(`ek${index}`, `Ek ${index}`))] };
    const full = deepFreeze(removeField(chooseRecordSource(fresh(), wide, catalog([], [wide])), "ek5"));
    expect((section(full).props.inputs as string[]).length).toBe(12);
    expect(addField(full, wide.columns[12], "genel", 0)).toBe(full);
    const { def: other, sectionId } = addSection(full, 0);
    const spare = deepFreeze(addField(other, wide.columns[12], sectionId, 0));
    expect(moveField(spare, "ek5", "genel", 0)).toBe(spare);
    // Sekme en çok 20 blok alır.
    let blocks: ModelDefinition = built([]);
    for (let index = 0; index < 19; index++) blocks = addNote(blocks, 0, 99, `Not ${index}`);
    blocks = deepFreeze(blocks);
    expect(recordTabs(blocks)[0].ids).toHaveLength(20);
    expect(addNote(blocks, 0, 0, "Bir tane daha")).toBe(blocks);
    expect(addSection(blocks, 0)).toEqual({ def: blocks, sectionId: "" });
    const { def: twoTabs } = addTab(blocks);
    expect(moveBlock(deepFreeze(twoTabs), "bolum", 0, 0)).toBe(twoTabs);
  });

  it("setNoteText writes the note and ignores empty text", () => {
    const def = deepFreeze(addNote(built([]), 0, 1, "Eski"));
    expect(byId(setNoteText(def, "aciklama", " Yeni metin "), "aciklama").props.text).toBe("Yeni metin");
    expect(setNoteText(def, "aciklama", "  ")).toBe(def);
    expect(setNoteText(def, "genel", "x")).toBe(def);
  });
});

describe("actions", () => {
  it("recordActionUsable names the missing field", () => {
    const def = built([]);
    expect(recordActionUsable(def, guncelle)).toEqual({ usable: true });
    const needsVersion = { ...guncelle, parameters: [...guncelle.parameters, { name: "surum", type: "int" }] };
    expect(recordActionUsable(def, needsVersion)).toEqual({ usable: false, reason: actionMissingField("surum") });
    expect(actionMissingField("surum")).toBe("Bu eylemin surum bilgisi kartta yok.");
    // Güncellemenin anahtarı kayıt satırından gelir; anahtar alanı kaldırılsa da kullanılabilir.
    const noKeyField = removeField(def, "kod");
    expect(recordActionUsable(noKeyField, guncelle)).toEqual({ usable: true });
    expect(recordActionUsable(noKeyField, ekle)).toEqual({ usable: false, reason: actionMissingField("kod") });
    expect(recordActionUsable(def, { ...sil, target: "bulk" }).usable).toBe(false);
    expect(setSaveActions(def, needsVersion as CatalogAction, null)).toBe(def);
  });

  it("extra actions sit between save and delete", () => {
    let def = deepFreeze(setDeleteAction(built([]), sil));
    def = deepFreeze(addExtraAction(def, pasif));
    def = deepFreeze(setSaveActions(def, ekle, guncelle));
    expect(buttons(def).map((button) => button.props.text)).toEqual(["Kaydet", "Pasife al", "Sil"]);
    expect(extraActions(def)).toEqual(["pasifeAl"]);
    expect(addExtraAction(def, pasif)).toBe(def);
    expect(addExtraAction(def, sil)).toBe(def);
    const pasifQuery = def.queries.find((query) => query.action === "pasifeAl")!;
    expect(pasifQuery.parameters[0].binding).toBe("{{kayit.rows[0].kod}}");
    const without = removeExtraAction(def, "pasifeAl");
    expect(buttons(without).map((button) => button.props.text)).toEqual(["Kaydet", "Sil"]);
    expect(without.queries.some((query) => query.action === "pasifeAl")).toBe(false);
    const noSave = setSaveActions(without, null, null);
    expect(buttons(noSave).map((button) => button.props.text)).toEqual(["Sil"]);
    expect(noSave.queries.map((query) => query.id)).toEqual(["kayit", "cariSil"]);
    expect(setDeleteAction(noSave, null).queries.map((query) => query.id)).toEqual(["kayit"]);
  });

  it("single update makes a one-step sequence", () => {
    const def = setSaveActions(built([]), null, guncelle);
    expect(buttons(def)[0].props).toMatchObject({ saveSequence: ["cariGuncelle"], sequenceWhen: ["cariGuncelle=kayit.rows[0].kod != null"] });
  });
});

describe("summary, lines and notes", () => {
  it("setSummary keeps at most three subtitle columns and values", () => {
    const def = setSummary(built([]), "unvan", ["kod", "vade", "acilis", "aktif"],
      [{ column: "vade", label: "Vade" }, { column: "aktif", label: "Vade" }, { column: "acilis", label: "Açılış" }, { column: "ref", label: "Ref" }, { column: "kod", label: "Kod" }]);
    expect(byId(def, "ozet").props).toEqual({ slot: "summary", title: "{{kayit.rows[0].unvan}}",
      subtitle: "{{kayit.rows[0].kod}} · {{kayit.rows[0].vade}} · {{kayit.rows[0].acilis}}",
      fields: ["Vade={{kayit.rows[0].vade}}", "Açılış={{kayit.rows[0].acilis}}", "Ref={{kayit.rows[0].ref}}"] });
  });

  it("setSummary writes schema-valid fieldFormats from column types", () => {
    const columns = [col("bakiye", "Bakiye", { type: "decimal" }), col("vade", "Vade", { type: "int" }), col("acilis", "Açılış", { type: "date" }), col("unvan", "Unvan")];
    const def = setSummary(built([]), "unvan", [], columns.slice(0, 4).map((c) => ({ column: c.code, label: c.label })).slice(0, 3), columns);
    expect(byId(def, "ozet").props.fieldFormats).toEqual(["Bakiye=number", "Vade=number", "Açılış=date"]);
    const text = setSummary(def, "unvan", [], [{ column: "unvan", label: "Unvan" }], columns);
    expect(byId(text, "ozet").props.fieldFormats).toBeUndefined();
    const kept = setSummary(def, "unvan", [], [{ column: "bakiye", label: "Bakiye" }]);
    expect(byId(kept, "ozet").props.fieldFormats).toEqual(["Bakiye=number"]);
  });

  it("addLines binds parameter to the page parameter and sets pageSize 10", () => {
    const hareketler: CatalogDataSource = { ...cari, code: "cariHareket", label: "Hareketler", parameters: [{ name: "kod", type: "text" }],
      columns: Array.from({ length: 8 }, (_, index) => col(`k${index}`, `Kolon ${index}`)) };
    const def = built([]);
    expect(linesSourceUsable(def, hareketler)).toEqual({ usable: true });
    expect(linesSourceUsable(def, { ...hareketler, parameters: [{ name: "id", type: "guid" }] })).toEqual({ usable: false, reason: LINES_SOURCE_NEEDS_KEY });
    const lined = deepFreeze(addLines(def, hareketler, 0, 1));
    expect(recordTabs(lined)[0].ids).toEqual(["genel", "tablo"]);
    expect(byId(lined, "tablo").props).toMatchObject({ slot: "lines", query: "cariHareket", pageSize: 10, title: "Hareketler",
      columns: ["k0", "k1", "k2", "k3", "k4", "k5"] });
    expect(lined.queries.find((query) => query.id === "cariHareket")).toEqual({ id: "cariHareket", name: "cariHareket", kind: "read",
      dataSource: "cariHareket", runOn: "load", parameters: [{ name: "kod", type: "text", binding: "{{sayfa.parametre.kod}}" }] });
    const set = deepFreeze(setLinesProps(lined, "tablo", { name: "Son hareketler", columns: ["k7", "k0"], labels: { k7: "Yedi" }, pageSize: 25, emptyText: "Hareket yok" }));
    expect(byId(set, "tablo").props).toMatchObject({ title: "Son hareketler", columns: ["k7", "k0"], columnLabels: ["k7=Yedi", "k0=Kolon 0"], pageSize: 25, emptyText: "Hareket yok" });
    const noted = deepFreeze(addNote(set, 0, 0, "Açıklama"));
    expect(recordTabs(noted)[0].ids).toEqual(["aciklama", "genel", "tablo"]);
    const two = deepFreeze(addTab(noted).def);
    const moved = deepFreeze(moveBlock(two, "tablo", 1, 0));
    expect(recordTabs(moved).map((tab) => tab.ids)).toEqual([["aciklama", "genel"], ["tablo", "bolum"]]);
    const removed = removeBlock(moved, "tablo");
    expect(removed.queries.some((query) => query.id === "cariHareket")).toBe(false);
    expect(recordTabs(removeBlock(removed, "aciklama"))[0].ids).toEqual(["genel"]);
  });

  it("missingRecordColumns lists removed columns", () => {
    const def = built([]);
    expect(missingRecordColumns(def, catalog())).toEqual([]);
    const trimmed = { ...cari, columns: cari.columns.filter((column) => column.code !== "vade" && column.code !== "notlar") };
    expect(missingRecordColumns(def, catalog([], [trimmed]))).toEqual(["notlar", "vade"]);
    expect(missingRecordColumns(def, catalog([], []))).toHaveLength(7);
  });
});
