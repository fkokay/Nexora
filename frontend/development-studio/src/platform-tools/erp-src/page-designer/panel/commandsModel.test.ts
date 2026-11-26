import { describe, expect, it } from "vitest";
import { barCommandProblem } from "../barCommands";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import {
  addSaveStep, afterSaveChoice, COMMANDS_ID, commandShown, commandsBar, commandWhenChoice, deleteCommand, ensureCommandsBar, moreButtons, newCommand,
  openCommand, removeSaveStep, saveSteps, setAfterSave, setCommandWhen, setDeleteCommand, setDeleteConfirmText, setExportTable, setFocusInput,
  setMoreButtons, setNewCommand, setOpenCommand, setStopOnError, setTitleCount, TEMPLATE_COMMAND_ROWS, titleCountOn, toggleCommand,
} from "./commandsModel";
import { fieldTokens } from "./consultantText";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { chooseRecordSource, deleteAction, recordKey, saveActions } from "./recordModel";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key, longText: false, required: key, maxLength: null });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "text" }], opens: null,
  columns: [col("id", "Cari kodu", true), col("unvan", "Ünvan"), col("notlar", "Notlar")],
};
const action = (code: string, kind: CatalogAction["kind"], parameters: string[]): CatalogAction =>
  ({ code, label: code, kind, target: kind === "insert" ? "page" : "row", source: "sql", erpOperation: null, parameters: parameters.map((name) => ({ name, type: "text" })), confirmText: null });
const ekle = action("cariEkle", "insert", ["id", "unvan"]);
const guncelle = action("cariGuncelle", "update", ["id", "unvan"]);
const sil = action("cariSil", "delete", ["id"]);
const pasif = action("cariPasifSil", "delete", ["id"]);
const notGuncelle = action("cariNotGuncelle", "update", ["id", "notlar"]);
const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [ekle, guncelle, sil] };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
}

/** Studio'da kurulan kart: Kaydet düğmesi (ekle + güncelle) ve Sil düğmesi. */
const studioRecord = () => deepFreeze(chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog));

const raw = (id: string, kind: PageQuery["kind"]): PageQuery => ({ id, name: id, kind, sql: `-- ${id}`, parameters: [], runOn: "manual" });
/** Dönüştürülmüş kart: Kaydet ve Sil çubukta, standarttan gelen ham sorgularla. */
const convertedRecord = () => {
  const base = studioRecord();
  const buttons = new Set(base.components.filter((component) => component.type === "button").map((component) => component.id));
  const bar: ModelComponent = { id: "komutlar", type: "actionBar", props: {
    slot: "commands", saveSequence: ["kaydetSql", "guncelleSql"], sequenceWhen: ["kaydetSql=kayit.rows[0].id == null"],
    deleteQuery: "silSql", deleteConfirmText: "{{kayit.rows[0].unvan}} silinsin mi?", newAction: "clear", newInputs: ["unvan"] } };
  return deepFreeze({ ...base,
    queries: [...base.queries.filter((query) => query.kind === "read"), raw("kaydetSql", "insert"), raw("guncelleSql", "update"), raw("silSql", "delete")],
    components: [...base.components.filter((component) => !buttons.has(component.id)), bar] }) as ModelDefinition;
};
const barOf = (def: ModelDefinition) => commandsBar(def)!;

const listPage = () => deepFreeze({ ...(newListTemplateDefinition() as unknown as ModelDefinition),
  queries: [{ id: "kaynak", name: "cariler", kind: "read", dataSource: "cariListe", parameters: [], runOn: "load" } as PageQuery],
  components: [{ id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "kaynak" } }] });

