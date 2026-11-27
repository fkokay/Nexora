/// <reference types="node" />
// Kalıplı sayfadaki pencere ve grup Studio modelinden (yükle → güvenlik ağı → uzlaştır → kaydet) değişmeden geçmeli.
// Gömülü kalıplı `sales-orders` standardı (src/Hosts/AIERP.Api/SystemPages/Standards).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newListTemplateDefinition } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import { dialogOwners } from "./dialogsModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { ensureTemplateSlots } from "./templateGuards";

const fixture = new URL("../../../../../../../src/Hosts/AIERP.Api/SystemPages/Standards/sales-orders.json", import.meta.url);
// Sunucunun `sales-orders` için verdiği ERP işlem kataloğu (erp-web sistem sayfası fikstürü): sayfalı liste yalnız işlemi sayfalamayı
// destekliyorsa korunur; boş ama hazır bir katalog "işlem yok" demektir ve uzlaştırma sayfalamayı haklı olarak siler.
const operationsFixture = new URL("../../../../../../erp-web/src/system-pages/salesOrdersOperations.fixture.json", import.meta.url);
type ErpCatalog = Parameters<Awaited<typeof import("../../CustomPagesPage")>["designerPersistence"]["wireDefinition"]>[1];
const salesOrdersCatalog = (): ErpCatalog => ({ status: "ready", operations: (JSON.parse(readFileSync(operationsFixture, "utf8")) as { operations: unknown[] }).operations } as ErpCatalog);
const c = (id: string, type: string, props: ModelComponent["props"] = {}, children?: ModelComponent[]): ModelComponent =>
  ({ id, type, name: id, props, ...(children ? { children } : {}) });
const read = (id: string, name = id): PageQuery => ({ id, name, kind: "read", sql: `select 1 -- ${id}`, parameters: [], runOn: "load" });
const write = (id: string): PageQuery => ({ id, name: id, kind: "update", sql: `update x -- ${id}`, parameters: [], runOn: "manual" });

/** `sales-orders` biçiminde elle kurulmuş kalıplı Liste: pencere, sekmeden işaret edilen bölüm, grup çocukları, satır açma ve `openParam`. */
const salesOrdersLike = (): ModelDefinition => ({ ...(newListTemplateDefinition() as unknown as ModelDefinition),
  queries: [read("siparisler"), read("siparis"), read("kalemler"), write("teslimTarihiKaydet")],
  components: [
    c("liste", "dataTable", { slot: "list", query: "siparisler", rowActions: ["acDugmesi"], rowOpenAction: "acDugmesi", openParam: "orderId" }),
    c("acDugmesi", "button", { slot: "rowActions", text: "Aç", actionType: "openDialog", dialogId: "siparisPenceresi" }),
    c("siparisPenceresi", "dialog", { slot: "dialogs", presentation: "dialog", size: "xl", title: "Satış siparişi · {{siparis.rows[0].code}}",
      contains: ["siparisBasligi", "siparisDurumu", "siparisSekmeleri"] }),
    c("siparisBasligi", "recordHeader", { slot: "dialog", title: "{{siparis.rows[0].code}}" }),
    c("siparisDurumu", "section", { slot: "dialog" }, [c("rozetTaslak", "badge", { text: "Taslak", visibleWhen: "siparis.rows[0].status == 'Draft'" }),
      c("belgeZinciri", "text", { text: "Zincir" })]),
    c("siparisSekmeleri", "tabs", { slot: "dialog", tabs: ["Sipariş Bilgileri=kalemTablosu,teslimBolumu"] }),
    c("kalemTablosu", "dataTable", { slot: "dialog", query: "kalemler" }),
    c("teslimBolumu", "section", { slot: "dialog", title: "Teslim tarihi", visibleWhen: "siparis.rows[0].status == 'Draft'" },
      [c("teslimFormu", "formCard", { layout: "inline", inputs: ["teslimTarihi"] }),
        c("teslimKaydet", "button", { text: "Teslim tarihini kaydet", actionType: "query", queryId: "teslimTarihiKaydet", refreshQueries: ["siparis"] })]),
    c("teslimTarihi", "input", { slot: "dialog", inputType: "date", label: "İstenen teslim tarihi" }),
  ] });

async function roundTrip(def: ModelDefinition, catalog: ErpCatalog = { status: "ready", operations: [] }) {
  const { designerInternals, designerPersistence } = await import("../../CustomPagesPage");
  type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
  const loaded = ensureTemplateSlots(designerPersistence.normalizeDefinition(JSON.parse(JSON.stringify(def))) as unknown as ModelDefinition);
  const reconciled = designerInternals.reconcileDefinition(loaded as unknown as Def, { catalog, previous: loaded as unknown as Def, queryEditable: true });
  return JSON.parse(JSON.stringify(designerPersistence.wireDefinition(reconciled, catalog)));
}

// Tasarımcı modülü büyük: soğuk dinamik içe aktarma yüklü makinede 5 sn sınırını aşabilir.
describe("Dialogs and groups through the designer", { timeout: 30_000 }, () => {
  it("a sales-orders-like list page comes back unchanged", async () => {
    const def = salesOrdersLike();
    expect(dialogOwners(def.components).get("teslimTarihi")).toBe("siparisPenceresi");
    expect(await roundTrip(def)).toEqual(JSON.parse(JSON.stringify(def)));
  });

  it("the templated sales-orders standard comes back unchanged", async () => {
    const raw = JSON.parse(readFileSync(fixture, "utf8")) as { definition?: ModelDefinition } & ModelDefinition;
    const def = raw.definition ?? raw;
    expect(def.template).toBeTruthy();
    expect(await roundTrip(def, salesOrdersCatalog())).toEqual(JSON.parse(JSON.stringify(def)));
  });

  // Sayfalama işlemin desteğine bağlıdır (Studio'nun var olan kuralı, kalıptan bağımsız): işlem listesi yüklenirken korunur,
  // işlem katalogda yoksa silinir. Bu fikstürde liste `satis.siparis.listele` ile sunucu sayfalıdır.
  it("server paging of the fixture's list follows the ERP operation catalog", async () => {
    const raw = JSON.parse(readFileSync(fixture, "utf8")) as { definition?: ModelDefinition } & ModelDefinition;
    const def = raw.definition ?? raw;
    const list = (out: ModelDefinition) => out.components.find((item) => item.id === "liste")!.props;
    expect(await roundTrip(def, { status: "loading" } as ErpCatalog)).toEqual(JSON.parse(JSON.stringify(def)));
    const stripped = await roundTrip(def) as ModelDefinition;
    expect(list(stripped).paging).toBeUndefined();
    expect(list(def).paging).toBe("server");
  });
});
