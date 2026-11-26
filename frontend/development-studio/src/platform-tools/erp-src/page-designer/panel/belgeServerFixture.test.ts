/// <reference types="node" />
// Studio'nun kurduğu belge sayfası sunucunun gerçek doğrulayıcısından geçmeli (TenantCustomPageBelgeStudioFixtureTests).
// Tanım burada Studio modeliyle kurulur, tasarımcının kayıt dönüşümünden (wireDefinition) geçer ve kayıtlı fikstürle aynı olmalıdır.
// Yeniden üretmek: UPDATE_BELGE_FIXTURE=1 npx vitest run belgeServerFixture
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocumentModel, type DocumentModel } from "../documentModelClient";
import { newBelgeTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { moveBelgeItem, renameBelgeItem, setBelgeActivity, setBelgeDensity, setBelgeVatBreakdown, toggleBelgeItem } from "./belgeModel";
import { belgeTestModel } from "./belgeTestModel";

const fixture = (name: string) => new URL(`../../../../../../../tests/IntegrationTests/Fixtures/Belge/${name}`, import.meta.url);

/** Danışmanın panelde yaptığı adımlar (taslak 09). */
function build(model: DocumentModel): ModelDefinition {
  let def = newBelgeTemplateDefinition() as unknown as ModelDefinition;
  def = toggleBelgeItem(def, model, "fields", "salespersonEmployeeId");
  def = toggleBelgeItem(def, model, "fields", "requestedDeliveryDate");
  def = renameBelgeItem(def, model, "fields", "customerId", "Cari");
  def = toggleBelgeItem(def, model, "columns", "availableQuantity");
  def = moveBelgeItem(def, "columns", "lineTotal", 2);
  def = renameBelgeItem(def, model, "columns", "lineTotal", "Satır tutarı");
  def = setBelgeDensity(def, "dense");
  def = setBelgeVatBreakdown(def, false);
  return setBelgeActivity(def, true);
}

describe("Belge fixture for the server validator", { timeout: 30_000 }, () => {
  it("definition.json matches what Studio builds", async () => {
    const { designerPersistence } = await import("../../CustomPagesPage");
    type Def = Parameters<typeof designerPersistence.wireDefinition>[0];
    const model = parseDocumentModel(belgeTestModel)!;
    const wired = JSON.parse(JSON.stringify(designerPersistence.wireDefinition(build(model) as unknown as Def, { status: "ready", operations: [] })));
    if (process.env.UPDATE_BELGE_FIXTURE === "1") writeFileSync(fixture("definition.json"), `${JSON.stringify(wired, null, 2)}\n`);
    expect(wired).toEqual(JSON.parse(readFileSync(fixture("definition.json"), "utf8")));
  });
});