describe("commands model", () => {
  it("rows follow the mockup order with keys", () => {
    expect(TEMPLATE_COMMAND_ROWS.record.map((row) => `${row.label} ${row.key}`)).toEqual(
      ["Yeni F2", "Kaydet Ctrl+S", "Kaydet ve yeni Ctrl+F2", "Sil Ctrl+Del", "Yenile F5", "Yazdır Ctrl+P"]);
    expect(TEMPLATE_COMMAND_ROWS.list.map((row) => row.id)).toEqual(["new", "open", "save", "delete", "refresh", "filter", "print", "export"]);
    expect(TEMPLATE_COMMAND_ROWS.list[1]).toEqual({ id: "open", label: "Düzenle · Görüntüle", key: "Enter" });
    expect(TEMPLATE_COMMAND_ROWS.free).toEqual(TEMPLATE_COMMAND_ROWS.list);
  });

  it("ensureCommandsBar adds one bar in the commands slot and reuses it", () => {
    const def = listPage();
    expect(commandsBar(def)).toBeNull();
    const first = ensureCommandsBar(def);
    expect(first.barId).toBe(COMMANDS_ID);
    expect(first.def.components.at(-1)).toEqual({ id: "komutlar", type: "actionBar", props: { slot: "commands" } });
    const second = ensureCommandsBar(first.def);
    expect(second.def).toBe(first.def);
    expect(second.barId).toBe("komutlar");
    const taken = deepFreeze({ ...def, components: [...def.components, { id: "komutlar", type: "text", props: { slot: "below" } }] });
    expect(ensureCommandsBar(taken).barId).toBe("komutlar2");
  });

  it("toggleCommand keeps settings of a hidden command", () => {
    const def = convertedRecord();
    const hidden = toggleCommand(def, "delete");
    expect(commandShown(hidden, "delete")).toBe(false);
    expect(barOf(hidden).props.hiddenCommands).toEqual(["delete"]);
    expect(barOf(hidden).props.deleteQuery).toBe("silSql");
    expect(barOf(hidden).props.deleteConfirmText).toBe(barOf(def).props.deleteConfirmText);
    const shown = toggleCommand(hidden, "delete");
    expect(commandShown(shown, "delete")).toBe(true);
    expect(barOf(shown).props).toEqual(barOf(def).props);
    // Kaydet ve yeni gözü `saveAndNew`'dur.
    expect(commandShown(def, "saveNew")).toBe(false);
    const saveNew = toggleCommand(def, "saveNew");
    expect(barOf(saveNew).props.saveAndNew).toBe(true);
    expect(barOf(saveNew).props.hiddenCommands).toBeUndefined();
    expect(barCommandProblem(barOf(saveNew).props)).toBeNull();
    expect(barOf(toggleCommand(saveNew, "saveNew")).props).toEqual(barOf(def).props);
    // Çubuksuz sayfada göz çubuğu kurar.
    const list = toggleCommand(listPage(), "print");
    expect(barOf(list).props).toEqual({ slot: "commands", hiddenCommands: ["print"] });
  });

  it("setCommandWhen new writes the record-key condition", () => {
    const def = studioRecord();
    expect(recordKey(def)).toBe("id");
    const isNew = setCommandWhen(def, "delete", "new");
    expect(barOf(isNew).props.commandWhen).toEqual(["delete=kayit.rows[0].id == null"]);
    expect(commandWhenChoice(isNew, "delete")).toEqual({ choice: "new", condition: "kayit.rows[0].id == null" });
    const edit = setCommandWhen(isNew, "delete", "edit");
    expect(barOf(edit).props.commandWhen).toEqual(["delete=kayit.rows[0].id != null"]);
    expect(commandWhenChoice(edit, "delete").choice).toBe("edit");
    const cond = setCommandWhen(edit, "saveNew", "cond", "kullanici.rol == 'yonetici'");
    expect(commandWhenChoice(cond, "saveNew")).toEqual({ choice: "cond", condition: "kullanici.rol == 'yonetici'" });
    const always = setCommandWhen(setCommandWhen(cond, "saveNew", "always"), "delete", "always");
    expect(barOf(always).props.commandWhen).toBeUndefined();
    expect(commandWhenChoice(always, "delete")).toEqual({ choice: "always", condition: null });
    // Kayıt sorgusu yoksa "yeni/var olan kayıtta" yazılamaz.
    const list = listPage();
    expect(setCommandWhen(list, "delete", "new")).toBe(list);
    expect(setCommandWhen(list, "delete", "always")).toBe(list);
  });

  it("saveSteps reads bar steps as raw and button steps as catalog actions", () => {
    const converted = saveSteps(convertedRecord());
    expect(converted).toEqual({ owner: "bar", stopOnError: true, steps: [
      { queryId: "kaydetSql", label: "kaydetSql", when: "kayit.rows[0].id == null", raw: true },
      { queryId: "guncelleSql", label: "guncelleSql", when: null, raw: true }] });
    const studio = saveSteps(studioRecord());
    expect(studio.owner).toBe("button");
    expect(studio.steps.map((step) => [step.label, step.when, step.raw])).toEqual([
      ["cariEkle", "kayit.rows[0].id == null", false], ["cariGuncelle", "kayit.rows[0].id != null", false]]);
    expect(saveSteps(listPage())).toEqual({ owner: null, steps: [], stopOnError: true });
    // Tek sorgulu çubuk (`saveQuery`) tek adımdır.
    const single = deepFreeze({ ...convertedRecord(), components: convertedRecord().components.map((component) => component.type === "actionBar"
      ? { ...component, props: { slot: "commands", saveQuery: "kaydetSql" } } : component) });
    expect(saveSteps(single).steps.map((step) => step.queryId)).toEqual(["kaydetSql"]);
  });

  it("removeSaveStep keeps raw steps", () => {
    const converted = convertedRecord();
    expect(removeSaveStep(converted, "kaydetSql")).toBe(converted);
    const studio = studioRecord();
    const [insert] = saveSteps(studio).steps;
    const removed = removeSaveStep(studio, insert.queryId);
    expect(saveSteps(removed).steps.map((step) => step.label)).toEqual(["cariGuncelle"]);
    expect(removed.queries.some((query) => query.id === insert.queryId)).toBe(false);
    expect(saveActions(removed)).toEqual({ insert: null, update: "cariGuncelle" });
    // Son adım da kalkınca Kaydet düğmesi kalkar.
    const empty = removeSaveStep(removed, saveSteps(removed).steps[0].queryId);
    expect(saveSteps(empty).owner).toBeNull();
    expect(empty.queries.filter((query) => query.kind !== "read" && query.kind !== "delete")).toEqual([]);
  });

  it("addSaveStep appends a catalog action step to the owner", () => {
    const studio = studioRecord();
    const added = addSaveStep(studio, notGuncelle);
    const steps = saveSteps(added).steps;
    expect(steps.map((step) => step.label)).toEqual(["cariEkle", "cariGuncelle", "cariNotGuncelle"]);
    expect(steps[2]).toMatchObject({ when: "kayit.rows[0].id != null", raw: false });
    expect(added.queries.find((query) => query.id === steps[2].queryId)).toMatchObject({ kind: "update", action: "cariNotGuncelle" });
    expect(addSaveStep(added, notGuncelle)).toBe(added);
    expect(addSaveStep(studio, sil)).toBe(studio);
    expect(commandsBar(added)).toBeNull();

    const converted = convertedRecord();
    const onBar = addSaveStep(converted, notGuncelle);
    expect(saveSteps(onBar).steps.map((step) => [step.queryId, step.raw])).toEqual([["kaydetSql", true], ["guncelleSql", true], [saveSteps(onBar).steps[2].queryId, false]]);
    expect(barOf(onBar).props.sequenceWhen).toEqual(["kaydetSql=kayit.rows[0].id == null", `${saveSteps(onBar).steps[2].queryId}=kayit.rows[0].id != null`]);
    expect(barCommandProblem(barOf(onBar).props)).toBeNull();
    // Tek sorgulu çubuk diziye çevrilir (`saveQuery` ile `saveSequence` birlikte olamaz).
    const single = deepFreeze({ ...converted, components: converted.components.map((component) => component.type === "actionBar"
      ? { ...component, props: { slot: "commands", saveQuery: "kaydetSql" } } : component) });
    const grown = barOf(addSaveStep(single, notGuncelle)).props;
    expect(grown.saveQuery).toBeUndefined();
    expect(grown.saveSequence).toEqual(["kaydetSql", "cariNotGuncelle"]);
    // Liste sayfası kaydetmez.
    const list = listPage();
    expect(addSaveStep(list, notGuncelle)).toBe(list);
  });

  it("setStopOnError writes only false", () => {
    const def = convertedRecord();
    const off = setStopOnError(def, false);
    expect(barOf(off).props.stopOnError).toBe(false);
    expect(saveSteps(off).stopOnError).toBe(false);
    expect(barOf(setStopOnError(off, true)).props).toEqual(barOf(def).props);
    expect(setStopOnError(def, true)).toBe(def);
    const button = setStopOnError(studioRecord(), false);
    expect(saveSteps(button)).toMatchObject({ owner: "button", stopOnError: false });
  });

  it("setDeleteCommand on a Studio record edits the Sil button; on a converted page edits the bar", () => {
    const studio = studioRecord();
    expect(deleteCommand(studio)).toEqual({ owner: "button", actionCode: "cariSil", confirmText: "" });
    const replaced = setDeleteCommand(studio, pasif);
    expect(deleteAction(replaced)).toBe("cariPasifSil");
    expect(commandsBar(replaced)).toBeNull();
    expect(deleteCommand(setDeleteCommand(studio, null))).toEqual({ owner: null, actionCode: null, confirmText: "" });
    expect(setDeleteCommand(studio, ekle)).toBe(studio);

    const converted = convertedRecord();
    expect(deleteCommand(converted)).toEqual({ owner: "bar", actionCode: null, confirmText: "{{kayit.rows[0].unvan}} silinsin mi?" });
    const onBar = setDeleteCommand(converted, sil);
    expect(deleteCommand(onBar)).toMatchObject({ owner: "bar", actionCode: "cariSil" });
    expect(onBar.queries.some((query) => query.id === "silSql")).toBe(false);
    expect(onBar.components.some((component) => component.type === "button")).toBe(false);
    expect(barOf(onBar).props.deleteConfirmText).toBe(barOf(converted).props.deleteConfirmText);
    const cleared = setDeleteCommand(converted, null);
    expect(barOf(cleared).props.deleteQuery).toBeUndefined();
    expect(cleared.queries.some((query) => query.id === "silSql")).toBe(false);
  });

  it("setDeleteConfirmText writes the bound text on its owner", () => {
    const tokens = fieldTokens(studioRecord(), catalog);
    const studio = setDeleteConfirmText(studioRecord(), "{Ünvan} silinsin mi?", tokens);
    const button = studio.components.find((component) => component.type === "button" && component.props.text === "Sil")!;
    expect(button.props).toMatchObject({ confirmEnabled: true, confirmText: "{{kayit.rows[0].unvan}} silinsin mi?" });
    const cleared = setDeleteConfirmText(studio, "", tokens);
    expect(cleared.components.find((component) => component.id === button.id)!.props).toMatchObject({ confirmEnabled: true });
    expect(cleared.components.find((component) => component.id === button.id)!.props.confirmText).toBeUndefined();
    const converted = setDeleteConfirmText(convertedRecord(), "{Cari kodu} silinsin mi?", tokens);
    expect(barOf(converted).props.deleteConfirmText).toBe("{{kayit.rows[0].id}} silinsin mi?");
    const list = listPage();
    expect(setDeleteConfirmText(list, "x")).toBe(list);
  });

  it("setAfterSave card removes afterSave keys", () => {
    const def = convertedRecord();
    expect(afterSaveChoice(def)).toBe("card");
    const page = setAfterSave(def, "page", { pageCode: "cari-liste", target: "newTab", refresh: true });
    expect(afterSaveChoice(page)).toBe("page");
    expect(barOf(page).props).toMatchObject({ afterSaveAction: "page", afterSavePageCode: "cari-liste", afterSaveTarget: "newTab", afterSaveRefresh: true });
    expect(barCommandProblem(barOf(page).props)).toBeNull();
    const card = setAfterSave(page, "card");
    expect(Object.keys(barOf(card).props).filter((key) => key.startsWith("afterSave"))).toEqual([]);
    expect(barOf(card).props).toEqual(barOf(def).props);
    // Eski düğme bağı da "Ekran aç" sayılır; "Kartın kuralı" onu da kaldırır.
    const legacy = deepFreeze({ ...def, components: def.components.map((component) => component.type === "actionBar"
      ? { ...component, props: { ...component.props, afterSaveButton: "git" } } : component) });
    expect(afterSaveChoice(legacy)).toBe("page");
    expect(barOf(setAfterSave(legacy, "card")).props.afterSaveButton).toBeUndefined();
  });

  it("new, open, focus, export and more write the bar", () => {
    const def = convertedRecord();
    expect(newCommand(def)).toEqual({ action: "clear", pageCode: "", target: "sameTab", inputs: ["unvan"], legacyButton: null });
    const page = setNewCommand(def, { action: "page", pageCode: "cari-kart", target: "newTab" });
    expect(newCommand(page)).toMatchObject({ action: "page", pageCode: "cari-kart", target: "newTab", inputs: ["unvan"] });
    expect(barCommandProblem(barOf(page).props)).toBeNull();
    const list = listPage();
    const open = setOpenCommand(list, { pageCode: "cari-kart", target: "sameTab", table: "liste", params: ["id={{liste.seciliSatir.id}}"] });
    expect(openCommand(open)).toEqual({ action: "page", pageCode: "cari-kart", target: "sameTab", table: "liste", params: ["id={{liste.seciliSatir.id}}"], legacyButton: null });
    expect(barCommandProblem(barOf(open).props)).toBeNull();
    const legacy = deepFreeze<ModelDefinition>({ ...list, components: [...list.components, { id: "ac", type: "button", props: { slot: "actions", text: "Aç" } },
      { id: "komutlar", type: "actionBar", props: { slot: "commands", openButton: "ac" } }] });
    expect(openCommand(legacy).legacyButton).toBe("ac");
    const moved = setOpenCommand(legacy, { pageCode: "cari-kart", table: "liste" });
    expect(barOf(moved).props.openButton).toBeUndefined();
    expect(moved.components.some((component) => component.id === "ac")).toBe(false);
    const set = setMoreButtons(setExportTable(setFocusInput(list, "ara"), "liste"), ["b1", "b2"]);
    expect(barOf(set).props).toEqual({ slot: "commands", focusInput: "ara", exportTable: "liste", moreButtons: ["b1", "b2"] });
    expect(moreButtons(set)).toEqual(["b1", "b2"]);
    expect(barOf(setMoreButtons(setExportTable(setFocusInput(set, null), null), [])).props).toEqual({ slot: "commands" });
    expect(setFocusInput(list, null)).toBe(list);
  });

  it("Kaydet ve yeni opens only with a Kaydet and a Yeni command", () => {
    const studio = studioRecord();
    expect(toggleCommand(studio, "saveNew")).toBe(studio);
    const withNew = setNewCommand(studio, { action: "clear", inputs: ["unvan"] });
    const on = toggleCommand(withNew, "saveNew");
    expect(commandShown(on, "saveNew")).toBe(true);
    // Kaydet'in son adımı kalkınca Kaydet ve yeni de kalkar.
    const [first, second] = saveSteps(on).steps;
    const noSave = removeSaveStep(removeSaveStep(on, first.queryId), second.queryId);
    expect(saveSteps(noSave).owner).toBeNull();
    expect(barOf(noSave).props.saveAndNew).toBeUndefined();
    const list = listPage();
    expect(toggleCommand(list, "saveNew")).toBe(list);
  });

  it("addSaveStep without a Kaydet builds the Kaydet button", () => {
    const studio = studioRecord();
    const [a, b] = saveSteps(studio).steps;
    const empty = removeSaveStep(removeSaveStep(studio, a.queryId), b.queryId);
    const added = addSaveStep(empty, ekle);
    const button = added.components.find((component) => component.type === "button" && component.props.actionType === "sequence")!;
    expect(Object.keys(button.props).sort()).toEqual(["actionType", "saveSequence", "sequenceWhen", "slot", "text"]);
    expect(button.props.sequenceWhen).toEqual([`${button.props.saveSequence}=kayit.rows[0].id == null`]);
    expect(saveActions(added)).toEqual({ insert: "cariEkle", update: null });
    // Kartın sırası: Kaydet ilk eylem düğmesidir.
    expect(added.components.filter((component) => component.type === "button")[0]).toBe(button);
  });

  it("setDeleteCommand on a list binds the selected row; free pages only clear", () => {
    const base = listPage();
    const list = deepFreeze<ModelDefinition>({ ...base, components: base.components.map((component) => component.type === "dataTable"
      ? { ...component, props: { ...component.props, columns: ["id", "unvan"] } } : component) });
    const set = setDeleteCommand(list, sil);
    expect(deleteCommand(set)).toEqual({ owner: "bar", actionCode: "cariSil", confirmText: "" });
    const query = set.queries.find((item) => item.id === barOf(set).props.deleteQuery)!;
    expect(query).toMatchObject({ kind: "delete", action: "cariSil", parameters: [{ name: "id", type: "text", binding: "{{liste.seciliSatir.id}}" }] });
    expect(setDeleteCommand(list, { ...sil, target: "bulk" })).toBe(list);
    expect(setDeleteCommand(list, action("x", "delete", ["vergiNo"]))).toBe(list);
    const cleared = setDeleteCommand(set, null);
    expect(barOf(cleared).props.deleteQuery).toBeUndefined();
    expect(cleared.queries).toEqual(list.queries);
    expect(setDeleteCommand(list, null)).toBe(list);

    const freeBase = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const free = deepFreeze<ModelDefinition>({ ...freeBase, queries: [raw("silSql", "delete")],
      components: [...freeBase.components, { id: "komutlar", type: "actionBar", props: { slot: "commands", deleteQuery: "silSql" } }] });
    expect(setDeleteCommand(free, sil)).toBe(free);
    const freeCleared = setDeleteCommand(free, null);
    expect(barOf(freeCleared).props).toEqual({ slot: "commands" });
    expect(freeCleared.queries).toEqual([]);
  });

  it("titleCount uses the list query total", () => {
    const list = listPage();
    expect(titleCountOn(list)).toBe(false);
    const on = setTitleCount(list, true);
    expect(barOf(on).props.titleCount).toBe("{{cariler.meta.totalCount}}");
    expect(titleCountOn(on)).toBe(true);
    expect(barOf(setTitleCount(on, false)).props).toEqual({ slot: "commands" });
    const record = studioRecord();
    expect(setTitleCount(record, true)).toBe(record);
    const free = deepFreeze(newFreeTemplateDefinition() as unknown as ModelDefinition);
    expect(setTitleCount(free, true)).toBe(free);
  });
});
