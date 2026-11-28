import type { ActiveCatalog } from "./catalogClient";
// Sayfa kalıbı (pageTemplate): sayfanın kökündeki `template: { name: "list" }`. Bileşen ön ayarlarıyla (CustomPagesPage `templates`) karıştırılmamalıdır.
export type PageTemplate = { name: "list" } | { name: "record" } | { name: "free" } | { name: "belge"; document: string };
export type PageTemplateChoice = { id: "list" | "record" | "belge" | "free"; label: string; description: string };

export const PAGE_TEMPLATE_CHOICES: PageTemplateChoice[] = [
  { id: "list", label: "Liste", description: "Kayıtları aramak, süzmek ve seçmek için." },
  { id: "record", label: "Kayıt kartı", description: "Tek bir kaydı görmek ve düzenlemek için." },
  { id: "belge", label: "Belge", description: "Satış siparişi gibi satırlı belgeler; hesap ve durumlar modülden gelir." },
  { id: "free", label: "Serbest", description: "Kalıba uymayan sayfalar: panolar, özet ekranları. Sekmeler ve bölümler sizin." },
];

type TemplatedDefinition = { schemaVersion: 2; template?: PageTemplate; queries: unknown[]; components: unknown[] };
type DefinitionLike = { template?: unknown; components?: unknown };

/** Geçerli bir kalıp değerini döndürür; yoksa ya da bilinmiyorsa undefined (eski sayfa). */
export function readPageTemplate(raw: unknown): PageTemplate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const name = (raw as { name?: unknown }).name;
  if (name === "belge") {
    const document = (raw as { document?: unknown }).document;
    return typeof document === "string" && document ? { name: "belge", document } : undefined;
  }
  return name === "list" ? { name: "list" } : name === "record" ? { name: "record" } : name === "free" ? { name: "free" } : undefined;
}

/** Belge modelleri (sunucudaki `DocumentModelRegistry`): satış siparişi ve satış teklifi. */
export const BELGE_DOCUMENTS = [{ code: "satis.siparis", label: "Satış siparişi" }, { code: "satis.teklif", label: "Satış teklifi" },
  { code: "satinalma.siparis", label: "Satınalma siparişi" }, { code: "satinalma.fatura", label: "Satınalma faturası" }] as const;

/** Modelin yeni sayfadaki varsayılan başlık alanları ve satır kolonları (sunucu kodları modele göre denetler). */
const BELGE_DEFAULTS: Record<string, { fields: string[]; columns: string[] }> = {
  "satis.siparis": { fields: ["code", "customerId", "orderDate", "requestedDeliveryDate"],
    columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "availableQuantity", "lineTotal", "deliveredQuantity"] },
  "satis.teklif": { fields: ["code", "customerId", "quoteDate", "validUntil"],
    columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "availableQuantity", "lineTotal"] },
  "satinalma.siparis": { fields: ["code", "supplierId", "orderDate", "expectedReceiptDate", "targetWarehouseId", "currencyCode"], columns: ["stockItemId", "quantity", "unitCode", "unitPrice", "discountPercent", "vatPercent", "lineTotal"] },
  "satinalma.fatura": { fields: ["invoiceNumber", "supplierId", "invoiceDate", "dueDate", "receiptCode", "currencyCode"], columns: ["description", "quantity", "unitCode", "unitPrice", "expenseAccountId", "vatRate", "total"] },
};

/**
 * Yeni belge sayfası: modelin zorunlu alan ve kolonları ile taslak 08'in varsayılan seçimi. Sunucu kodları modele göre denetler.
 */
export function newBelgeTemplateDefinition(document = "satis.siparis"): TemplatedDefinition {
  const defaults = BELGE_DEFAULTS[document] ?? BELGE_DEFAULTS["satis.siparis"];
  return { schemaVersion: 2, template: { name: "belge", document }, queries: [], components: [
    { id: "baslik", type: "documentFields", props: { slot: "fields", fields: [...defaults.fields], labels: {} } },
    { id: "satirlar", type: "documentLines", props: { slot: "lines", labels: {}, density: "normal", columns: [...defaults.columns] } },
    { id: "toplamlar", type: "documentSummary", props: { slot: "summary", vatBreakdown: true, activity: true } }] };
}

export function newListTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: NEW_LIST_ID, type: "dataTable", props: { slot: "list" } }] };
}

export function newRecordTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "record" }, queries: [], components: [
    { id: "ozet", type: "recordHeader", props: { slot: "summary" } }, { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [] } }] };
}

/** Yeni serbest sayfa (Karar 2): sekmesiz tek bölüm, "Bölüm 1", 2 kolon, üyesiz. */
export function newFreeTemplateDefinition(): TemplatedDefinition {
  return { schemaVersion: 2, template: { name: "free" }, queries: [], components: [
    { id: NEW_FREE_BLOCK_ID, type: "section", props: { slot: "block", title: "Bölüm 1", columns: 2, members: [] } }] };
}
/** Yeni serbest sayfanın bölümü (`newFreeTemplateDefinition`). */
export const NEW_FREE_BLOCK_ID = "bolum";

/** Yeni sayfa penceresindeki seçimin kuracağı tanım (5b-2: yeni sayfa yalnız dört kalıptan biriyle açılır). */
export function newPageDefinitionFor(choice: PageTemplateChoice["id"]): TemplatedDefinition {
  return choice === "list" ? newListTemplateDefinition() : choice === "record" ? newRecordTemplateDefinition() : choice === "free" ? newFreeTemplateDefinition()
    : newBelgeTemplateDefinition();
}

