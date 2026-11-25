import { describe, expect, it } from "vitest";
import { inviteErrorMessage, personRoleLabel, studioRoleOptions, type Person } from "./peopleModel";

const base: Person = {
  userId: "u1",
  displayName: "Ayşe Yılmaz",
  email: "ayse@example.com",
  membershipRole: "TenantUser",
  studioRole: null,
  effectiveRole: "Consultant",
};

describe("studioRoleOptions", () => {
  it("lists the four choices in order", () => {
    expect(studioRoleOptions).toEqual([
      { value: null, label: "Varsayılan" },
      { value: "Consultant", label: "Danışman" },
      { value: "Developer", label: "Yazılımcı" },
      { value: "None", label: "Studio'ya erişimi yok" },
    ]);
  });
});

describe("personRoleLabel", () => {
  it("shows Yönetici for an admin", () => {
    expect(personRoleLabel({ ...base, membershipRole: "TenantAdmin", effectiveRole: "Admin" })).toBe("Yönetici");
  });
  it("marks the default role", () => {
    expect(personRoleLabel(base)).toBe("Danışman (varsayılan)");
  });
  it("shows an explicitly chosen role as is", () => {
    expect(personRoleLabel({ ...base, studioRole: "Developer", effectiveRole: "Developer" })).toBe("Yazılımcı");
  });
  it("shows no access for None", () => {
    expect(personRoleLabel({ ...base, studioRole: "None", effectiveRole: "None" })).toBe("Studio'ya erişimi yok");
  });
});

describe("inviteErrorMessage", () => {
  it("explains the license limit", () => {
    expect(inviteErrorMessage("license.user_limit")).toBe("Lisansınızın kullanıcı sınırına ulaşıldı.");
  });
  it("explains an existing member", () => {
    expect(inviteErrorMessage("membership.exists")).toBe("Bu kişi zaten firmada.");
  });
  it("explains an unknown e-mail", () => {
    expect(inviteErrorMessage()).toBe("Bu e-postayla kayıtlı bir Nexora kullanıcısı yok.");
  });
});
