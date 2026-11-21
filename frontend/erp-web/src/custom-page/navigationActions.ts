// Gezinme eylemleri (Bağlantıya git, ERP ekranı aç, Sayfa aç): veri yazmazlar; yalnız adres ya da çalışma sekmesi açarlar.
import { confirmDialog } from "../confirmDialog";
import { openWorkspacePage } from "../pageNavigation";
import { interpolate, interpolateWith, literalText, type PageScope } from "./pageBindings";

export const NAVIGATION_ACTION_TYPES = ["link", "erpPage", "page"] as const;
export type NavigationActionType = (typeof NAVIGATION_ACTION_TYPES)[number];
export const isNavigationType = (value: unknown): value is NavigationActionType =>
  typeof value === "string" && (NAVIGATION_ACTION_TYPES as readonly string[]).includes(value);

/** Sunucudaki LinkPrefix ile aynı: http(s), sabit sunucu adı ve isteğe bağlı kapı; ardından metin sonu ya da / ? #. */
const LINK_PREFIX = /^(https?:)\/\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::[0-9]{1,5})?)([/?#]|$)/i;
// eslint-disable-next-line no-control-regex
const UNSAFE_LITERAL = /[\s\\\u0000-\u001f\u007f]/;
const PAGE_KEY = /^[a-z0-9-]{1,39}$/;
const CUSTOM_PAGE_CODE = /^[A-Za-z0-9_-]{1,40}$/;
const PAGE_PARAM = /^([a-z][a-zA-Z0-9]{0,31})=(.{0,200})$/;
const MAX_PAGE_PARAMS = 6;
const MAX_PARAM_VALUE = 500;

/**
 * Bağlantı şablonunu çözer: her bağlanan değer encodeURIComponent ile kodlanır; sonuç yeniden ayrıştırılır ve şema ile
 * sunucu adı şablonun sabit önekindekiyle aynı değilse (ya da kullanıcı bilgisi varsa) null döner.
 */
export function linkUrl(template: string, scope: PageScope): string | null {
  const first = template.indexOf("{{");
  const match = LINK_PREFIX.exec(first < 0 ? template : template.slice(0, first));
  if (!match || (first >= 0 && match[3] === "")) return null;
  if (UNSAFE_LITERAL.test(literalText(template))) return null;
  let url: URL;
  let expected: URL;
  try {
    url = new URL(interpolateWith(template, scope, encodeURIComponent));
    expected = new URL(`${match[1]}//${match[2]}`);
  } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.username || url.password) return null;
  return url.href;
}

/** "ad=değer" öğeleri: en çok 6, adı geçerli ve ilk geçen; değerler bağlamayla çözülür. */
export function pageParamValues(items: unknown, scope: PageScope): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(items)) return result;
  for (const item of items.slice(0, MAX_PAGE_PARAMS)) {
    const match = typeof item === "string" ? PAGE_PARAM.exec(item) : null;
    if (!match || Object.prototype.hasOwnProperty.call(result, match[1])) continue;
    result[match[1]] = interpolate(match[2], scope).slice(0, MAX_PARAM_VALUE);
  }
  return result;
}

export type NavigationTarget =
  | { kind: "link"; url: string; newTab: boolean }
  | { kind: "workspace"; page: string; params: Record<string, string>; replace: boolean };

/** Düğmenin (bağlanmamış) özelliklerinden açılacak hedef; geçersizse null. Bağlantı varsayılan yeni sekme, diğerleri aynı sekme. */
export function navigationTarget(props: Record<string, unknown>, scope: PageScope): NavigationTarget | null {
  const target = props.target === "newTab" || props.target === "sameTab" ? props.target : undefined;
  if (props.actionType === "link") {
    const url = typeof props.href === "string" ? linkUrl(props.href, scope) : null;
    return url ? { kind: "link", url, newTab: target !== "sameTab" } : null;
  }
  if (props.actionType === "erpPage") {
    if (typeof props.pageKey !== "string" || !PAGE_KEY.test(props.pageKey)) return null;
    // `params` ("ad=değer", "Sayfa aç" ile aynı biçim) ekranın sayfa parametreleridir (ör. customerId); `queryText` `q` olarak gider.
    const q = typeof props.queryText === "string" ? interpolate(props.queryText, scope).trim().slice(0, MAX_PARAM_VALUE) : "";
    const params = pageParamValues(props.params, scope);
    return { kind: "workspace", page: props.pageKey, params: q ? { ...params, q } : params, replace: target !== "newTab" };
  }
  if (props.actionType === "page") {
    const code = typeof props.pageCode === "string" ? props.pageCode : "";
    const page = code.startsWith("@") ? (PAGE_KEY.test(code.slice(1)) ? code.slice(1) : null) : CUSTOM_PAGE_CODE.test(code) ? `custom-page:${code}` : null;
    return page ? { kind: "workspace", page, params: pageParamValues(props.params, scope), replace: target !== "newTab" } : null;
  }
  return null;
}

export const INVALID_LINK = "Bağlantı adresi geçersiz.";
export const INVALID_SCREEN = "Açılacak ekran bulunamadı.";

/**
 * Gezinme eylemini çalıştırır: `confirmEnabled` ise önce sorar, hedefi onaydan sonraki kapsamla çözer. Bağlantı yeni sekmede
 * `noopener,noreferrer` ile açılır; ERP ekranı ve sayfa çalışma alanına istenir (`from`: bu sayfanın sekme anahtarı).
 * Hata metni ya da null döner.
 */
export async function runNavigation(props: Record<string, unknown>, scope: () => PageScope, from?: string,
  options?: { refreshTarget?: boolean }): Promise<string | null> {
  if (props.confirmEnabled === true) {
    const text = typeof props.confirmText === "string" ? interpolate(props.confirmText, scope()).trim() : "";
    const confirmed = await confirmDialog({ title: text || "Devam edilsin mi?", confirmLabel: "Devam", cancelLabel: "Vazgeç" });
    if (!confirmed) return null;
  }
  const target = navigationTarget(props, scope());
  if (!target) return props.actionType === "link" ? INVALID_LINK : INVALID_SCREEN;
  if (target.kind === "link") {
    if (target.newTab) window.open(target.url, "_blank", "noopener,noreferrer");
    else window.location.assign(target.url);
    return null;
  }
  openWorkspacePage({ page: target.page, params: target.params, replace: target.replace, from, ...(options?.refreshTarget ? { refresh: true } : {}) });
  return null;
}