export const RECORD_SOURCE_HINT = "Önce hangi kaydın gösterileceğini seçin.";

/**
 * Kayıt kartı kalıbında sekme yoksa (kaynak seçilmemiş) kaydın önündeki ipucu; sunucu böyle taslağı reddeder.
 * Kayıt kartı olmayan sayfada null.
 */
export function recordSourceProblem(definition: DefinitionLike): string | null {
  if (readPageTemplate(definition.template)?.name !== "record") return null;
  const components = Array.isArray(definition.components) ? definition.components as { type?: unknown; props?: Record<string, unknown> }[] : [];
  const tabs = components.find((component) => component?.type === "tabs" && component.props?.slot === "tabs");
  return Array.isArray(tabs?.props?.tabs) && tabs.props.tabs.length > 0 ? null : RECORD_SOURCE_HINT;
}

/** Sayfası olmayan ilk "açılır" kod (katalogdaki kayıt kartı hedefi); yoksa null. */
export function suggestRecordPageCode(catalog: ActiveCatalog, existingCodes: string[]): string | null {
  return catalog.dataSources.map((source) => source.opens).find((code): code is string => !!code && !existingCodes.includes(code)) ?? null;
}

/** Yeni liste sayfasının listesi (`newListTemplateDefinition`): oluşturulunca panelinde kaynak seçilsin diye seçilir. */
export const NEW_LIST_ID = "liste";
export const LIST_SOURCE_HINT = "Önce ne listeleneceğini seçin.";

/**
 * Liste kalıbında listenin okuma sorgusu (kaynak) yoksa kaydın önündeki ipucu; sunucu böyle taslağı "Liste kalıbında tam bir
 * liste (dataTable) olmalı." diye reddeder (PageTemplateRules). Kalıpsız sayfada ya da liste bağlıysa null.
 */
export function listSourceProblem(definition: DefinitionLike & { queries?: unknown }): string | null {
  if (readPageTemplate(definition.template)?.name !== "list") return null;
  const components = Array.isArray(definition.components) ? definition.components as { type?: unknown; props?: Record<string, unknown> }[] : [];
  const list = components.find((component) => component?.type === "dataTable" && component.props?.slot === "list");
  if (!list) return null;
  const queryId = typeof list.props?.query === "string" ? list.props.query : "";
  const queries = Array.isArray(definition.queries) ? definition.queries as { id?: unknown; kind?: unknown }[] : [];
  return queryId && queries.some((query) => query?.id === queryId && query.kind === "read") ? null : LIST_SOURCE_HINT;
}

/** Serbest gövdede okuma sorgusu (kaynağı) olmayan ilk Liste (`slot: item` `dataTable`); yoksa ya da sayfa serbest değilse null. */
export function freeSourceTable(definition: DefinitionLike & { queries?: unknown }): string | null {
  if (readPageTemplate(definition.template)?.name !== "free") return null;
  const components = Array.isArray(definition.components) ? definition.components as { id?: unknown; type?: unknown; props?: Record<string, unknown> }[] : [];
  const queries = Array.isArray(definition.queries) ? definition.queries as { id?: unknown; kind?: unknown }[] : [];
  const table = components.find((component) => {
    if (component?.type !== "dataTable" || component.props?.slot !== "item") return false;
    const queryId = typeof component.props?.query === "string" ? component.props.query : "";
    return !(queryId && queries.some((query) => query?.id === queryId && query.kind === "read"));
  });
  return table && typeof table.id === "string" ? table.id : null;
}

/**
 * Serbest gövdede kaynağı seçilmemiş Liste varsa kaydın önündeki ipucu (`listSourceProblem` eşi); sunucu okuma sorgusu olmayan
 * listeyi reddeder. Serbest olmayan sayfada ya da bütün listeler bağlıysa null.
 */
export function freeSourceProblem(definition: DefinitionLike & { queries?: unknown }): string | null {
  return freeSourceTable(definition) ? LIST_SOURCE_HINT : null;
}

/** Basamak saklanmaz, hesaplanır: serbest gövde her zaman 3; `above`/`below` yerinde bileşen varsa 2, yoksa 1; kalıpsız sayfada null. */
export function templateLevel(definition: DefinitionLike): 1 | 2 | 3 | null {
  const template = readPageTemplate(definition.template);
  if (!template) return null;
  if (template.name === "free") return 3;
  const components = Array.isArray(definition.components) ? definition.components : [];
  const extra = components.some((component) => {
    const slot = (component as { props?: { slot?: unknown } } | null)?.props?.slot;
    return slot === "above" || slot === "below";
  });
  return extra ? 2 : 1;
}

export function templateLabel(definition: DefinitionLike): "Liste" | "Kayıt kartı" | "Belge" | "Serbest" | "Kalıpsız" {
  const name = readPageTemplate(definition.template)?.name;
  return name === "list" ? "Liste" : name === "record" ? "Kayıt kartı" : name === "belge" ? "Belge" : name === "free" ? "Serbest" : "Kalıpsız";
}

/** Ekranlar listesindeki metin: "Liste · 1. basamak", "Serbest · 3. basamak" (her zaman 3) ya da "Kalıpsız". */
export function templateCatalogText(template: string | null | undefined, level: number | null | undefined): string {
  if (template === "free") return "Serbest · 3. basamak";
  const label = template === "list" ? "Liste" : template === "record" ? "Kayıt kartı" : template === "belge" ? "Belge" : null;
  return label ? `${label} · ${level === 2 ? 2 : 1}. basamak` : "Kalıpsız";
}
