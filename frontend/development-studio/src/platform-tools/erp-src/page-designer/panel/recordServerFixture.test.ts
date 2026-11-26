/// <reference types="node" />
// Studio'nun kurduğu Kayıt kartı sunucunun gerçek doğrulayıcısından geçmeli (TenantCustomPageRecordStudioFixtureTests).
// Katalog, sunucunun `GET /api/custom-pages/catalog` yanıtıdır (catalog-view.json; C# testi sunucunun bunu döndürdüğünü
// denetler); tanımlar burada Studio modeliyle kurulur, tasarımcının kayıt dönüşümünden (wireDefinition) geçer ve kayıtlı
// fikstürlerle aynı olmalıdır. Yeniden üretmek: UPDATE_RECORD_CARD_FIXTURE=1 npx vitest run recordServerFixture
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, type ActiveCatalog, type CatalogAction, type CatalogDataSource } from "../catalogClient";
import { newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import {
  addExtraAction, addLines, addNote, addTab, chooseRecordSource, recordTabs, setFieldProps, setLinesProps, setSaveActions, setSummary,
} from "./recordModel";

const fixture = (name: string) => new URL(`../../../../../../../tests/IntegrationTests/Fixtures/RecordCard/${name}`, import.meta.url);
const catalog = parseCatalog(JSON.parse(readFileSync(fixture("catalog-view.json"), "utf8"))) as ActiveCatalog;
const source = (code: string) => catalog.dataSources.find((item) => item.code === code) as CatalogDataSource;
const action = (code: string) => catalog.actions.find((item) => item.code === code) as CatalogAction;

/** Danışmanın panelde yaptığı adımlar; `insert` Kaydet'in yeni kayıt eylemidir (anahtarı kullanıcı mı yazar, sistem mi üretir). */
function build(insert: string): ModelDefinition {
  const kart = source("cariKart");
  let def = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, kart, catalog);
  // Katalogda iki *ekle* eylemi var: Kaydet kendiliğinden bağlanmaz, danışman seçer.
  def = setSaveActions(def, action(insert), action("cariGuncelle"));
  def = setSummary(def, "unvan", ["kod", "sehir"], [{ column: "bakiye", label: "Bakiye" }, { column: "acilis", label: "Açılış" }], kart.columns);
  def = setFieldProps(def, "unvan", { description: "Faturada görünen resmî ünvan." }, catalog);
  def = addTab(def).def;
  def = addLines(def, source("cariHareket"), 1, 0);
  const table = recordTabs(def)[1].ids[0];
  def = setLinesProps(def, table, { pageSize: 25, labels: { tutar: "Tutar (TL)" }, emptyText: "Bu carinin hareketi yok." });
  def = addNote(def, 1, 1, "Hareketler muhasebeden gelir; burada değiştirilemez.");
  return addExtraAction(def, action("pasifeAl"));
}

const variants = [["definition-typed-key.json", "cariEkle"], ["definition-system-key.json", "cariEkleOtomatik"]] as const;

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Record card fixture for the server validator", { timeout: 30_000 }, () => {
  it.each(variants)("%s matches what Studio builds", async (name, insert) => {
    const { designerPersistence } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
    const wired = JSON.parse(JSON.stringify(designerPersistence.wireDefinition(build(insert) as unknown as Def, { status: "ready", operations: [] })));
    if (process.env.UPDATE_RECORD_CARD_FIXTURE === "1") writeFileSync(fixture(name), `${JSON.stringify(wired, null, 2)}\n`);
    expect(wired).toEqual(JSON.parse(readFileSync(fixture(name), "utf8")));
  });
});
