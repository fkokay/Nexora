export type EffectiveRole = "Admin" | "Developer" | "Consultant" | "None";

/** `/studio/people` satırı. */
export type Person = {
  userId: string;
  displayName: string;
  email: string;
  membershipRole: string;
  studioRole: string | null;
  effectiveRole: EffectiveRole;
};

export type StudioRoleOption = { value: string | null; label: string };

export const studioRoleOptions: StudioRoleOption[] = [
  { value: null, label: "Varsayılan" },
  { value: "Consultant", label: "Danışman" },
  { value: "Developer", label: "Yazılımcı" },
  { value: "None", label: "Studio'ya erişimi yok" },
];

const effectiveLabels: Record<EffectiveRole, string> = {
  Admin: "Yönetici",
  Developer: "Yazılımcı",
  Consultant: "Danışman",
  None: "Studio'ya erişimi yok",
};

export function personRoleLabel(p: Person): string {
  if (p.effectiveRole === "Admin") return "Yönetici";
  const label = effectiveLabels[p.effectiveRole] ?? p.effectiveRole;
  return p.studioRole === null ? `${label} (varsayılan)` : label;
}

/** Platform API'nin üye ekleme hata kodları; kod yoksa aday bulunamamıştır. */
export function inviteErrorMessage(code?: string): string {
  if (code === "license.user_limit") return "Lisansınızın kullanıcı sınırına ulaşıldı.";
  if (code === "membership.exists") return "Bu kişi zaten firmada.";
  return "Bu e-postayla kayıtlı bir Nexora kullanıcısı yok.";
}

/** `<select>` değerleri metindir; boş metin "Varsayılan" (null) demektir. */
export const roleToSelect = (value: string | null) => value ?? "";
export const roleFromSelect = (value: string): string | null => (value === "" ? null : value);
