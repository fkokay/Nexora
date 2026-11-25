import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { RoleSwitcher } from "./RoleSwitcher";

describe("RoleSwitcher", () => {
  it("RoleSwitcher renders nothing for a single role", () => {
    expect(renderToString(<RoleSwitcher held={["consultant"]} active="consultant" onChange={() => {}} />)).toBe("");
    expect(renderToString(<RoleSwitcher held={[]} active="consultant" onChange={() => {}} />)).toBe("");
  });

  it("RoleSwitcher marks the active role", () => {
    const html = renderToString(
      <RoleSwitcher held={["admin", "developer", "consultant"]} active="developer" onChange={() => {}} />,
    );
    expect(html).toContain("Danışman");
    expect(html).toContain("Yazılımcı");
    expect(html).toContain("Yönetici");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Yazılımcı</);
  });
});
