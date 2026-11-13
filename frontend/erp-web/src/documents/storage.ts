export type DocScope = { tenantId: string; userId: string; docKey: string }
export type SavedView = { id: string; name: string; tab: string; query: string; from: string; to: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const keyOf = (scope: DocScope, kind: string) => `aierp.docs.${scope.tenantId}.${scope.userId}.${scope.docKey}.${kind}`

function defaultStore(): Store | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function read<T>(scope: DocScope, kind: string, fallback: T, valid: (value: unknown) => boolean, store: Store | null): T {
  try {
    const raw = store?.getItem(keyOf(scope, kind))
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return valid(parsed) ? parsed as T : fallback
  } catch { return fallback }
}

function write(scope: DocScope, kind: string, value: unknown, store: Store | null) {
  try { store?.setItem(keyOf(scope, kind), JSON.stringify(value)) } catch { /* depo dolu ya da kapalı: ekran çalışmaya devam eder */ }
}

const isView = (value: unknown): value is SavedView =>
  typeof value === 'object' && value !== null && ['id', 'name', 'tab', 'query', 'from', 'to'].every(key => typeof (value as Record<string, unknown>)[key] === 'string')

export const loadViews = (scope: DocScope, store = defaultStore()) =>
  read<SavedView[]>(scope, 'views', [], value => Array.isArray(value) && value.every(isView), store)
export const saveViews = (scope: DocScope, views: SavedView[], store = defaultStore()) => write(scope, 'views', views, store)

export const loadHiddenColumns = (scope: DocScope, store = defaultStore()) =>
  read<string[]>(scope, 'columns', [], value => Array.isArray(value) && value.every(item => typeof item === 'string'), store)
export const saveHiddenColumns = (scope: DocScope, keys: string[], store = defaultStore()) => write(scope, 'columns', keys, store)

export const loadDraft = <T,>(scope: DocScope, store = defaultStore()) =>
  read<T | null>(scope, 'draft', null, value => typeof value === 'object' && value !== null, store)
export const saveDraft = <T,>(scope: DocScope, draft: T, store = defaultStore()) => write(scope, 'draft', draft, store)
export function clearDraft(scope: DocScope, store = defaultStore()) {
  try { store?.removeItem(keyOf(scope, 'draft')) } catch { /* yok sayılır */ }
}
