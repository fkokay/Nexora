import { authenticatedFetch } from "../authApi";

// Belge modeli (`GET /api/document-models/{kod}`): Belge panelinin işaretlediği başlık alanları ve satır kolonları buradan gelir.
export type DocumentModelField = { code: string; label: string; type: string; required: boolean; readOnly: boolean };
export type DocumentModelColumn = { code: string; label: string; type: string; required: boolean; calculated: boolean; visibleFrom: string | null };
export type DocumentModel = {
  code: string; label: string; fields: DocumentModelField[]; lineColumns: DocumentModelColumn[];
  states: { code: string; label: string; terminal: boolean }[];
  transitions: { code: string; label: string }[];
  fills: Record<string, string[]>;
  /** "Belgeden belge" eylemleri (sonraki belgeyi yaratıp açar); modelden gelir, ayar yoktur. */
  creations: { code: string; label: string; target: string }[];
};

/** Okuma izni yoksa "forbidden", model yoksa null; öteki hatalar fırlatılır. */
export async function loadDocumentModel(code: string, token: string): Promise<DocumentModel | "forbidden" | null> {
  const response = await authenticatedFetch(`/api/document-models/${encodeURIComponent(code)}`, token);
  if (response.status === 403) return "forbidden";
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Belge modeli okunamadı (${response.status}).`);
  return parseDocumentModel(await response.json());
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const arr = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];

export function parseDocumentModel(raw: unknown): DocumentModel | null {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!body || !str(body.code)) return null;
  const fills = body.fills && typeof body.fills === "object" && !Array.isArray(body.fills)
    ? Object.fromEntries(Object.entries(body.fills as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []]))
    : {};
  return {
    code: str(body.code), label: str(body.label),
    fields: arr(body.fields).map((f) => ({ code: str(f.code), label: str(f.label), type: str(f.type), required: f.required === true, readOnly: f.readOnly === true })),
    lineColumns: arr(body.lineColumns).map((c) => ({ code: str(c.code), label: str(c.label), type: str(c.type), required: c.required === true,
      calculated: c.calculated === true, visibleFrom: typeof c.visibleFrom === "string" ? c.visibleFrom : null })),
    states: arr(body.states).map((s) => ({ code: str(s.code), label: str(s.label), terminal: s.terminal === true })),
    transitions: arr(body.transitions).map((t) => ({ code: str(t.code), label: str(t.label) })),
    fills,
    creations: arr(body.creations).map((c) => ({ code: str(c.code), label: str(c.label), target: str(c.target) })),
  };
}

/** Taslak 09'un "Önizlenen durum" seçenekleri. */
export const BELGE_PREVIEW_STATES = [{ code: "Draft", label: "Taslak" }, { code: "Open", label: "Onaylı" }, { code: "Fulfilled", label: "Sevk edildi" }] as const;
