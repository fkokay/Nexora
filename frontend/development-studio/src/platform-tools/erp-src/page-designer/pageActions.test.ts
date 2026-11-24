import { describe, expect, it } from "vitest";
import { movedButtonIds } from "./pageActions";

const bar = (props: Record<string, unknown>) => ({ id: "komutlar", type: "actionBar", props });
const button = (id: string) => ({ id, type: "button", props: { text: id } });

describe("movedButtonIds", () => {
  it("Yeni / Aç / kayıttan sonra komutuna bağlı düğmeleri tuvalde ayrıca çizdirmez (ERP gibi)", () => {
    const moved = movedButtonIds([
      bar({ newButton: "yeni", openButton: "ac", afterSaveButton: "sonra", moreButtons: ["eski"] }),
      button("yeni"), button("ac"), button("sonra"), button("eski"), button("serbest"),
    ]);
    expect([...moved].sort()).toEqual(["ac", "eski", "sonra", "yeni"]);
  });

  it("İşlemler menüsü gizliyken menü düğmeleri yerinde kalır, Yeni düğmesi yine taşınır", () => {
    const moved = movedButtonIds([
      bar({ newButton: "yeni", moreButtons: ["eski"], hiddenCommands: ["more"] }),
      button("yeni"), button("eski"),
    ]);
    expect([...moved]).toEqual(["yeni"]);
  });

  it("bağlı kimlik bir düğme değilse ya da çubuk yoksa boş döner", () => {
    expect([...movedButtonIds([bar({ newButton: "pencere" }), { id: "pencere", type: "dialog", props: {} }])]).toEqual([]);
    expect([...movedButtonIds([button("yeni")])]).toEqual([]);
  });
});
