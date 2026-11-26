import { describe, expect, it } from "vitest";
import { inviteErrorMessage, isKnownInviteError, personRoleLabel, sameEmail, studioRoleOptions, type Person } from "./peopleModel";

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
  it("explains a missing, expired or invalid company license", () => {
    expect(inviteErrorMessage("license.required")).toBe("Firmanın etkin bir şirket lisansı yok. Kişi eklemek için önce lisansı etkinleştirin.");
    expect(inviteErrorMessage("license.expired")).toBe("Firmanın şirket lisansının süresi dolmuş. Kişi eklemek için lisansı yenileyin.");
    expect(inviteErrorMessage("license.invalid")).toBe("Firmanın şirket lisansı geçersiz. Kişi eklemek için geçerli bir lisans etkinleştirin.");
  });
  it("explains a concurrent membership change", () => {
    expect(inviteErrorMessage("membership.conflict")).toBe("Üyelik aynı anda başka biri tarafından değiştirildi. Listeyi yenileyip yeniden deneyin.");
  });
});

describe("isKnownInviteError", () => {
  it("knows every invite error code the Platform API returns", () => {
    for (const code of ["license.user_limit", "license.required", "license.expired", "license.invalid", "membership.exists", "membership.conflict"])
      expect(isKnownInviteError(code), code).toBe(true);
  });
  it("leaves other codes to the generic message", () => {
    expect(isKnownInviteError(undefined)).toBe(false);
    expect(isKnownInviteError("something.else")).toBe(false);
  });
});

describe("sameEmail", () => {
  it("compares e-mails without Turkish casing", () => {
    expect(sameEmail("Info@firma.com ", "info@firma.com")).toBe(true);
    expect(sameEmail("a@firma.com", "b@firma.com")).toBe(false);
  });
});
