import { describe, expect, it } from "vitest";
import {
  historyRows,
  pendingRows,
  publishErrorMessage,
  restoreErrorMessage,
  type ModuleDeployment,
  type Publications,
} from "./publicationsModel";

const publications: Publications = {
  pending: [
    { pageId: "p1", code: "cari", name: "Cari Hesaplar", screenKey: null, updatedAt: "2026-11-20T12:00:00Z", updatedByName: "Ayşe Y." },
    { pageId: "p2", code: "siparis", name: "Satış siparişi", screenKey: "sales-order", updatedAt: "2026-11-22T12:00:00Z", updatedByName: null },
  ],
  history: [
    { pageId: "p3", revisionId: "r1", revision: 2, code: "cari", name: "Cari Hesaplar", screenKey: null, publishedAt: "2026-11-10T12:00:00Z", changedByName: "Ayşe Y.", isCurrent: false },
    { pageId: "p4", revisionId: "r2", revision: 4, code: "cari", name: "Cari Hesaplar", screenKey: null, publishedAt: "2026-11-18T12:00:00Z", changedByName: "Can D.", isCurrent: true },
  ],
};

describe("pendingRows", () => {
  it("maps drafts to publishable screen rows, newest first", () => {
    expect(pendingRows(publications)).toEqual([
      { key: "page:p2", title: "Satış siparişi", kind: "Ekran", by: null, at: "2026-11-22T12:00:00Z", status: "Taslak", action: "publish" },
      { key: "page:p1", title: "Cari Hesaplar", kind: "Ekran", by: "Ayşe Y.", at: "2026-11-20T12:00:00Z", status: "Taslak", action: "publish" },
    ]);
  });
});

describe("historyRows", () => {
  it("marks the current revision Yayında and older ones restorable", () => {
    expect(historyRows(publications)).toEqual([
      { key: "rev:r2", title: "Cari Hesaplar", kind: "Ekran", by: "Can D.", at: "2026-11-18T12:00:00Z", status: "Yayında", action: null },
      { key: "rev:r1", title: "Cari Hesaplar", kind: "Ekran", by: "Ayşe Y.", at: "2026-11-10T12:00:00Z", status: "Önceki sürüm", action: "restore" },
    ]);
  });

  it("adds succeeded module deployments only when given, without an action", () => {
    const deployments: ModuleDeployment[] = [
      { id: "d1", projectId: "x", version: "1.3.1", status: "Succeeded", createdAt: "2026-11-12T11:00:00Z", completedAt: "2026-11-12T12:00:00Z" },
      { id: "d2", projectId: "x", version: "1.3.2", status: "Succeeded", createdAt: "2026-11-19T11:00:00Z", completedAt: "2026-11-19T12:00:00Z" },
      { id: "d3", projectId: "x", version: "1.4.0", status: "Failed", createdAt: "2026-11-21T11:00:00Z", completedAt: "2026-11-21T12:00:00Z" },
    ];
    const rows = historyRows(publications, deployments);
    expect(rows.map((row) => row.key)).toEqual(["deploy:d2", "rev:r2", "deploy:d1", "rev:r1"]);
    expect(rows[0]).toEqual({ key: "deploy:d2", title: "Firma modülü 1.3.2", kind: "Modül sürümü", by: null, at: "2026-11-19T12:00:00Z", status: "Yayında", action: null });
    expect(rows[2]).toMatchObject({ status: "Önceki sürüm", action: null });
    expect(historyRows(publications).some((row) => row.kind === "Modül sürümü")).toBe(false);
  });

  it("keeps one live module version per project", () => {
    const deployments: ModuleDeployment[] = [
      { id: "a", projectId: "x", version: "1.0.0", status: "Succeeded", createdAt: "2026-11-01T11:00:00Z", completedAt: "2026-11-01T12:00:00Z" },
      { id: "b", projectId: "y", version: "2.0.0", status: "Succeeded", createdAt: "2026-11-02T11:00:00Z", completedAt: "2026-11-02T12:00:00Z" },
    ];
    const rows = historyRows({ pending: [], history: [] }, deployments);
    expect(rows.map((row) => row.status)).toEqual(["Yayında", "Yayında"]);
  });
});

describe("restoreErrorMessage", () => {
  it("explains an open draft on 409", () => {
    expect(restoreErrorMessage(409, { error: "Bu sayfa için açık taslak zaten var." })).toBe(
      "Bu ekranın açık bir taslağı var. Önce onu yayınlayın ya da silin.",
    );
  });
  it("uses a generic text for server errors", () => {
    expect(restoreErrorMessage(500)).toBe("İşlem tamamlanamadı (500).");
  });
});

describe("publishErrorMessage", () => {
  it("shows the server's reason or a generic text", () => {
    expect(publishErrorMessage(409, { error: "Erişim kuralı seçin." })).toBe("Erişim kuralı seçin.");
    expect(publishErrorMessage(502)).toBe("İşlem tamamlanamadı (502).");
  });
});
