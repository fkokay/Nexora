import { useSyncExternalStore } from "react";

/** Bir çalışma sekmesine "Sayfa aç" eylemiyle verilen parametreler (`{{sayfa.parametre.<ad>}}`). */
export type PageParams = Readonly<Record<string, string>>;
/** Özel sayfanın düğmesinden çalışma alanına: `page` sekme anahtarı, `replace` geçerli sekmenin (`from`) yerine açar. */
export type WorkspaceOpenRequest = { page: string; params: PageParams; replace: boolean; from?: string };

export const OPEN_PAGE_EVENT = "nexora:open-page";

const EMPTY: PageParams = Object.freeze({});
const store = new Map<string, PageParams>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Sekme anahtarının parametrelerini değiştirir (bellekte; sekmeler geri yüklenince parametreler yoktur). */
export function setPageParams(page: string, params: PageParams) {
  store.set(page, Object.keys(params).length === 0 ? EMPTY : Object.freeze({ ...params }));
  for (const listener of [...listeners]) listener();
}

export const pageParamsOf = (page: string | undefined): PageParams => (page ? store.get(page) ?? EMPTY : EMPTY);

/** Sekmenin güncel parametreleri; açık sekme yeni parametrelerle yeniden açılınca yeniden çizilir. */
export function usePageParams(page: string | undefined): PageParams {
  return useSyncExternalStore(subscribe, () => pageParamsOf(page), () => EMPTY);
}

/** Parametreleri hedef sekmeye yazar, sonra çalışma alanından sekmeyi açmasını ister (useWorkspaceTabs dinler). */
export function openWorkspacePage(request: WorkspaceOpenRequest) {
  setPageParams(request.page, request.params);
  window.dispatchEvent(new CustomEvent<WorkspaceOpenRequest>(OPEN_PAGE_EVENT, { detail: request }));
}
