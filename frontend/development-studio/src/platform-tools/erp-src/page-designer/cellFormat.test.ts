import { describe, expect, it } from "vitest";
import { COLUMN_FORMATS, formatCell, parseColumnFormats } from "./cellFormat";

// Tarih ve saat biçimi (format "datetime"): yerel saatle kısa tarih + saat; beklenen değer test ortamının saat diliminden hesaplanır.
describe("datetime hücre biçimi", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (iso: string) => {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  it("ISO (Z ve ofsetli) değeri yerel tarih ve saat olarak gösterir", () => {
    expect(formatCell("2026-11-21T11:30:00Z", "datetime")).toBe(local("2026-11-21T11:30:00Z"));
    expect(formatCell("2026-03-05T08:05:00+03:00", "datetime")).toBe(local("2026-03-05T08:05:00+03:00"));
  });

  it("boş değer tire, ayrıştırılamayan değer ham metin olur; tarih biçimi saati göstermez", () => {
    expect(formatCell(null, "datetime")).toBe("—");
    expect(formatCell("", "datetime")).toBe("—");
    expect(formatCell("yarın", "datetime")).toBe("yarın");
    expect(formatCell("2026-11-21T11:30:00Z", "date")).toBe("21.11.2026");
  });

  it("sütun biçimleri listesinde ve ayrıştırmada tanınır", () => {
    expect(COLUMN_FORMATS).toContain("datetime");
    expect(parseColumnFormats(["nextActivityAt=datetime", "expectedCloseDate=date"])).toEqual({ nextActivityAt: "datetime", expectedCloseDate: "date" });
  });
});
