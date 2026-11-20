import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountWhenField } from "./CountWhenField";
import { countRowsWhen, countText, countWhenProblem } from "./countWhen";

// Tuval önizlemesi: koşullu sayaç sorgunun örnek satırlarından sayılır (ERP çalışma zamanıyla aynı kural).
const scope = { bugun: "2026-03-10", bakiye: { rows: [], meta: { totalCount: 7 } } };
const rows = [{ expiryDate: "2026-03-01" }, { expiryDate: "2026-03-10" }, { expiryDate: "2026-04-09" }, { expiryDate: "2026-04-10" }, { expiryDate: null }];
const names = ["bakiye", "liste"];

describe("koşullu sayaç (countWhen)", () => {
  it("örnek satırlardan süresi geçmiş ve 30 gün içinde dolacak satırları sayar", () => {
    expect(countRowsWhen("bakiye.satir.expiryDate < bugun", rows, "bakiye", scope)).toBe(1);
    expect(countRowsWhen("bakiye.satir.expiryDate >= bugun && bakiye.satir.expiryDate <= bugun + 30", rows, "bakiye", scope)).toBe(2);
    expect(countRowsWhen("bakiye.meta.totalCount == 7", rows, "bakiye", scope)).toBe(5);
  });

  it("koşul yoksa undefined, bozuksa null (—) döner", () => {
    expect(countRowsWhen(undefined, rows, "bakiye", scope)).toBeUndefined();
    expect(countRowsWhen("bakiye.satir.x ==", rows, "bakiye", scope)).toBeNull();
    expect(countText(null)).toBe("—");
    expect(countText(1500)).toBe("1.500");
  });

  it("sunucuyla aynı denetimler", () => {
    expect(countWhenProblem(undefined, "bakiye", names)).toBeNull();
    expect(countWhenProblem("bakiye.satir.expiryDate < bugun", "bakiye", names)).toBeNull();
    expect(countWhenProblem("bakiye.satir.x == 1", null, names)).toContain("yalnızca sorgusu olan gösterge");
    expect(countWhenProblem("liste.satir.x == 1", "bakiye", names)).toContain("bakiye.satir.<alan>");
    expect(countWhenProblem("yok.satir.x == 1", "bakiye", names)).toContain("sayfada olmayan bir ada başvuruyor: yok");
    expect(countWhenProblem("bakiye.satir.x <", "bakiye", names)).toContain("'countWhen' koşulu geçersiz");
  });

  it("müfettiş alanı sorgu adıyla örnek ve hata iletisi gösterir", () => {
    const ok = renderToString(<CountWhenField value="bakiye.satir.expiryDate < bugun" queryName="bakiye" pageNames={names} onChange={() => {}}/>);
    expect(ok).toContain("Koşullu sayaç");
    expect(ok.replace(/<!-- -->/g, "")).toContain("bakiye.satir.&lt;alan&gt;");
    expect(ok).not.toContain('role="alert"');
    const bad = renderToString(<CountWhenField value="liste.satir.x == 1" queryName="bakiye" pageNames={names} onChange={() => {}}/>);
    expect(bad).toContain('role="alert"');
  });
});
