import type { Person } from "../people/peopleModel";

export type HomeCard = { id: string; title: string; value: string; detail: string; href?: string };
export type HomeRequest = { stage: "New" | "Staging" | "Production"; isMine: boolean };
export type CardStatus = "loading" | "ready" | "error";

/** Liste uçları en çok `take` satır döndürür; sınıra ulaşan sayı kesin toplam değildir. */
export function countLabel(count: number, capped: boolean): string {
  return capped ? `${count}+` : String(count);
}

/** Bir veri kaynağı yüklenirken ya da yüklenemediğinde yalnız onun kartı değişir. */
export function withStatus(card: HomeCard, status: CardStatus): HomeCard {
  if (status === "error") return { ...card, value: "—", detail: "Yüklenemedi" };
  if (status === "loading") return { ...card, value: "…", detail: "Yükleniyor" };
  return card;
}

export function consultantCards(input: { pendingCount: number; pendingCapped?: boolean; myRequests: HomeRequest[] }): HomeCard[] {
  const open = input.myRequests.filter((item) => item.isMine && item.stage !== "Production").length;
  return [
    {
      id: "pending",
      title: "Taslakta bekleyen",
      value: countLabel(input.pendingCount, !!input.pendingCapped),
      detail: "ekran yayınlanmadı",
      href: "#publications",
    },
    { id: "my-requests", title: "Açık taleplerim", value: String(open), detail: `${open} yazılımcıda`, href: "#my-requests" },
  ];
}

const formatDay = (value: string) => new Intl.DateTimeFormat("tr-TR").format(new Date(value));

export function developerCards(input: { requests: HomeRequest[]; lastProductionAt: string | null }): HomeCard[] {
  const fresh = input.requests.filter((item) => item.stage === "New").length;
  const staging = input.requests.filter((item) => item.stage === "Staging").length;
  return [
    {
      id: "incoming",
      title: "Gelen talepler",
      value: String(fresh + staging),
      detail: `${fresh} yeni · ${staging} deneme ortamında`,
      href: "#incoming-requests",
    },
    {
      id: "last-production",
      title: "Son canlı yayın",
      value: input.lastProductionAt ? formatDay(input.lastProductionAt) : "Henüz yok",
      detail: input.lastProductionAt ? "canlı ortama son dağıtım" : "canlıya dağıtım yapılmadı",
      href: "#publications",
    },
  ];
}

export function adminCards(input: {
  people: Pick<Person, "effectiveRole">[];
  activeModules: number;
  publishedThisMonth: number;
  publishedCapped?: boolean;
}): HomeCard[] {
  const users = input.people.filter((item) => item.effectiveRole !== "None").length;
  const consultants = input.people.filter((item) => item.effectiveRole === "Consultant").length;
  const developers = input.people.filter((item) => item.effectiveRole === "Developer").length;
  return [
    {
      id: "studio-users",
      title: "Studio kullanıcıları",
      value: String(users),
      detail: `${consultants} danışman · ${developers} yazılımcı`,
      href: "#people",
    },
    { id: "modules", title: "Kurulu modüller", value: String(input.activeModules), detail: "etkin modül", href: "#marketplace" },
    {
      id: "published-month",
      title: "Bu ay yayın",
      value: countLabel(input.publishedThisMonth, !!input.publishedCapped),
      detail: "ekran yayını",
      href: "#publications",
    },
  ];
}

export type RecentScreen = { name: string; updatedAt: string; badge: "Taslak" | "Yayında" };

/** Danışmanın "Son çalıştıklarım" listesi, en yeni önce. Aynı ekranın taslağı ve yayını varsa en yenisi kalır. */
export function recentScreens(
  pages: { code?: string; name: string; updatedAt: string; isPublished: boolean }[],
  take = 5,
): RecentScreen[] {
  const seen = new Set<string>();
  return [...pages]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .filter((page) => {
      if (page.code === undefined) return true;
      if (seen.has(page.code)) return false;
      seen.add(page.code);
      return true;
    })
    .slice(0, take)
    .map((page) => ({ name: page.name, updatedAt: page.updatedAt, badge: page.isPublished ? "Yayında" : "Taslak" }));
}

/** Bu ayki yayın sayısı. Liste `take` sınırına ulaştı ve en eskisi hâlâ bu aydaysa sayı kesin değildir. */
export function publishedThisMonth(history: { publishedAt: string }[], now: Date, take: number): { count: number; capped: boolean } {
  const inMonth = (value: string) => {
    const date = new Date(value);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  };
  const count = history.filter((item) => inMonth(item.publishedAt)).length;
  const oldest = history.reduce<string | null>(
    (min, item) => (min === null || Date.parse(item.publishedAt) < Date.parse(min) ? item.publishedAt : min),
    null,
  );
  return { count, capped: history.length >= take && oldest !== null && inMonth(oldest) };
}

export function lastProductionAt(deployments: { status: string; completedAt: string | null }[]): string | null {
  let latest: string | null = null;
  for (const item of deployments)
    if (item.status === "Succeeded" && item.completedAt && (latest === null || Date.parse(item.completedAt) > Date.parse(latest)))
      latest = item.completedAt;
  return latest;
}

export type Shortcut = { id: string; label: string; href?: string };

/** Danışmanın kısayolları; `href` yoksa yeni talep penceresi açılır. */
export const consultantShortcuts: Shortcut[] = [
  { id: "new-screen", label: "Yeni ekran oluştur", href: "#screens/pages" },
  { id: "add-rule", label: "Belgeye kural ekle", href: "#rules" },
  { id: "ask-developer", label: "Yazılımcıdan bir şey iste" },
];
