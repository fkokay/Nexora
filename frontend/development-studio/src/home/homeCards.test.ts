import { describe, expect, it } from "vitest";
import {
  adminCards,
  consultantCards,
  consultantShortcuts,
  countLabel,
  developerCards,
  lastProductionAt,
  publishedThisMonth,
  recentScreens,
  withStatus,
  type HomeRequest,
} from "./homeCards";
import type { Person } from "../people/peopleModel";

const request = (stage: HomeRequest["stage"], isMine = true): HomeRequest => ({ stage, isMine });
const person = (effectiveRole: Person["effectiveRole"]): Person => ({
  userId: effectiveRole,
  displayName: effectiveRole,
  email: `${effectiveRole}@example.com`,
  membershipRole: "TenantUser",
  studioRole: null,
  effectiveRole,
});

describe("consultantCards", () => {
  it("shows pending drafts and own open requests", () => {
    expect(consultantCards({ pendingCount: 3, myRequests: [request("New"), request("Staging"), request("Production")] })).toEqual([
      { id: "pending", title: "Taslakta bekleyen", value: "3", detail: "ekran yayınlanmadı", href: "#publications" },
      { id: "my-requests", title: "Açık taleplerim", value: "2", detail: "2 yazılımcıda", href: "#my-requests" },
    ]);
  });
  it("counts only the person's own requests", () => {
    expect(consultantCards({ pendingCount: 0, myRequests: [request("New", false)] })[1].value).toBe("0");
  });
  it("marks a capped pending list", () => {
    expect(consultantCards({ pendingCount: 100, pendingCapped: true, myRequests: [] })[0].value).toBe("100+");
  });
  it("shows zeros for empty input", () => {
    const cards = consultantCards({ pendingCount: 0, myRequests: [] });
    expect(cards.map((card) => card.value)).toEqual(["0", "0"]);
    expect(cards[1].detail).toBe("0 yazılımcıda");
  });
});

describe("developerCards", () => {
  it("counts new and staging requests and shows the last production date", () => {
    expect(
      developerCards({ requests: [request("New", false), request("Staging"), request("Production")], lastProductionAt: "2026-11-20T12:00:00Z" }),
    ).toEqual([
      { id: "incoming", title: "Gelen talepler", value: "2", detail: "1 yeni · 1 deneme ortamında", href: "#incoming-requests" },
      { id: "last-production", title: "Son canlı yayın", value: "20.11.2026", detail: "canlı ortama son dağıtım", href: "#publications" },
    ]);
  });
  it("shows Henüz yok without a production deployment", () => {
    const cards = developerCards({ requests: [], lastProductionAt: null });
    expect(cards[0]).toMatchObject({ value: "0", detail: "0 yeni · 0 deneme ortamında" });
    expect(cards[1]).toMatchObject({ value: "Henüz yok", detail: "canlıya dağıtım yapılmadı" });
  });
});

describe("adminCards", () => {
  it("counts Studio users by role, modules and this month's publications", () => {
    expect(
      adminCards({
        people: [person("Admin"), person("Consultant"), person("Consultant"), person("Developer"), person("None")],
        activeModules: 7,
        publishedThisMonth: 12,
      }),
    ).toEqual([
      { id: "studio-users", title: "Studio kullanıcıları", value: "4", detail: "2 danışman · 1 yazılımcı", href: "#people" },
      { id: "modules", title: "Kurulu modüller", value: "7", detail: "etkin modül", href: "#marketplace" },
      { id: "published-month", title: "Bu ay yayın", value: "12", detail: "ekran yayını", href: "#publications" },
    ]);
  });
  it("shows zeros for empty input and marks a capped month", () => {
    const cards = adminCards({ people: [], activeModules: 0, publishedThisMonth: 0 });
    expect(cards.map((card) => card.value)).toEqual(["0", "0", "0"]);
    expect(cards[0].detail).toBe("0 danışman · 0 yazılımcı");
    expect(adminCards({ people: [], activeModules: 0, publishedThisMonth: 100, publishedCapped: true })[2].value).toBe("100+");
  });
});

describe("recentScreens", () => {
  const pages = [
    { name: "Eski", updatedAt: "2026-11-01T12:00:00Z", isPublished: true },
    { name: "Yeni", updatedAt: "2026-11-24T12:00:00Z", isPublished: false },
    { name: "Orta", updatedAt: "2026-11-10T12:00:00Z", isPublished: true },
  ];
  it("lists newest first with a badge", () => {
    expect(recentScreens(pages)).toEqual([
      { name: "Yeni", updatedAt: "2026-11-24T12:00:00Z", badge: "Taslak" },
      { name: "Orta", updatedAt: "2026-11-10T12:00:00Z", badge: "Yayında" },
      { name: "Eski", updatedAt: "2026-11-01T12:00:00Z", badge: "Yayında" },
    ]);
  });
  it("respects take", () => {
    expect(recentScreens(pages, 2).map((item) => item.name)).toEqual(["Yeni", "Orta"]);
    expect(recentScreens([])).toEqual([]);
  });
  it("keeps the newest row of a screen with both a draft and a published version", () => {
    const rows = recentScreens([
      { code: "cari", name: "Cari", updatedAt: "2026-11-01T12:00:00Z", isPublished: true },
      { code: "cari", name: "Cari", updatedAt: "2026-11-05T12:00:00Z", isPublished: false },
    ]);
    expect(rows).toEqual([{ name: "Cari", updatedAt: "2026-11-05T12:00:00Z", badge: "Taslak" }]);
  });
});

describe("helpers", () => {
  it("counts this month's publications and flags a full window still inside the month", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const history = [{ publishedAt: "2026-11-20T12:00:00Z" }, { publishedAt: "2026-11-02T12:00:00Z" }, { publishedAt: "2026-10-30T12:00:00Z" }];
    expect(publishedThisMonth(history, now, 100)).toEqual({ count: 2, capped: false });
    expect(publishedThisMonth(history.slice(0, 2), now, 2)).toEqual({ count: 2, capped: true });
    expect(publishedThisMonth(history, now, 3)).toEqual({ count: 2, capped: false });
  });
  it("picks the latest succeeded production deployment", () => {
    expect(
      lastProductionAt([
        { status: "Succeeded", completedAt: "2026-11-10T12:00:00Z" },
        { status: "Failed", completedAt: "2026-11-22T12:00:00Z" },
        { status: "Succeeded", completedAt: "2026-11-18T12:00:00Z" },
      ]),
    ).toBe("2026-11-18T12:00:00Z");
    expect(lastProductionAt([])).toBeNull();
  });
  it("labels counts and card states", () => {
    expect(countLabel(5, false)).toBe("5");
    expect(countLabel(100, true)).toBe("100+");
    const card = { id: "x", title: "X", value: "3", detail: "d" };
    expect(withStatus(card, "ready")).toBe(card);
    expect(withStatus(card, "error")).toEqual({ id: "x", title: "X", value: "—", detail: "Yüklenemedi" });
    expect(withStatus(card, "loading")).toEqual({ id: "x", title: "X", value: "…", detail: "Yükleniyor" });
  });
  it("offers the consultant shortcuts", () => {
    expect(consultantShortcuts).toEqual([
      { id: "new-screen", label: "Yeni ekran oluştur", href: "#screens/pages" },
      { id: "add-rule", label: "Belgeye kural ekle", href: "#rules" },
      { id: "ask-developer", label: "Yazılımcıdan bir şey iste" },
    ]);
  });
});
