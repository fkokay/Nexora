import { authenticatedFetch } from "../authApi";

export type CatalogColumn = { code: string; label: string; type: string; key: boolean };
export type CatalogParameter = { name: string; type: string };
export type CatalogDataSource = {
  code: string; label: string; source: "sql" | "erpOperation"; erpOperation: string | null;
  parameters: CatalogParameter[]; columns: CatalogColumn[]; opens: string | null;
};
export type CatalogAction = {
  code: string; label: string; kind: "insert" | "update" | "delete"; target: "row" | "page" | "bulk";
  source: "sql" | "erpOperation"; erpOperation: string | null; parameters: CatalogParameter[]; confirmText: string | null;
};
export type ActiveCatalog = { version: string; dataSources: CatalogDataSource[]; actions: CatalogAction[] };

type Raw = Record<string, unknown>;
const arr = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const params = (value: unknown): CatalogParameter[] =>
  arr(value).map((p) => ({ name: str(p.name) ?? "", type: str(p.type) ?? "" }));

/** Etkin katalog sürümü; sürüm yoksa (404 ya da boş sürüm) null. SQL metni gerekmez, okunmaz. */
export async function loadCatalog(token: string): Promise<ActiveCatalog | null> {
  const response = await authenticatedFetch("/api/custom-pages/catalog", token);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Katalog okunamadı (${response.status}).`);
  const body = (await response.json()) as Raw | null;
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
  };
}
