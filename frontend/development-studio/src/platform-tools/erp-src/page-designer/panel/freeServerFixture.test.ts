/// <reference types="node" />
// Studio'nun kurduğu serbest gövde sunucunun gerçek doğrulayıcısından geçmeli (TenantCustomPageFreeStudioFixtureTests).
// Katalog, sunucunun `GET /api/custom-pages/catalog` yanıtıdır (catalog-view.json; C# testi sunucunun bunu döndürdüğünü
// denetler); tanım burada Studio modeliyle kurulur, tasarımcının kayıt dönüşümünden (wireDefinition) geçer ve kayıtlı
// fikstürle aynı olmalıdır. Yeniden üretmek: UPDATE_FREE_BODY_FIXTURE=1 npx vitest run freeServerFixture
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalog, type ActiveCatalog, type CatalogAction, type CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, NEW_FREE_BLOCK_ID } from "../pageTemplates";
import { addItem, addPageAction, addTab, renameTab, setBlockColumns, setBlockTitle } from "./freeModel";
import { chooseTableSource, setTableEmptyText, setTablePageSize } from "./freeTableModel";
import { setImageAddress, setImageDescription } from "./imagePanelModel";
import { chooseIndicatorSource } from "./indicatorPanelModel";
import type { ModelDefinition } from "./listPanelModel";
import { setHideOnMobile, setInfoBox, setTextContent, setTextStyle } from "./textPanelModel";

const fixture = (name: string) => new URL(`../../../../../../../tests/IntegrationTests/Fixtures/FreeBody/${name}`, import.meta.url);
const catalog = parseCatalog(JSON.parse(readFileSync(fixture("catalog-view.json"), "utf8"))) as ActiveCatalog;
const source = (code: string) => catalog.dataSources.find((item) => item.code === code) as CatalogDataSource;
const action = (code: string) => catalog.actions.find((item) => item.code === code) as CatalogAction;
const ok = <T extends object>(result: T | { reason: string }): T => { if ("reason" in result) throw new Error(result.reason); return result; };
/** "Ne zaman görünsün?" alanının yazdığı koşul (VisibilityField → setOptionalProp). */
const setVisibleWhen = (def: ModelDefinition, id: string, condition: string): ModelDefinition =>
  ({ ...def, components: def.components.map((c) => c.id === id ? { ...c, props: { ...c.props, visibleWhen: condition } } : c) });

/** Danışmanın panelde yaptığı adımlar: iki sekme, iki bölüm, her danışman bileşeni, okuma sorgulu Liste ve bir sayfa eylemi. */
function build(): ModelDefinition {
  const cari = source("cariListe");
  let def = newFreeTemplateDefinition() as unknown as ModelDefinition;
  def = setBlockTitle(def, NEW_FREE_BLOCK_ID, "Özet");
  def = setBlockColumns(def, NEW_FREE_BLOCK_ID, 3);
  def = setVisibleWhen(def, NEW_FREE_BLOCK_ID, "kullanici.rol == 'TenantAdmin'");
  def = setHideOnMobile(def, NEW_FREE_BLOCK_ID, true);
  const text = ok(addItem(def, "text", { blockId: NEW_FREE_BLOCK_ID }));
  def = setTextContent(setTextStyle(text.def, text.itemId, "paragraph"), text.itemId, "Bugünkü durum");
  const info = ok(addItem(def, "infoBox", { blockId: NEW_FREE_BLOCK_ID }));
  def = setInfoBox(info.def, info.itemId, { tone: "warning", title: "Dikkat", text: "Rapor her sabah yenilenir." });
  const indicator = ok(addItem(def, "indicator", { blockId: NEW_FREE_BLOCK_ID }));
  def = chooseIndicatorSource(indicator.def, indicator.itemId, cari);
  const image = ok(addItem(def, "image", { blockId: NEW_FREE_BLOCK_ID }));
  def = setImageDescription(setImageAddress(image.def, image.itemId, "https://ornek.com/logo.png"), image.itemId, "Logo");
  const tab = ok(addTab(def, "Ayrıntı"));
  def = renameTab(tab.def, 0, "Genel");
  const table = ok(addItem(def, "table", { blockId: tab.blockId }));
  def = chooseTableSource(table.def, table.itemId, cari);
  def = setTablePageSize(def, table.itemId, 25);
  def = setTableEmptyText(def, table.itemId, "Cari yok.");
  return addPageAction(def, action("raporYenile"));
}

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Free body fixture for the server validator", { timeout: 30_000 }, () => {
  it("definition.json matches what Studio builds", async () => {
    const { designerPersistence } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
    const wired = JSON.parse(JSON.stringify(designerPersistence.wireDefinition(build() as unknown as Def, { status: "ready", operations: [] })));
    if (process.env.UPDATE_FREE_BODY_FIXTURE === "1") writeFileSync(fixture("definition.json"), `${JSON.stringify(wired, null, 2)}\n`);
    expect(wired).toEqual(JSON.parse(readFileSync(fixture("definition.json"), "utf8")));
  });
});
