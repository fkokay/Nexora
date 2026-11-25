/**
 * Kayıtlı sayfanın yalnız doğrulanmış TenantAdmin'e açık olup olmadığı (Karar 1). Sunucudaki kaydetme kuralıyla aynıdır
 * (`QueryPageWriteAllowedAsync`): satır içi SQL (`HasInlineSqlQueries`), yazan ERP işlemi sorgusu
 * (`HasWriteOperationQueries`) ya da JavaScript taşıyan kod bileşeni (`HasCodeScript`). Katalog başvuruları
 * (`dataSource` / `action`) yalnız kod taşır; sayfa yazma izni olan herkes kaydedebilir.
 *
 * Sunucu, yönetici olmayana sorguların `sql` alanını göstermez: böyle bir sorguda `sql`, `operation`, `dataSource` ve
 * `action` yoktur ve yine satır içi SQL sayılır (sunucuda da öyle: ne işlem ne katalog başvurusu).
 */
export type OperationKindLookup = (operation: string) => "read" | "write" | undefined;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => !!value && typeof value === "object" && !Array.isArray(value);
const has = (value: Raw, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const isInlineSql = (query: unknown) => !isObject(query) || has(query, "sql")
  || (!has(query, "operation") && !has(query, "dataSource") && !has(query, "action"));

/** İşlem sorgusu ancak türü `read` ve adı bilinen bir okuma işlemiyse okuma sayılır; sınıflanamayan yazma sayılır. */
const isWriteOperation = (query: unknown, kindOf: OperationKindLookup) => {
  if (!isObject(query) || !has(query, "operation")) return false;
  const operation = query.operation;
  return !(query.kind === "read" && typeof operation === "string" && kindOf(operation) === "read");
};

const hasCodeScript = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasCodeScript);
  if (!isObject(value)) return false;
  if (value.type === "code" && isObject(value.props) && typeof value.props.javascript === "string" && value.props.javascript.trim() !== "") return true;
  return Object.values(value).some(hasCodeScript);
};

export function definitionNeedsAdmin(definitionJson: string | undefined, kindOf: OperationKindLookup): boolean {
  if (!definitionJson) return false;
  let raw: unknown;
  try { raw = JSON.parse(definitionJson); } catch { return false; }
  if (!isObject(raw)) return false;
  if (hasCodeScript(raw)) return true;
  if (raw.schemaVersion !== 2 || !Array.isArray(raw.queries)) return false;
  return raw.queries.some((query) => isInlineSql(query) || isWriteOperation(query, kindOf));
}
