import { describe, expect, it } from "vitest";
import { addRule, emptyRule, moveRule, removeRule, ruleProblem, sentence, toggleRule, updateRule, type DocumentRule, type RuleField } from "./documentRulesModel";

const fields: RuleField[] = [{ code: "grandTotal", label: "Genel toplam", kind: "number" }, { code: "customerGroup", label: "Cari grubu", kind: "text" },
  { code: "maxLineDiscount", label: "En yüksek satır iskontosu", kind: "number" }, { code: "deliveryDate", label: "Teslim tarihi", kind: "date" }];
const operators = { number: ["GreaterThan", "Equals", "IsEmpty"], text: ["Equals", "Contains"], date: ["Before"] };
const people = [{ id: "m", displayName: "Mehmet Demir", email: "", role: "TenantUser" }, { id: "a", displayName: "Ayşe Kaya", email: "", role: "TenantUser" }];
const approval = (value = "100000", ids = ["m", "a"]): DocumentRule => ({ ...emptyRule(fields), value, approverUserIds: ids });

describe("Kurallar modeli", () => {
  it("cümle: koşul, işleç, biçimli değer ve eylem", () => {
    expect(sentence(approval(), fields, people)).toEqual({ condition: "Eğer Genel toplam > 100.000 ₺ ise", action: "Onay iste: Mehmet Demir veya Ayşe Kaya" });
    expect(sentence({ ...emptyRule(fields), field: "maxLineDiscount", value: "15", action: "warn", message: "Yüksek" }, fields, people))
      .toEqual({ condition: "Eğer En yüksek satır iskontosu > %15 ise", action: "Uyar ama devam et: “Yüksek”" });
    expect(sentence({ ...emptyRule(fields), always: true, action: "block", message: "Hayır" }, fields, people).condition).toBe("Her zaman");
  });

  it("denetim: kişisiz onay, boş mesaj, sayı olmayan değer, alana uymayan işleç", () => {
    expect(ruleProblem(approval("100000", []), fields, operators)).toContain("kişi seçin");
    expect(ruleProblem({ ...approval(), action: "warn", message: " " }, fields, operators)).toContain("mesajı yazın");
    expect(ruleProblem(approval("çok"), fields, operators)).toContain("sayı yazın");
    expect(ruleProblem({ ...approval(), field: "customerGroup", op: "GreaterThan" }, fields, operators)).toContain("kullanılamaz");
    expect(ruleProblem({ ...approval(), op: "IsEmpty", value: "" }, fields, operators)).toBeNull();
    expect(ruleProblem(approval(), fields, operators)).toBeNull();
  });

  it("ekle, düzenle, sırala, aç-kapat ve sil; sıra numaraları ardışık kalır", () => {
    let rules = addRule([], approval());
    rules = addRule(rules, { ...emptyRule(fields), action: "warn", message: "Dikkat", value: "5" });
    expect(rules.map((r) => [r.code, r.order])).toEqual([["kural1", 1], ["kural2", 2]]);
    expect(rules[1].approverUserIds).toEqual([]);
    expect(rules[0].message).toBeNull();
    rules = moveRule(rules, "kural2", -1);
    expect(rules.map((r) => r.code)).toEqual(["kural2", "kural1"]);
    rules = toggleRule(rules, "kural1");
    expect(rules.find((r) => r.code === "kural1")?.enabled).toBe(false);
    rules = updateRule(rules, "kural1", { ...approval("5"), always: true });
    expect(rules.find((r) => r.code === "kural1")).toMatchObject({ always: true, field: null, op: null, value: null, order: 2 });
    rules = removeRule(rules, "kural2");
    expect(rules.map((r) => [r.code, r.order])).toEqual([["kural1", 1]]);
  });
});
