import { useSyncExternalStore } from "react";

/**
 * Çalışma sekmesinin sayfanın kendisinden gelen başlığı (ör. sistem sayfasının görünen `pageTitle` başlığı: düzenlenen
 * kaydın adı). Sekme adı ve sayfa yolu bunu kullanır; başlık yoksa sekmenin sabit adı geçerlidir. Bellekte tutulur ve
 * sekme listesiyle birlikte saklanmaz (kayıt adı oturum deposuna yazılmaz).
 */
export type WorkspacePageTitles = Readonly<Record<string, string>>;

const EMPTY: WorkspacePageTitles = Object.freeze({});
let titles: WorkspacePageTitles = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Sekmenin başlığını yazar; boş ya da null başlık kaldırır (sekme sabit adına döner). */
export function setWorkspacePageTitle(tabId: string, title: string | null) {
  const next = title?.trim() ?? "";
  if ((titles[tabId] ?? "") === next) return;
  const rest = Object.fromEntries(Object.entries(titles).filter(([key]) => key !== tabId));
  titles = Object.freeze(next ? { ...rest, [tabId]: next } : rest);
  for (const listener of [...listeners]) listener();
}

export const workspacePageTitles = (): WorkspacePageTitles => titles;

export function useWorkspacePageTitles(): WorkspacePageTitles {
  return useSyncExternalStore(subscribe, workspacePageTitles, () => EMPTY);
}

/** Sekmelerin gösterilen adları: sayfanın başlığı varsa sabit adın yerine geçer; yoksa sekme olduğu gibi kalır. */
export function withPageTitles<T extends { id: string; label: string }>(tabs: readonly T[], pageTitles: WorkspacePageTitles): T[] {
  return tabs.map((tab) => pageTitles[tab.id] && pageTitles[tab.id] !== tab.label ? { ...tab, label: pageTitles[tab.id] } : tab);
}
