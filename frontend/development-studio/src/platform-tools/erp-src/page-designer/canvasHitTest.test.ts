import { describe, expect, it } from "vitest";
import { dropIndex, pickBlock } from "./canvasHitTest";

describe("tuval isabet hesapları", () => {
  const blocks = [
    { id: "tabs", x: 0, y: 0, width: 500, height: 300 },
    { id: "t1", x: 10, y: 40, width: 200, height: 50 },
  ];
  it("noktayı içeren en küçük bloğu seçer", () => {
    expect(pickBlock(blocks, 20, 50)).toBe("t1");
    expect(pickBlock(blocks, 400, 250)).toBe("tabs");
    expect(pickBlock(blocks, 600, 10)).toBeNull();
  });

  const top = [
    { id: "a", x: 0, y: 0, width: 500, height: 100 },
    { id: "b", x: 0, y: 120, width: 500, height: 100 },
  ];
  it("ekleme sırasını hesaplar", () => {
    expect(dropIndex(top, ["a", "b"], 40)).toBe(0);
    expect(dropIndex(top, ["a", "b"], 80)).toBe(1);
    expect(dropIndex(top, ["a", "b"], 230)).toBe(2);
  });
  it("bildirilmemiş bloğu hesaba katmaz", () => {
    expect(dropIndex(top, ["x", "a", "b"], 40)).toBe(1);
    expect(dropIndex(top, ["a", "ghost", "b"], 230)).toBe(3);
  });
});
