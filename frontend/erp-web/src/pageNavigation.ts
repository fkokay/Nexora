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

// ---- Silinen kayıt: kartını gösteren sekmeler kapanır ----

/** Silinen kayıtların kimlikleri. `from` silmeyi yapan sekmedir (yoksa etkin sekme); o sekme kapanmaz, `closeSource` değilse. */
export type RecordsDeletedDetail = {
  ids: readonly string[];
  from?: string;
  /** Silen sekme kaydın kendi kartıdır (İşlem Çubuğu "Sil"): kaydı gösteriyorsa o da kapanır. */
  closeSource?: boolean;
};
export const RECORDS_DELETED_EVENT = "nexora:records-deleted";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Kayıt kimliği olarak eşlenen değer (GUID); `accountType=Bank` gibi parametreler hiçbir silmeyle eşleşmez. */
export const recordIdOf = (value: unknown): string | null =>
  typeof value === "string" && GUID.test(value.trim()) ? value.trim().toLowerCase() : null;

/** Silme başarılı olunca çağrılır: çalışma alanı bu kayıtları gösteren sekmeleri kapatır (useWorkspaceTabs dinler). */
export function publishRecordsDeleted(detail: RecordsDeletedDetail) {
  const ids = [...new Set(detail.ids.map(recordIdOf).filter((id): id is string => id !== null))];
  if (ids.length === 0) return;
  window.dispatchEvent(new CustomEvent<RecordsDeletedDetail>(RECORDS_DELETED_EVENT, { detail: { ...detail, ids } }));
}

/**
 * Başarılı `DELETE` isteğinin silinen kaydı: yolun son parçası GUID ise (`/api/stock/items/{id}`). Alt kayıt silmesi
 * (`/api/stock/items/{id}/units/{unitId}`) yalnız alt kaydın kimliğini verir; hiçbir kart sekmesi onu göstermez.
 */
export function deletedRecordIdFromUrl(url: string): string | null {
  const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const last = path.slice(path.lastIndexOf("/") + 1);
  try { return recordIdOf(decodeURIComponent(last)); } catch { return null; }
}

const tabRecords = new Map<string, string>();
/**
 * Kart sekmesinin gösterdiği kayıt: parametresini okuyup silen kartlar (useTakePageParam) bunu bildirir, kayıt silinince
 * sekme kapanır. `id` boşsa (yeni kart) sekme hiçbir kaydı göstermez.
 */
export function useTabRecord(page: string | undefined, id: string | null | undefined) {
  useEffect(() => {
    const record = recordIdOf(id ?? "");
    if (!page || !record) return;
    tabRecords.set(page, record);
    return () => { if (tabRecords.get(page) === record) tabRecords.delete(page); };
  }, [page, id]);
}

/** Sekmenin gösterdiği kayıt kimlikleri: parametre değerleri (GUID) ve kartın bildirdiği kayıt. */
export function tabRecordIds(page: string): Set<string> {
  const ids = new Set<string>();
  for (const value of Object.values(pageParamsOf(page))) {
    const id = recordIdOf(value);
    if (id) ids.add(id);
  }
  const record = tabRecords.get(page);
  if (record) ids.add(record);
  return ids;
}
