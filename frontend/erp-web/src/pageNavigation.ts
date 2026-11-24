import { useEffect, useRef, useSyncExternalStore } from "react";

/** Bir çalışma sekmesine "Sayfa aç" eylemiyle verilen parametreler (`{{sayfa.parametre.<ad>}}`). */
export type PageParams = Readonly<Record<string, string>>;
/** Özel sayfanın düğmesinden çalışma alanına: `page` sekme anahtarı, `replace` geçerli sekmenin (`from`) yerine açar. */
export type WorkspaceOpenRequest = {
  page: string; params: PageParams; replace: boolean; from?: string;
  /** Hedef sekme açıksa açılış sorgularını yeniler (ör. kayıttan sonra listeye dönüş). */
  refresh?: boolean;
  /** Sistem sayfası etkin olsa bile (geçerli sayfa olsa da) hedefin eski (yerleşik) ekranını açar ("Eski ekranda aç" ile aynı; erpPage `legacyScreen`). */
  legacy?: boolean;
};

export const OPEN_PAGE_EVENT = "nexora:open-page";

const EMPTY: PageParams = Object.freeze({});
const store = new Map<string, PageParams>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

const sameParams = (a: PageParams, b: PageParams) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
};

/**
 * Sekme anahtarının parametrelerini değiştirir (bellekte; sekmeler geri yüklenince parametreler yoktur). Aynı parametreler
 * aynı nesneyi korur: sekme yeniden çizilmez. Farklı parametreler yeni nesnedir (sayfa yeni kayıtla baştan başlar).
 */
export function setPageParams(page: string, params: PageParams) {
  const current = store.get(page) ?? EMPTY;
  if (sameParams(current, params)) return;
  store.set(page, Object.keys(params).length === 0 ? EMPTY : Object.freeze({ ...params }));
  for (const listener of [...listeners]) listener();
}

export const pageParamsOf = (page: string | undefined): PageParams => (page ? store.get(page) ?? EMPTY : EMPTY);

/** Okunan tek bir parametreyi siler; diğer parametreler kendi okuyucuları için kalır (ör. `customerId` + `invoiceId`). */
export function dropPageParam(page: string, name: string) {
  const current = pageParamsOf(page);
  if (!Object.prototype.hasOwnProperty.call(current, name)) return;
  setPageParams(page, Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)));
}

/** Sekmenin güncel parametreleri; açık sekme yeni parametrelerle yeniden açılınca yeniden çizilir. */
export function usePageParams(page: string | undefined): PageParams {
  return useSyncExternalStore(subscribe, () => pageParamsOf(page), () => EMPTY);
}

/**
 * Sekmenin tek bir parametresini (ör. kart ekranına gelen `customerId`) bir kez okur ve yalnız onu siler; diğer parametreler
 * kalır. İlk çizimde ve açık sekme yeni parametreyle yeniden açıldığında `onValue` çağrılır (aynı değer silindiği için yeniden
 * okunur). `page` undefined ise okuyucu kapalıdır (ör. bileşen başka bir sekme için çizilmiştir).
 */
export function useTakePageParam(page: string | undefined, name: string, onValue: (value: string) => void) {
  const params = usePageParams(page);
  const handler = useRef(onValue);
  handler.current = onValue;
  useEffect(() => {
    if (!page) return;
    // Çizimin anlık görüntüsü değil depo okunur: yeniden çalışan efekt (StrictMode) aynı değeri iki kez vermemeli.
    const value = pageParamsOf(page)[name] ?? "";
    if (!value) return;
    dropPageParam(page, name);
    handler.current(value);
  }, [page, name, params]);
}

/** Parametreleri hedef sekmeye yazar, sonra çalışma alanından sekmeyi açmasını ister (useWorkspaceTabs dinler). */
export function openWorkspacePage(request: WorkspaceOpenRequest) {
  setPageParams(request.page, request.params);
  window.dispatchEvent(new CustomEvent<WorkspaceOpenRequest>(OPEN_PAGE_EVENT, { detail: request }));
}
