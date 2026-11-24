import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaCellNumber, formulaOrder, parseFormula, roundFormula } from "./gridFormula";
import vectors from "./gridFormula.vectors.json";

// Sunucu ikizi (GridFormula.cs) aynı vektörleri TenantCustomPageGridFillSchemaTests içinde okur.
const columns = new Set(vectors.columns);

describe("parseFormula (gridFormula.vectors.json)", () => {
  for (const vector of vectors.valid) {
    it(`geçerli: ${JSON.stringify(vector.text)}`, () => {
      const parsed = parseFormula(vector.text, columns);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.refs).toEqual(vector.refs);
      for (const sample of vector.cases) {
        const cells = sample.cells as Record<string, string>;
        expect(evaluateFormula(parsed.node, (code) => formulaCellNumber(cells[code])), JSON.stringify(cells)).toBe(sample.result);
      }
    });
  }
  for (const text of vectors.invalid) {
    it(`geçersiz: ${JSON.stringify(text)}`, () => {
      const parsed = parseFormula(text, columns);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(/^Formül geçersiz \(/);
    });
  }

  it("metin olmayan ve çok uzun formül geçersizdir", () => {
    expect(parseFormula(5, columns).ok).toBe(false);
    expect(parseFormula(`quantity${" + 1".repeat(60)}`, columns).ok).toBe(false);
  });

  it("20 düzeye kadar iç içe ifade geçerlidir", () => {
    expect(parseFormula(`${"(".repeat(19)}1${")".repeat(19)}`, columns).ok).toBe(true);
  });

  it("izin verilmeyen sütun gerekçede adıyla geçer", () => {
    const parsed = parseFormula("lineTotal * 2", columns);
    expect(parsed.ok || parsed.error).toContain("'lineTotal'");
  });
});

describe("formulaOrder (gridFormula.vectors.json graphs)", () => {
  for (const graph of vectors.graphs) it(JSON.stringify(graph.refs), () => {
    expect(formulaOrder(graph.refs as unknown as Record<string, string[]>)).toEqual({ order: graph.order, cyclic: graph.cyclic });
  });
});

describe("roundFormula", () => {
  it("yarımı sıfırdan uzağa yuvarlar, -0 ve sonsuz değeri 0 yapar", () => {
    expect(roundFormula(1.005)).toBe(1.01);
    expect(roundFormula(-1.005)).toBe(-1.01);
    expect(roundFormula(2.344)).toBe(2.34);
    expect(Object.is(roundFormula(-0.001), 0)).toBe(true);
    expect(roundFormula(Infinity)).toBe(0);
  });
});
