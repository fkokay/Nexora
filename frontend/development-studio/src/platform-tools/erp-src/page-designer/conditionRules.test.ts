import { describe, expect, it } from "vitest";
import { parseCondition } from "./conditions";
import { describeRules, formatLiteral, formatRules, rulesFromCondition, type RuleSet } from "./conditionRules";

const roundTrip = (set: RuleSet) => {
  const formatted = formatRules(set);
  if (!formatted.ok) throw new Error(formatted.error);
  const text = formatted.text!;
  expect(parseCondition(text).ok).toBe(true);
  const back = rulesFromCondition(text);
  expect(back).not.toBeNull();
  const again = formatRules(back!);
  expect(again.ok && again.text).toBe(text);
  return { text, back: back! };
};

describe("formatLiteral", () => {
  it("true/false mantıksal, birebir sayı sayı, gerisi metin", () => {
    expect(formatLiteral("true")).toBe("true");
    expect(formatLiteral("12")).toBe("12");
    expect(formatLiteral("-3.5")).toBe("-3.5");
    expect(formatLiteral("05")).toBe("'05'");
    expect(formatLiteral("1.0")).toBe("'1.0'");
    expect(formatLiteral("TenantAdmin")).toBe("'TenantAdmin'");
    expect(formatLiteral("")).toBe("''");
  });
  it("tek tırnaklı metin çift tırnakla; ikisini birden içeren yazılamaz", () => {
    expect(formatLiteral("O'Neil")).toBe("\"O'Neil\"");
    expect(formatLiteral("a \"b\"")).toBe("'a \"b\"'");
    expect(formatLiteral("a'\"")).toBeNull();
  });
});

describe("kurucu gidiş-dönüş", () => {
  it("tek kural ve her işleç", () => {
    expect(roundTrip({ joiner: "and", rules: [{ path: "kullanici.rol", op: "==", value: "TenantAdmin" }] }).text).toBe("kullanici.rol == 'TenantAdmin'");
    expect(roundTrip({ joiner: "and", rules: [{ path: "liste.seciliSatir", op: "notEmpty", value: "" }] }).text).toBe("liste.seciliSatir != null");
    expect(roundTrip({ joiner: "and", rules: [{ path: "durum.value", op: "empty", value: "" }] }).text).toBe("durum.value == null");
    expect(roundTrip({ joiner: "and", rules: [{ path: "durum.value", op: "in", value: "Taslak, Onaylı,3" }] }).text).toBe("durum.value in ['Taslak', 'Onaylı', 3]");
  });
  it("&& ve || zincirleri, tırnak ve kesme işaretli değerler", () => {
    const and = roundTrip({ joiner: "and", rules: [
      { path: "a.b", op: "==", value: "O'Neil" }, { path: "c", op: "!=", value: "say \"hi\"" }, { path: "d[0].e", op: "==", value: "true" }, { path: "f", op: "==", value: "42" },
    ] });
    expect(and.text).toBe("a.b == \"O'Neil\" && c != 'say \"hi\"' && d[0].e == true && f == 42");
    expect(and.back.rules.map((rule) => rule.value)).toEqual(["O'Neil", "say \"hi\"", "true", "42"]);
    const or = roundTrip({ joiner: "or", rules: [{ path: "x", op: "in", value: "O'a, b" }, { path: "y", op: "==", value: "" }] });
    expect(or.text).toBe("x in [\"O'a\", 'b'] || y == ''");
    expect(or.back.joiner).toBe("or");
  });
  it("yolu boş satır yazılmaz; satır yoksa undefined", () => {
    expect(formatRules({ joiner: "and", rules: [] })).toEqual({ ok: true, text: undefined });
    expect(formatRules({ joiner: "and", rules: [{ path: "", op: "==", value: "x" }, { path: "a", op: "==", value: "1" }] })).toEqual({ ok: true, text: "a == 1" });
  });
  it("yazılamayan değer hata ve satır sırası döner", () => {
    const result = formatRules({ joiner: "and", rules: [{ path: "a", op: "==", value: "1" }, { path: "b", op: "==", value: "'\"" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.index).toBe(1);
    expect(formatRules({ joiner: "and", rules: [{ path: "a", op: "in", value: " , " }] }).ok).toBe(false);
  });
});

describe("rulesFromCondition: kurmadığı koşulu yeniden yazmaz", () => {
  it("boş koşul satırsız kümedir", () => {
    expect(rulesFromCondition(undefined)).toEqual({ joiner: "and", rules: [] });
    expect(rulesFromCondition("")).toEqual({ joiner: "and", rules: [] });
  });
  it.each([
    "a == 1 && b == 2 || c == 3", "!(a == 1)", "(a == 1)", "a == b", "1 == a", "a", "a==1", "a == 1  && b == 2", "a == \"x\"", "a == '5'",
    "a == 'true'", "a == 05", "a in [null]", "a in ['x,y']", "a in [ 'x']", "a in ['x' , 'y']", "a == ", "a == null && (b != null)", "a != 'x' && !b",
  ])("%s → kod kipi", (text) => {
    expect(rulesFromCondition(text)).toBeNull();
  });
  it("kurucu biçimindeki elle yazılmış koşul kurucuda açılır", () => {
    expect(rulesFromCondition("kullanici.rol == 'TenantAdmin' || kullanici.rol == 'Yonetici'")).toEqual({
      joiner: "or", rules: [{ path: "kullanici.rol", op: "==", value: "TenantAdmin" }, { path: "kullanici.rol", op: "==", value: "Yonetici" }],
    });
  });
});

describe("describeRules", () => {
  const labelFor = (path: string) => ({ "kullanici.rol": "rolü" } as Record<string, string>)[path] ?? path;
  it("düz Türkçe özet", () => {
    expect(describeRules({ joiner: "and", rules: [{ path: "kullanici.rol", op: "==", value: "TenantAdmin" }] }, labelFor, "görünür", "Her zaman görünür."))
      .toBe("Rolü “TenantAdmin” ise görünür.");
    expect(describeRules({ joiner: "or", rules: [{ path: "a", op: "empty", value: "" }, { path: "b", op: "in", value: "x, y" }] }, labelFor, "pasif olur", ""))
      .toBe("A boşsa veya b “x”, “y” değerlerinden biriyse pasif olur.");
    expect(describeRules({ joiner: "and", rules: [] }, labelFor, "görünür", "Her zaman görünür.")).toBe("Her zaman görünür.");
  });
});

describe("sıralama işleçleri", () => {
  it("kurucu > >= < <= ile yazdığı koşulu aynen geri okur", () => {
    for (const text of ["stok.miktar > 5", "stok.miktar >= 0 && stok.minimum < 10", "fiyat <= 2.5 || fiyat > 100"]) {
      const set = rulesFromCondition(text);
      expect(set).not.toBeNull();
      expect(formatRules(set!)).toEqual({ ok: true, text });
    }
    expect(rulesFromCondition("tarih < null")).toBeNull();
  });
});
