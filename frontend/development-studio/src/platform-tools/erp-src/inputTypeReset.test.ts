import { describe, expect, it } from "vitest";
import { designerInternals } from "./CustomPagesPage";

// Giriş türü değişince türe özgü özellikler silinir; sunucu bunları başka türde reddeder (TenantCustomPageSchema).
const { inputTypeReset } = designerInternals;
const props = { multiline: true, presets: ["10=%10"], searchable: true, allowCustom: true };

describe("giriş türü değişince türe özgü özellikler", () => {
  it("metinden sayıya: çok satırlı silinir, hazır değerler kalır", () => {
    const reset = inputTypeReset("number", props);
    expect(reset).toHaveProperty("multiline", undefined);
    expect(reset).not.toHaveProperty("presets");
  });
  it("tarihe geçişte hazır değerler, çok satırlı ve listede olmayan değer silinir", () => {
    const reset = inputTypeReset("date", props);
    expect(reset).toHaveProperty("presets", undefined);
    expect(reset).toHaveProperty("multiline", undefined);
    expect(reset).toHaveProperty("allowCustom", undefined);
  });
  it("açılır listede aranabilirlik ve listede olmayan değer kalır", () => {
    const reset = inputTypeReset("select", props);
    expect(reset).not.toHaveProperty("searchable");
    expect(reset).not.toHaveProperty("allowCustom");
  });
});
