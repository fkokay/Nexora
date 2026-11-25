import { authorizedFetch } from '../../api'

export type BreakingPage = { code: string; name: string; references: string[]; error?: string }
export type CatalogRelease = {
  id: string; version: string; status: string; bundleSha256: string
  sourceRepository: string | null; sourceCommit: string | null; sourcePath?: string | null
  createdAt: string; activatedAt: string | null
}
export type ActiveCatalog = { releaseId: string | null; version: string | null; dataSources: unknown[]; actions: unknown[]; invalidItems?: unknown[] }
export type PreviewResult = {
  columns: { code: string; label: string; dataType: string }[]
  rows: unknown[][] | Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}
export type NewRelease = { version: string; bundle: unknown; sourceRepository: string | null; sourceCommit: string | null; sourcePath: string | null }

export class CatalogApiError extends Error {
  status: number
  pages?: BreakingPage[]
  constructor(status: number, message: string, pages?: BreakingPage[]) {
    super(message)
    this.name = 'CatalogApiError'
    this.status = status
    this.pages = pages
  }
}

// api() yalnız Error(message) fırlatır; 409 kırılma yanıtındaki `pages` kaybolmasın diye
// yanıt burada, aynı oturum yenileme mantığını taşıyan authorizedFetch ile okunur.
async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(url, token, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string; pages?: BreakingPage[] } | null
    const message = body?.error || body?.detail || (response.status === 403 ? 'Bu işlem için yetkiniz yok.' : body?.title) || `İstek başarısız (${response.status}).`
    throw new CatalogApiError(response.status, message, Array.isArray(body?.pages) ? body.pages : undefined)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const listReleases = (token: string) => call<CatalogRelease[]>(token, '/api/custom-pages/catalog/releases')
export const activeCatalog = (token: string) => call<ActiveCatalog>(token, '/api/custom-pages/catalog')
export const createRelease = (token: string, release: NewRelease) =>
  call<{ id: string; version: string; status: string; bundleSha256: string }>(token, '/api/custom-pages/catalog/releases', post(release))
export const activateRelease = (token: string, id: string, expectedActiveReleaseId: string | null) =>
  call<unknown>(token, `/api/custom-pages/catalog/releases/${encodeURIComponent(id)}/activate`, post({ expectedActiveReleaseId }))
export const storePreview = (token: string, bundle: unknown) =>
  call<{ id: string }>(token, '/api/custom-pages/catalog/previews', post({ bundle }))
export const runPreview = (token: string, id: string, code: string, parameters: Record<string, unknown>) =>
  call<PreviewResult>(token, `/api/custom-pages/catalog/previews/${encodeURIComponent(id)}/items/${encodeURIComponent(code)}/run`, post({ parameters }))
