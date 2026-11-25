import { describe, expect, it } from "vitest";
import { githubRows, MODULE_CODE_HREF } from "./connectionsModel";

describe("githubRows", () => {
  it("shows a connected repository by its path", () => {
    expect(githubRows([{ repositoryUrl: "https://github.com/ornek-partner/akdeniz-gida.git", githubAuthorized: true }])).toEqual([
      { title: "GitHub", detail: "ornek-partner/akdeniz-gida", status: "Bağlı" },
    ]);
  });
  it("shows a repository that is not authorized", () => {
    expect(githubRows([{ repositoryUrl: "https://github.com/ornek/erp/", githubAuthorized: false }])).toEqual([
      { title: "GitHub", detail: "ornek/erp", status: "Bağlı değil" },
    ]);
  });
  it("shows one empty row without projects", () => {
    expect(githubRows([])).toEqual([{ title: "GitHub", detail: "Henüz depo bağlanmadı", status: "Bağlı değil" }]);
  });
  it("links to the company module code tab", () => {
    expect(MODULE_CODE_HREF).toBe("#company-module/code");
  });
});
