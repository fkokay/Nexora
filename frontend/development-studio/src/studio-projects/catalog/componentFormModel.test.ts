import { describe, expect, it } from "vitest";
import {
  MAX_SETTINGS, addSetting, componentProblems, moveSetting, readSettings, removeSetting, sampleSettingValues, setSetting, settingsJson,
  type SettingRow,
} from "./componentFormModel";

const row = (over: Partial<SettingRow> = {}): SettingRow => ({ name: "baslik", label: "Başlık", type: "text", options: "", def: "", ...over });
const valid = () => ({ code: "satisHaritasi", label: "Satış haritası", settings: [{ name: "baslik", label: "Başlık", type: "text" }] });

describe("componentFormModel", () => {
  it("setting_rows_add_remove_move_and_patch", () => {
    let rows = addSetting([]);
    expect(rows).toEqual([{ name: "ayar1", label: "", type: "text", options: "", def: "" }]);
    rows = addSetting(rows);
    expect(rows.map(r => r.name)).toEqual(["ayar1", "ayar2"]);
    expect(moveSetting(rows, 1, -1).map(r => r.name)).toEqual(["ayar2", "ayar1"]);
    expect(moveSetting(rows, 0, -1)).toBe(rows);
    expect(moveSetting(rows, 1, 1)).toBe(rows);
    expect(removeSetting(rows, 0).map(r => r.name)).toEqual(["ayar2"]);
    // En çok 10 ayar: on birincisi eklenmez.
    const full = Array.from({ length: MAX_SETTINGS }, (_, i) => row({ name: `a${i}` }));
    expect(addSetting(full)).toBe(full);
    // Tür değişince varsayılan sıfırlanır; seçim türü örnek seçeneklerle başlar.
    expect(setSetting([row({ def: "x" })], 0, { type: "bool" })[0]).toMatchObject({ type: "bool", def: false });
    expect(setSetting([row({ def: "x" })], 0, { type: "choice" })[0]).toMatchObject({ type: "choice", def: "", options: "Seçenek 1, Seçenek 2" });
    expect(setSetting([row()], 0, { label: "Yeni" })[0].label).toBe("Yeni");
  });

  it("settings_round_trip_with_typed_defaults", () => {
    const json = [
      { name: "baslik", label: "Başlık", type: "text", default: "Satışlar" },
      { name: "adet", label: "Adet", type: "number", default: 5 },
      { name: "etiket", label: "Etiket", type: "bool", default: true },
      { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu yıl"], default: "Bu yıl" },
      { name: "bos", label: "Boş", type: "number" },
    ];
    const rows = readSettings({ settings: json });
    expect(rows[1]).toEqual({ name: "adet", label: "Adet", type: "number", options: "", def: "5" });
    expect(rows[3].options).toBe("Bu ay, Bu yıl");
    expect(settingsJson(rows)).toEqual(json);
    expect(sampleSettingValues(json)).toEqual({ baslik: "Satışlar", adet: 5, etiket: true, donem: "Bu yıl", bos: null });
  });

  it("componentProblems mirrors server limits", () => {
    expect(componentProblems(valid(), ".kutu{color:red}", "ciz()")).toEqual([]);
    const problems = (json: object, css = "", js = "ciz()") => componentProblems({ ...valid(), ...json }, css, js);
    expect(problems({ code: "1harita" })).toContain("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
    expect(problems({ code: "Harita" })).toContain("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
    expect(problems({ code: "a".repeat(41) })).toContain("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
    expect(problems({ code: "a".repeat(40) })).toEqual([]);
    expect(problems({ label: "" })).toContain("Danışmanın göreceği ad 1–80 karakter olmalı.");
    expect(problems({ label: "x".repeat(81) })).toContain("Danışmanın göreceği ad 1–80 karakter olmalı.");
    expect(problems({ description: "x".repeat(201) })).toContain("Açıklama en çok 200 karakter olabilir.");
    expect(problems({ height: 79 })).toContain("Başlangıç yüksekliği 80 ile 1200 arasında bir tam sayı olmalı.");
    expect(problems({ height: 1201 })).toContain("Başlangıç yüksekliği 80 ile 1200 arasında bir tam sayı olmalı.");
    expect(problems({ height: 1200 })).toEqual([]);
    expect(problems({}, "x".repeat(4001))).toContain("CSS en çok 4000 karakter olabilir.");
    for (const css of ["@import 'a.css';", ".a{background:URL(x.png)}", ".a{width:expression(1)}"])
      expect(problems({}, css)).toContain("CSS'te harici kaynak kullanılamaz.");
    expect(problems({}, "", "  ")).toContain("Katalog bileşeninin kodu ve JavaScript'i olmalı.");
    expect(problems({}, "", "x".repeat(20001))).toContain("JavaScript en çok 20000 karakter olabilir.");
    expect(problems({}, "", "x".repeat(20000))).toEqual([]);
    expect(problems({ settings: Array.from({ length: 11 }, (_, i) => ({ name: `a${i}`, label: "A", type: "text" })) }))
      .toContain("Katalog bileşeni en fazla 10 ayar tanımlayabilir.");
    expect(problems({ extra: 1 })).toContain("Bilinmeyen anahtar: extra.");
  });

  it("componentProblems_checks_each_setting", () => {
    const problems = (settings: object[]) => componentProblems({ ...valid(), settings }, "", "ciz()");
    expect(problems([{ name: "Baslik", label: "B", type: "text" }])).toContain("Ayar adı 'Baslik' küçük harfle başlamalı; harf ve rakamlardan oluşmalı (en çok 32).");
    expect(problems([{ name: "a", label: "A", type: "text" }, { name: "a", label: "B", type: "text" }])).toContain("Ayar adı 'a' birden fazla kez kullanılmış.");
    expect(problems([{ name: "a", label: "", type: "text" }])).toContain("'a' ayarının etiketi 1–60 karakter olmalı.");
    expect(problems([{ name: "a", label: "A", type: "date" }])).toContain("'a' ayarının türü metin, sayı, evet/hayır ya da seçim olmalı.");
    expect(problems([{ name: "a", label: "A", type: "choice", options: [] }])).toContain("'a' seçim ayarı 1–20 seçenek tanımlamalı.");
    expect(problems([{ name: "a", label: "A", type: "text", options: ["x"] }])).toContain("'a' ayarında seçenekler yalnız seçim türünde yazılır.");
    const badDefault = "Bileşen ayarı 'a' için değer türü uygun değil.";
    expect(problems([{ name: "a", label: "A", type: "number", default: "5" }])).toContain(badDefault);
    expect(problems([{ name: "a", label: "A", type: "bool", default: "true" }])).toContain(badDefault);
    expect(problems([{ name: "a", label: "A", type: "choice", options: ["x"], default: "y" }])).toContain(badDefault);
    expect(problems([{ name: "a", label: "A", type: "text", min: 1 }])).toContain("Bilinmeyen anahtar: min.");
    expect(problems([{ name: "a", label: "A", type: "choice", options: ["x", "y"], default: "y" }])).toEqual([]);
  });
});
