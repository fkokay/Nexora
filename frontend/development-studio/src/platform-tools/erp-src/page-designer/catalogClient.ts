import { authenticatedFetch } from "../authApi";

export type CatalogColumn = { code: string; label: string; type: string; key: boolean; longText: boolean; required: boolean; maxLength: number | null };
export type CatalogParameter = { name: string; type: string };
export type CatalogDataSource = {
  code: string; label: string; source: "sql" | "erpOperation"; erpOperation: string | null;
  parameters: CatalogParameter[]; columns: CatalogColumn[]; opens: string | null;
};
export type CatalogAction = {
  code: string; label: string; kind: "insert" | "update" | "delete"; target: "row" | "page" | "bulk";
  source: "sql" | "erpOperation"; erpOperation: string | null; parameters: CatalogParameter[]; confirmText: string | null;
};
export type CatalogSettingType = "text" | "number" | "bool" | "choice";
export type CatalogComponentSetting = { name: string; label: string; type: CatalogSettingType; options: string[]; default: string | number | boolean | null };
/** Yazılımcının yayınladığı bileşen; CSS ve JavaScript Studio'ya gelmez, okunmaz. */
export type CatalogComponent = { code: string; label: string; description: string | null; height: number; settings: CatalogComponentSetting[] };
/** `components` eski sunucuda gelmez; `parseCatalog` her zaman doldurur (boş dizi). */
export type ActiveCatalog = { version: string; dataSources: CatalogDataSource[]; actions: CatalogAction[]; components?: CatalogComponent[] };

type Raw = Record<string, unknown>;
const arr = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const params = (value: unknown): CatalogParameter[] =>
  arr(value).map((p) => ({ name: str(p.name) ?? "", type: str(p.type) ?? "" }));

const SETTING_TYPES: CatalogSettingType[] = ["text", "number", "bool", "choice"];
/** Varsayılan türüne uymuyorsa (ya da seçeneklerde yoksa) null. */
function settingDefault(type: CatalogSettingType, options: string[], value: unknown): string | number | boolean | null {
  if (type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (type === "bool") return typeof value === "boolean" ? value : null;
  if (type === "choice") return typeof value === "string" && options.includes(value) ? value : null;
  return typeof value === "string" ? value : null;
}
const components = (value: unknown): CatalogComponent[] => arr(value).filter((c) => str(c.code)).map((c) => ({
  code: str(c.code)!, label: str(c.label) ?? "", description: str(c.description),
  height: typeof c.height === "number" && Number.isFinite(c.height) ? c.height : 240,
  settings: arr(c.settings).filter((s) => str(s.name)).map((s) => {
    const type = SETTING_TYPES.find((t) => t === s.type) ?? "text";
    const options = type === "choice" && Array.isArray(s.options) ? s.options.filter((o): o is string => typeof o === "string") : [];
    return { name: str(s.name)!, label: str(s.label) ?? "", type, options, default: settingDefault(type, options, s.default) };
  }),
}));

/** Etkin katalog sürümü; sürüm yoksa (404 ya da boş sürüm) null. SQL metni gerekmez, okunmaz. */
export async function loadCatalog(token: string): Promise<ActiveCatalog | null> {
  const response = await authenticatedFetch("/api/custom-pages/catalog", token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Katalog okunamadı (${response.status}).`);
  return parseCatalog((await response.json()) as unknown);
}

/** `GET /api/custom-pages/catalog` gövdesi; sürüm yoksa null. Tanınmayan değerler güvenli varsayılana düşer. */
export function parseCatalog(raw: unknown): ActiveCatalog | null {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Raw) : null;
  const version = body ? str(body.version) : null;
  if (!body || !version) return null;
  return {
    version,
    dataSources: arr(body.dataSources).map((d) => ({
      code: str(d.code) ?? "", label: str(d.label) ?? "",
      source: d.source === "sql" ? "sql" : "erpOperation",
      erpOperation: str(d.erpOperation), parameters: params(d.parameters),
      columns: arr(d.columns).map((c) => ({
        code: str(c.code) ?? "", label: str(c.label) ?? "", type: str(c.type) ?? "", key: c.key === true,
        longText: c.longText === true, required: c.required === true, maxLength: typeof c.maxLength === "number" ? c.maxLength : null,
      })),
      opens: str(d.opens),
    })),
    actions: arr(body.actions).map((a) => ({
      code: str(a.code) ?? "", label: str(a.label) ?? "",
      kind: a.kind === "insert" || a.kind === "delete" ? a.kind : "update",
      target: a.target === "page" || a.target === "bulk" ? a.target : "row",
      source: a.source === "sql" ? "sql" : "erpOperation",
      erpOperation: str(a.erpOperation), parameters: params(a.parameters), confirmText: str(a.confirm),
    })),
    components: components(body.components),
  };
}
