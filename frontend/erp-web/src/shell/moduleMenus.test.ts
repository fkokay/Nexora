import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moduleForPage, moduleMenus, STANDALONE_PAGES, SUBROUTE_PARENTS } from './moduleMenus'
import { workbenchRailItems } from './railItems'

const routerSource = readFileSync(resolve(__dirname, '../WorkspacePageRouter.tsx'), 'utf8')
const routedPages = [...new Set([...routerSource.matchAll(/page === "([^"]+)"/g)].map((match) => match[1]))]

describe('module menus', () => {
  it('reads a non-trivial set of routed pages from the router', () => {
    expect(routedPages.length).toBeGreaterThan(60)
    expect(routedPages).toContain('inventory-stock')
  })

  it('every page key routed in WorkspacePageRouter belongs to exactly one module menu or to STANDALONE_PAGES', () => {
    const problems = routedPages.flatMap((page) => {
      const owners = moduleMenus.filter((menu) => menu.pages.includes(page)).map((menu) => menu.railId)
      const standalone = STANDALONE_PAGES.includes(page)
      const count = owners.length + (standalone ? 1 : 0)
      return count === 1 ? [] : [`${page}: ${[...owners, ...(standalone ? ['STANDALONE'] : [])].join(', ') || 'none'}`]
    })
    expect(problems).toEqual([])
  })

  it('every module page and standalone page is routed (no stale keys)', () => {
    const listed = [...moduleMenus.flatMap((menu) => menu.pages), ...STANDALONE_PAGES]
    // launcher/dashboard are rendered by App before the router is reached.
    const notRouted = listed.filter((page) => !routedPages.includes(page) && page !== 'launcher' && page !== 'dashboard')
    expect(notRouted).toEqual([])
  })

  it('every module menu railId exists in the rail items', () => {
    const railIds = workbenchRailItems.map((item) => item.id)
    expect(moduleMenus.map((menu) => menu.railId).filter((id) => !railIds.includes(id))).toEqual([])
    expect(new Set(moduleMenus.map((menu) => menu.railId)).size).toBe(moduleMenus.length)
  })

  it('each rail item opens a page of its own module', () => {
    const mismatched = workbenchRailItems
      .filter((item) => moduleMenus.some((menu) => menu.railId === item.id))
      .filter((item) => !moduleMenus.find((menu) => menu.railId === item.id)!.pages.includes(item.page))
      .map((item) => item.id)
    expect(mismatched.filter((id) => id !== 'customer-create')).toEqual([])
  })

  it('sub-routes sit in the same module as their parent screen', () => {
    const problems = Object.entries(SUBROUTE_PARENTS).filter(([child, parent]) => {
      const menu = moduleForPage(child)
      return !menu || !menu.pages.includes(parent) || parent in SUBROUTE_PARENTS
    })
    expect(problems).toEqual([])
  })

  it('moduleForPage maps screens to their rail module', () => {
    expect(moduleForPage('inventory-stock')?.railId).toBe('inventory')
    expect(moduleForPage('inventory-transfers')?.railId).toBe('warehouse')
    expect(moduleForPage('sales-requests')?.railId).toBe('purchasing')
    expect(moduleForPage('sales-order-create')?.railId).toBe('sales')
    expect(moduleForPage('finance-credit-security-create')?.railId).toBe('finance')
    expect(moduleForPage('address-definitions')?.railId).toBe('modules')
    expect(moduleForPage('customer-groups')?.railId).toBe('customers')
    expect(moduleForPage('settings')).toBeUndefined()
    expect(moduleForPage('custom-page:abc')).toBeUndefined()
  })
})
