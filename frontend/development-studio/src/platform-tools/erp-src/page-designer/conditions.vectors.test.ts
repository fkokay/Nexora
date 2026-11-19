import { describe, expect, it } from "vitest";
import { evaluateCondition, parseCondition } from "./conditions";

// erp-web ve sunucuyla ortak koşul vektörleri: Studio ayrıştırıcısı ve tuval değerlendiricisi aynı sonucu vermelidir.
// Studio erp-web'i içe aktarmaz (ayrı derlenir); dosya yalnız testte Vite'in glob'uyla okunur, derlemeye girmez.
type Vectors = {
  syntax: { valid: { text: string; roots: string[] }[]; invalid: string[] };
  eval: { text: string; scope: Record<string, unknown>; expected: boolean }[];
};
const files = import.meta.glob<string>("../../../../../erp-web/src/custom-page/conditions.vectors.json", { eager: true, query: "?raw", import: "default" });
const vectors = JSON.parse(Object.values(files)[0] ?? "null") as Vectors;

describe("koşul vektörleri (erp-web ile ortak)", () => {
  it("ortak vektör dosyası okunur", () => {
    expect(vectors?.syntax.valid.length).toBeGreaterThan(0);
  });

  it("geçerli ifadeler kökleriyle ayrıştırılır", () => {
    for (const vector of vectors.syntax.valid) {
      const parsed = parseCondition(vector.text);
      expect(parsed.ok, vector.text).toBe(true);
      if (parsed.ok) expect(parsed.roots, vector.text).toEqual(vector.roots);
    }
  });

  it("geçersiz ifadeler reddedilir", () => {
    for (const text of vectors.syntax.invalid) expect(parseCondition(text).ok, text).toBe(false);
  });

  it("değerlendirme vektörleri", () => {
    for (const vector of vectors.eval) {
      const parsed = parseCondition(vector.text);
      expect(parsed.ok, vector.text).toBe(true);
      if (parsed.ok) expect(evaluateCondition(parsed.node, vector.scope), vector.text).toBe(vector.expected);
    }
  });
});
