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

/** Platform API'nin üye ekleme hata kodları (`/api/access-control/members`). */
const inviteErrors: Record<string, string> = {
  "license.user_limit": "Lisansınızın kullanıcı sınırına ulaşıldı.",
  "license.required": "Firmanın etkin bir şirket lisansı yok. Kişi eklemek için önce lisansı etkinleştirin.",
  "license.expired": "Firmanın şirket lisansının süresi dolmuş. Kişi eklemek için lisansı yenileyin.",
  "license.invalid": "Firmanın şirket lisansı geçersiz. Kişi eklemek için geçerli bir lisans etkinleştirin.",
  "membership.exists": "Bu kişi zaten firmada.",
  "membership.conflict": "Üyelik aynı anda başka biri tarafından değiştirildi. Listeyi yenileyip yeniden deneyin.",
};

/** Kodun Türkçe karşılığı var mı; yoksa ekran genel hata metnini gösterir. */
export const isKnownInviteError = (code?: string) => code !== undefined && Object.hasOwn(inviteErrors, code);

/** Üye ekleme hata metni; kod yoksa aday bulunamamıştır. */
export function inviteErrorMessage(code?: string): string {
  return (code !== undefined && Object.hasOwn(inviteErrors, code) ? inviteErrors[code] : undefined)
    ?? "Bu e-postayla kayıtlı bir Nexora kullanıcısı yok.";
}

/** `<select>` değerleri metindir; boş metin "Varsayılan" (null) demektir. */
export const roleToSelect = (value: string | null) => value ?? "";
export const roleFromSelect = (value: string): string | null => (value === "" ? null : value);

/** Sunucu e-postayı değişmez kültürle küçültür; Türkçe küçültme `I` harfini `ı` yapacağı için kullanılmaz. */
export const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
