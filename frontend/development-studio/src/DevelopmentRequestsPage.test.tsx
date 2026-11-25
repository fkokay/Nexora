import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { DevelopmentRequestsPage } from "./DevelopmentRequestsPage";

const base = { description: "Açıklama", status: "Submitted", createdAt: "2026-11-20T10:00:00Z", projectId: null, projectName: null, canEdit: false };
const requests = [
  { ...base, id: "1", title: "Benim talebim", isMine: true, stage: "New" as const },
  { ...base, id: "2", title: "Başkasının talebi", isMine: false, stage: "Staging" as const },
  { ...base, id: "3", title: "Yayındaki talebim", isMine: true, stage: "Production" as const },
];
const noop = () => {};

describe("DevelopmentRequestsPage", () => {
  it("DevelopmentRequestsPage mine mode lists only own requests and shows Yazılımcıdan iste", () => {
    const html = renderToString(
      <DevelopmentRequestsPage mode="mine" requests={requests} projects={[]} busy={false} onCreate={noop} onEdit={noop} onDelete={noop} />,
    );
    expect(html).toContain("Taleplerim");
    expect(html).toContain("Yazılımcıdan iste");
    expect(html).toContain("Benim talebim");
    expect(html).toContain("Yayındaki talebim");
    expect(html).not.toContain("Başkasının talebi");
  });

  it("DevelopmentRequestsPage incoming mode lists all requests without a create button", () => {
    const html = renderToString(
      <DevelopmentRequestsPage mode="incoming" requests={requests} projects={[]} busy={false} onCreate={noop} onEdit={noop} onDelete={noop} />,
    );
    expect(html).toContain("Gelen talepler");
    expect(html).toContain("Başkasının talebi");
    expect(html).not.toContain("Yazılımcıdan iste");
    expect(html).not.toContain("Talep oluştur");
  });

  it("DevelopmentRequestsPage shows stage badges", () => {
    const html = renderToString(
      <DevelopmentRequestsPage mode="incoming" requests={requests} projects={[]} busy={false} onCreate={noop} onEdit={noop} onDelete={noop} />,
    );
    expect(html).toMatch(/data-stage="New"[^>]*>Yeni</);
    expect(html).toMatch(/data-stage="Staging"[^>]*>Deneme ortamında</);
    expect(html).toMatch(/data-stage="Production"[^>]*>Yayında</);
  });
});
