import { recordIdOf } from "../pageNavigation";
import { bindingPath } from "./pageBindings";
import type { PageQueryDefinition } from "./usePageQueries";

/**
 * Silme sorgusunun sildiği kaydın kimliği (çalışma alanı o kaydı gösteren sekmeleri kapatır). Yalnız kayıt kimliği sayılır:
 * adı `id` olan ya da bir `.id` alanına (ör. `{{liste.seciliSatir.id}}`) bağlı parametre; yoksa tek GUID değerli parametre.
 * Sayfanın kendi kaydına (`{{sayfa.…}}`) bağlı parametre yalnız kaydın kendi silmesinde (`recordDelete`, İşlem Çubuğu "Sil")
 * sayılır: kartın satır silmesi (`documentId={{sayfa.parametre.id}}` + `lineId`) belgeyi silinmiş saymaz.
 */
export function deletedRecordIds(query: PageQueryDefinition, values: Record<string, unknown>, options?: { recordDelete?: boolean }): string[] {
  if (query.kind !== "delete") return [];
  const valued = query.parameters
    .map((parameter) => ({ parameter, path: bindingPath(parameter.binding) ?? "", id: recordIdOf(values[parameter.name]) }))
    .filter((entry): entry is { parameter: PageQueryDefinition["parameters"][number]; path: string; id: string } => entry.id !== null)
    .filter(({ path }) => options?.recordDelete === true || !/^sayfa\./i.test(path));
  const named = valued.filter(({ parameter, path }) => parameter.name.toLowerCase() === "id" || /(^|\.)id$/i.test(path));
  const picked = named.length > 0 ? named : valued.length === 1 ? valued : [];
  return [...new Set(picked.map(({ id }) => id))];
}
