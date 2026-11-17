import { describe, expect, it } from "vitest";
import {
  columnTotal,
  formatCell,
  isRightAligned,
  parseColumnFormats,
  parseToneMap,
  sparklinePath,
  toneFor,
  trendPoints
} from "./cellFormat";

describe("cellFormat", () => {
  it("parses tone maps and skips invalid entries", () => {
    expect(parseToneMap(["Aktif=success", "Pasif=danger", "bozuk", "X=mor", 5])).toEqual([
      { key: "Aktif", tone: "success" },
      { key: "Pasif", tone: "danger" }
    ]);
    expect(parseToneMap(undefined)).toEqual([]);
  });

  it("matches tones case-insensitively with Turkish rules", () => {
    const map = parseToneMap(["Aktif=success"]);
    expect(toneFor(" aktif ", map)).toBe("success");
    expect(toneFor("İPTAL", parseToneMap(["iptal=danger"]))).toBe("danger");
    expect(toneFor("yok", map)).toBeNull();
  });

  it("parses column formats", () => {
    expect(parseColumnFormats(["kod=money", "ad=bogus", "x", "d=date"])).toEqual({ kod: "money", d: "date" });
  });

  it("formats cells", () => {
    expect(formatCell(1234.5, "money")).toBe("1.234,50");
    expect(formatCell(1234.567, "number")).toBe("1.234,57");
    expect(formatCell(null, "number")).toBe("—");
    expect(formatCell("", "text")).toBe("—");
    expect(formatCell("2026-11-17T09:18:24+00:00", "date")).toBe("17.11.2026");
    expect(formatCell(1250, undefined, "decimal")).toBe("1.250");
    expect(formatCell("abc", "date")).toBe("abc");
    expect(formatCell("abc", "code")).toBe("abc");
  });

  it("detects right alignment", () => {
    expect(isRightAligned("money")).toBe(true);
    expect(isRightAligned(undefined, "number")).toBe(true);
    expect(isRightAligned("code")).toBe(false);
  });

  it("totals numeric columns", () => {
    expect(columnTotal([{ a: 1.5 }, { a: "x" }, { a: null }, { a: 2 }], "a")).toBe(3.5);
    expect(columnTotal([{ a: "x" }], "a")).toBeNull();
  });

  it("extracts trend points", () => {
    expect(trendPoints([{ t: "a", v: 3 }, { t: "b", v: 5 }])).toEqual([3, 5]);
    expect(trendPoints([{ v: 1 }, { v: 2 }, { v: 3 }], 2)).toEqual([1, 2]);
  });

  it("builds sparkline points", () => {
    const flat = sparklinePath([1, 1], 70, 26).split(" ").map((p) => p.split(",").map(Number));
    expect(flat.map((p) => p[1])).toEqual([13, 13]);
    expect(sparklinePath([5], 70, 26)).toBe("");
    expect(sparklinePath([], 70, 26)).toBe("");
    expect(sparklinePath([1, 3], 70, 26).split(" ")).toHaveLength(2);
  });
});
