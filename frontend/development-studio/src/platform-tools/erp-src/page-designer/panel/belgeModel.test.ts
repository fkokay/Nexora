import { describe, expect, it } from "vitest";
import { parseDocumentModel } from "../documentModelClient";
import { newBelgeTemplateDefinition, readPageTemplate, templateCatalogText, templateLabel } from "../pageTemplates";
import type { CatalogAction } from "../catalogClient";
import type { ModelDefinition } from "./listPanelModel";
import {
  addBelgeAction, belgeActionUsable, belgeExtraActions, belgeItems, belgeParts, moveBelgeItem, removeBelgeAction, renameBelgeItem, toggleBelgeItem,
} from "./belgeModel";
import { belgeTestModel } from "./belgeTestModel";

const model = parseDocumentModel(belgeTestModel)!;
const fresh = () => newBelgeTemplateDefinition() as unknown as ModelDefinition;
const action = (patch: Partial<CatalogAction>): CatalogAction => ({
  code: "yazdir", label: "Yazdır", kind: "update", target: "record", source: "erp", erpOperation: "satis.siparis.yazdir",
  parameters: [{ name: "id", type: "guid" }], confirmText: null, ...patch,
} as unknown as CatalogAction);

describe("belge kalıbı (Studio)", () => {
  it("yeni belge sayfası belge kalıbını ve satış siparişini taşır", () => {
    const def = fresh();
    expect(readPageTemplate(def.template)).toEqual({ name: "belge", document: "satis.siparis" });
    expect(templateLabel(def)).toBe("Belge");
    expect(templateCatalogText("belge", 1)).toBe("Belge · 1. basamak");
    expect(belgeParts(def).fields).toContain("customerId");
  });

  it("işaretlemek modeldeki sıraya yakın ekler, kaldırmak etiketi de siler", () => {
    let def = toggleBelgeItem(fresh(), model, "fields", "salespersonEmployeeId");
    expect(belgeParts(def).fields).toEqual(["code", "customerId", "orderDate", "requestedDeliveryDate", "salespersonEmployeeId"]);
    def = renameBelgeItem(def, model, "fields", "requestedDeliveryDate", "Teslim");
    def = toggleBelgeItem(def, model, "fields", "requestedDeliveryDate");
    expect(belgeParts(def).fields).not.toContain("requestedDeliveryDate");
    expect(belgeParts(def).fieldLabels).toEqual({});
  });

  it("zorunlu alan ve kolon kaldırılamaz", () => {
    const def = fresh();
    expect(toggleBelgeItem(def, model, "fields", "customerId")).toBe(def);
    expect(toggleBelgeItem(def, model, "columns", "unitPrice")).toBe(def);
  });

  it("taşımak sırayı değiştirir; aynı yere taşımak tanımı değiştirmez", () => {
    const def = fresh();
    const moved = moveBelgeItem(def, "columns", "lineTotal", 0);
    expect(belgeParts(moved).columns[0]).toBe("lineTotal");
    expect(moveBelgeItem(def, "columns", "stockItemId", 0)).toBe(def);
  });

  it("etiket boşsa ya da modelinkiyle aynıysa kaldırılır, 60 karakterde kesilir", () => {
    let def = renameBelgeItem(fresh(), model, "fields", "customerId", "Cari");
    expect(belgeParts(def).fieldLabels).toEqual({ customerId: "Cari" });
    def = renameBelgeItem(def, model, "fields", "customerId", "  ");
    expect(belgeParts(def).fieldLabels).toEqual({});
    def = renameBelgeItem(def, model, "fields", "customerId", "x".repeat(80));
    expect(belgeParts(def).fieldLabels.customerId).toHaveLength(60);
  });

  it("öğe listesi seçilenleri önce, etiketleri ve bayrakları gösterir", () => {
    const items = belgeItems(fresh(), model, "columns");
    expect(items.slice(0, 2).map((i) => i.code)).toEqual(["stockItemId", "quantity"]);
    expect(items.find((i) => i.code === "deliveredQuantity")).toMatchObject({ on: true, calculated: true, visibleFrom: "Open" });
    expect(items.find((i) => i.code === "unitPrice")).toMatchObject({ required: true });
    expect(items.at(-1)?.on).toBe(false);
  });

  it("ek eylem yalnız belge kimliğini isteyen tek kayıt eylemidir; eklenir ve kaldırılır", () => {
    expect(belgeActionUsable(action({ target: "bulk" })).usable).toBe(false);
    expect(belgeActionUsable(action({ kind: "delete" })).usable).toBe(false);
    expect(belgeActionUsable(action({ parameters: [{ name: "tutar", type: "number" }] as never })).usable).toBe(false);
    const def = addBelgeAction(fresh(), action({}));
    expect(belgeExtraActions(def)).toEqual(["yazdir"]);
    const query = def.queries[0] as unknown as { parameters: { binding: string }[] };
    expect(query.parameters[0].binding).toBe("{{sayfa.parametre.id}}");
    expect(def.components.find((c) => c.type === "button")?.props).toMatchObject({ slot: "actions", actionType: "query", text: "Yazdır" });
    const removed = removeBelgeAction(def, "yazdir");
    expect(removed.queries).toEqual([]);
    expect(removed.components.some((c) => c.type === "button")).toBe(false);
  });
});
