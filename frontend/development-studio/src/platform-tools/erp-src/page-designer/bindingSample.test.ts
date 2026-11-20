import { describe, expect, it } from "vitest";
import { bindingChips } from "./bindingSample";

describe("bindingChips", () => {
  it("returns nothing without bindings", () => {
    expect(bindingChips("")).toEqual([]);
    expect(bindingChips("Düz metin { tek }")).toEqual([]);
  });

  it("labels nested paths and drops row noise", () => {
    expect(bindingChips("{{kart.rows[0].code}}")).toEqual([{ expression: "{{kart.rows[0].code}}", label: "kart › code" }]);
    expect(bindingChips("{{liste.seciliSatir.unvan}}")[0].label).toBe("liste › unvan");
  });

  it("tolerates whitespace inside braces", () => {
    expect(bindingChips("{{  musteri.ad  }}")).toEqual([{ expression: "{{  musteri.ad  }}", label: "musteri › ad" }]);
  });

  it("finds multiple bindings in order", () => {
    const chips = bindingChips("Sn. {{musteri.ad}} - {{ siparis.no }} ({{tarih}})");
    expect(chips.map((chip) => chip.label)).toEqual(["musteri › ad", "siparis › no", "tarih"]);
    expect(chips[1].expression).toBe("{{ siparis.no }}");
  });

  it("keeps non-path expressions as written and skips empty ones", () => {
    expect(bindingChips("{{ a + b }} {{ }}")).toEqual([{ expression: "{{ a + b }}", label: "a + b" }]);
  });
});
