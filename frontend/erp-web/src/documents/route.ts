import { isDocKey, type DocKey } from './definitions'

export type DocRoute =
  | { key: DocKey; view: 'list' }
  | { key: DocKey; view: 'doc'; id: string }
  | { key: DocKey; view: 'new'; sourceId?: string }

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Biçim: `#/sales-orders`, `#/sales-orders/<guid>`, `#/sales-quotes/new`, `#/sales-deliveries/new/<kaynak guid>`. */
export function parseHash(hash: string): DocRoute | null {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [key, second, third] = parts
  if (!key || !isDocKey(key) || parts.length > 3) return null
  if (!second) return { key, view: 'list' }
  if (second === 'new') {
    if (!third) return { key, view: 'new' }
    return guid.test(third) ? { key, view: 'new', sourceId: third } : null
  }
  return guid.test(second) && !third ? { key, view: 'doc', id: second } : null
}

export function buildHash(route: DocRoute): string {
  if (route.view === 'list') return `#/${route.key}`
  if (route.view === 'doc') return `#/${route.key}/${route.id}`
  return route.sourceId ? `#/${route.key}/new/${route.sourceId}` : `#/${route.key}/new`
}
