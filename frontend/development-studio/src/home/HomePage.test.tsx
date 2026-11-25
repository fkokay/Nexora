import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { HomePage, type HomeRequestItem } from "./HomePage";

const requests: HomeRequestItem[] = [
  { id: "1", title: "Kredi limiti uyarısı", createdAt: "2026-11-20T12:00:00Z", projectName: null, stage: "New", isMine: true },
];
const render = (role: "consultant" | "developer" | "admin") =>
  renderToString(
    <HomePage token="t" role={role} tenantName="Akdeniz Gıda" userName="Ayşe" requests={requests} requestsStatus="ready" onNewRequest={() => {}} />,
  );

describe("HomePage", () => {
  it("shows the consultant cards, recent screens and shortcuts", () => {
    const html = render("consultant");
    expect(html).toContain("Taslakta bekleyen");
    expect(html).toContain("Açık taleplerim");
    expect(html).toContain("Son çalıştıklarım");
    expect(html).toContain("Yazılımcıdan bir şey iste");
    expect(html).not.toContain("Gelen talepler");
  });
  it("shows the developer cards above the request list", () => {
    const html = render("developer");
    expect(html).toContain("Son canlı yayın");
    expect(html.indexOf("Gelen talepler")).toBeLessThan(html.indexOf("Kredi limiti uyarısı"));
  });
  it("shows the admin cards", () => {
    const html = render("admin");
    expect(html).toContain("Studio kullanıcıları");
    expect(html).toContain("Kurulu modüller");
    expect(html).toContain("Bu ay yayın");
  });
});
