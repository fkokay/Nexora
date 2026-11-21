import { describe, expect, it } from "vitest";
import { parseDateTime, toIsoDateTime } from "./dateTime";
import { coerceParameter } from "./pageBindings";

// Parametre türü "datetime": değer UTC ISO 8601'e normalize edilir; dilimsiz metin yerel saattir, saat kaybolmaz.
describe("datetime parametre türü", () => {
  it("saat dilimli ISO değeri aynı ana UTC olarak çevirir", () => {
    expect(coerceParameter("2026-11-21T14:30:00+03:00", "datetime")).toBe("2026-11-21T11:30:00.000Z");
    expect(coerceParameter("2026-11-21T11:30:00Z", "datetime")).toBe("2026-11-21T11:30:00.000Z");
  });

  it("dilimsiz datetime-local metni yerel saat olarak okur", () => {
    expect(coerceParameter("2026-11-21T14:30", "datetime")).toBe(new Date(2026, 10, 21, 14, 30).toISOString());
  });

  it("boş, geçersiz ve taşan değerler null olur; tarih türü değişmez", () => {
    expect(coerceParameter("", "datetime")).toBeNull();
    expect(coerceParameter(null, "datetime")).toBeNull();
    expect(coerceParameter("yarın", "datetime")).toBeNull();
    expect(parseDateTime("2026-02-31T10:00")).toBeNull();
    expect(toIsoDateTime(42)).toBeNull();
    expect(coerceParameter("2026-11-21T14:30:00Z", "date")).toBe("2026-11-21");
  });
});
