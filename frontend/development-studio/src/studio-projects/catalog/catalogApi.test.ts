import { beforeEach, describe, expect, it, vi } from 'vitest'

const authorizedFetch = vi.fn()
vi.mock('../../api', () => ({ authorizedFetch: (...args: unknown[]) => authorizedFetch(...args) }))

import { CatalogApiError, activateRelease, runPreview } from './catalogApi'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('katalog istemcisi', () => {
  beforeEach(() => authorizedFetch.mockReset())

  it('activateRelease_preserves_breaking_pages_on_409', async () => {
    const pages = [{ code: 'p1', name: 'Sayfa', references: ['cariler'], error: 'x' }]
    authorizedFetch.mockResolvedValue(json(409, { error: 'Etkinleştirme engellendi.', pages }))
    const error = await activateRelease('tok', 'r1', null).catch(e => e)
    expect(error).toBeInstanceOf(CatalogApiError)
    expect(error).toMatchObject({ status: 409, message: 'Etkinleştirme engellendi.', pages })
    expect(authorizedFetch.mock.calls[0][0]).toBe('/api/custom-pages/catalog/releases/r1/activate')
  })

  it('runPreview_sends_only_parameters', async () => {
    authorizedFetch.mockResolvedValue(json(200, { columns: [], rows: [], rowCount: 0, truncated: false }))
    await runPreview('tok', 'p1', 'cariler', { a: 1 })
    const [url, token, init] = authorizedFetch.mock.calls[0]
    expect(url).toBe('/api/custom-pages/catalog/previews/p1/items/cariler/run')
    expect(token).toBe('tok')
    expect(JSON.parse(init.body)).toEqual({ parameters: { a: 1 } })
  })
})
