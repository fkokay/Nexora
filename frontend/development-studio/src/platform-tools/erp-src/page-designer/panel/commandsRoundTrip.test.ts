import { describe, expect, it } from "vitest";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import { commandsBar } from "./commandsModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { chooseRecordSource } from "./recordModel";
import { ensureTemplateSlots } from "./templateGuards";

const col = (code: string, label: string, key = false) => ({ code, label, type: "text", key, longText: false, required: key, maxLength: null });
const cari: CatalogDataSource = { code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "id", type: "text" }], opens: null,
  columns: [col("id", "Cari kodu", true), col("unvan", "Ünvan")] };
const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [] };
const raw = (id: string, kind: PageQuery["kind"], parameters: PageQuery["parameters"] = []): PageQuery => ({ id, name: id, kind, sql: `select 1 -- ${id}`, parameters, runOn: kind === "read" ? "load" : "manual" });
const button = (id: string, text: string): ModelComponent => ({ id, type: "button", name: id, props: { slot: "actions", text, actionType: "page", pageCode: "cari-kart" } });

/** Standarttan dönüştürülmüş bir çubuğun bütün ayarları (sunucunun izinli listesi). */
const fullBar = (extra: Record<string, ModelComponent["props"][string]>): ModelComponent => ({ id: "komutlar", type: "actionBar", name: "komutlar", props: {
  slot: "commands", hiddenCommands: ["print", "filter"], commandWhen: ["delete=kayit.rows[0].id != null", "saveNew=kullanici.rol == 'yonetici'"],
  newAction: "page", newPageCode: "cari-kart", newTarget: "newTab", saveSequence: ["kaydetSql", "guncelleSql"],
  sequenceWhen: ["kaydetSql=kayit.rows[0].id == null", "guncelleSql=kayit.rows[0].id != null"], stopOnError: false,
  afterSaveAction: "page", afterSavePageCode: "cari-liste", afterSaveTarget: "sameTab", afterSaveRefresh: true, saveAndNew: true,
  deleteQuery: "silSql", deleteConfirmText: "{{kayit.rows[0].unvan}} silinsin mi?", moreButtons: ["teklif", "siparis"], ...extra } });

const recordPage = (): ModelDefinition => {
  const base = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
  return { ...base, queries: [...base.queries, raw("kaydetSql", "insert"), raw("guncelleSql", "update"), raw("silSql", "delete")],
    components: [...base.components, button("teklif", "Yeni teklif"), button("siparis", "Yeni sipariş"), fullBar({ focusInput: "unvan" })] };
};
const listPage = (): ModelDefinition => ({ schemaVersion: 2, template: { name: "list" },
  queries: [raw("cariler", "read"), raw("kaydetSql", "insert"), raw("guncelleSql", "update"), raw("silSql", "delete")],
  components: [{ id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "cariler" } },
    { id: "ara", type: "input", name: "ara", props: { slot: "below", inputType: "text", label: "Ara" } },
    button("teklif", "Yeni teklif"), button("siparis", "Yeni sipariş"),
    fullBar({ commandWhen: ["delete=liste.seciliSatir != null"], openAction: "page", openPageCode: "cari-kart", openTarget: "newTab", openTable: "liste",
      openParams: ["id={{liste.seciliSatir.id}}"], exportTable: "liste", titleCount: "{{cariler.meta.totalCount}}", focusInput: "ara" })] });
const freePage = (): ModelDefinition => {
  const base = newFreeTemplateDefinition() as unknown as ModelDefinition;
  return { ...base, queries: [raw("kaydetSql", "insert"), raw("guncelleSql", "update"), raw("silSql", "delete")],
    components: [...base.components, button("teklif", "Yeni teklif"), button("siparis", "Yeni sipariş"),
      fullBar({ commandWhen: ["delete=sayfa.parametre.id != null"], sequenceWhen: ["kaydetSql=sayfa.parametre.id == null"] })] };
};

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Commands bar through the designer", { timeout: 30_000 }, () => {
  it.each([["list", listPage], ["record", recordPage], ["free", freePage]] as const)("round trip keeps the commands bar (%s)", async (_name, build) => {
    const { designerInternals, designerPersistence } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
    const def = ensureTemplateSlots(build());
    const bar = build().components.find((component) => component.type === "actionBar")!;
    // Kaydetmeden önceki güvenlik ağı çubuğu taşımaz, Serbest gövdede bölüme de koymaz.
    expect(commandsBar(def)).toEqual(bar);
    expect(def.components.some((component) => Array.isArray(component.props.members) && component.props.members.includes("komutlar"))).toBe(false);
    for (const queryEditable of [false, true]) {
      const reconciled = designerInternals.reconcileDefinition(def as unknown as Def, { catalog: { status: "ready", operations: [] }, previous: def as unknown as Def, queryEditable });
      expect(reconciled).toEqual(def);
    }
    const wired = designerPersistence.wireDefinition(def as unknown as Def, { status: "ready", operations: [] });
    const loaded = ensureTemplateSlots(designerPersistence.normalizeDefinition(JSON.parse(JSON.stringify(wired))) as unknown as ModelDefinition);
    expect(loaded).toEqual(def);
    expect(commandsBar(loaded)).toEqual(bar);
  });
});
