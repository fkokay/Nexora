// Sayfa parametresiyle kayıt açma (dataTable `openParam`): sekme `sayfa.parametre.<openParam>` ile açıldığında tablo o
// kimliği seçer ve `rowOpenAction` düğmesini çalıştırır (ör. Cari Hesaplar › Faturalar'dan bir faturanın detayı).
// Değer bağlama değil, parametre adıdır. Studio tuvali bu davranışı çalıştırmaz; yalnız denetçide yazılır.
import type { PageParams } from "../pageNavigation";

export const OPEN_PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;

type Component = { id: string; type: string; name?: string; props?: Record<string, unknown> };
export type OpenParamTarget<T extends Component = Component> = { table: T; button: string; param: string; value: string };

/** Parametresi dolu, adlı ve `rowOpenAction` düğmesi olan tablolar (tanım sırasıyla). */
export function openParamTargets<T extends Component>(components: readonly T[], params: PageParams): OpenParamTarget<T>[] {
  const targets: OpenParamTarget<T>[] = [];
  for (const table of components) {
    if (table.type !== "dataTable" || !table.name) continue;
    const param = typeof table.props?.openParam === "string" ? table.props.openParam.trim() : "";
    const button = typeof table.props?.rowOpenAction === "string" ? table.props.rowOpenAction.trim() : "";
    const value = OPEN_PARAM_NAME.test(param) && Object.prototype.hasOwnProperty.call(params, param) ? params[param].trim() : "";
    if (button && value) targets.push({ table, button, param, value });
  }
  return targets;
}

/** Açılacak satır: yüklü satırlarda kimliği eşleşen satır, yoksa yalnız `id` taşıyan kök seçim (detay `getir` sorgusundan okur). */
export function openParamRow(rows: readonly Record<string, unknown>[] | undefined, value: string): Record<string, unknown> {
  return rows?.find((row) => row.id !== null && row.id !== undefined && String(row.id).toLowerCase() === value.toLowerCase()) ?? { id: value };
}

/** Aynı parametrelerle yapılan gezinme (sekme yeniden kurulmaz): kayıt yeniden açılmalı. */
export function sameOpenRequest(requested: PageParams, current: PageParams): boolean {
  const keys = Object.keys(requested);
  return keys.length === Object.keys(current).length && keys.every((key) => Object.prototype.hasOwnProperty.call(current, key) && requested[key] === current[key]);
}
