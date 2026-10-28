const accessTokenKey = 'aierp.accessToken'
const refreshTokenKey = 'aierp.refreshToken'
const platformSessionKey = 'aierp.platformSession'

let refreshInFlight: Promise<string | null> | null = null

async function addTraceIdentifierToError(response: Response): Promise<Response> {
  if (response.ok || !(response.status === 403 || response.status === 404 || response.status >= 500)) return response

  const traceId = response.headers.get('X-Trace-Id')
  if (!traceId || !response.headers.get('Content-Type')?.toLowerCase().includes('json')) return response

  const payload = await response.clone().json().catch(() => null) as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response
  if (typeof payload.traceId !== 'string') payload.traceId = traceId

  const suffix = `İz kimliği: ${traceId}.`
  if (typeof payload.error === 'string') {
    if (!payload.error.includes(traceId)) payload.error = `${payload.error} ${suffix}`
  } else if (typeof payload.title === 'string') {
    if (!payload.title.includes(traceId)) payload.title = `${payload.title} ${suffix}`
  } else {
    payload.error = `İstek başarısız (${response.status}). ${suffix}`
  }

  const headers = new Headers(response.headers)
  headers.delete('Content-Length')
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  if (localStorage.getItem(platformSessionKey) === 'true') {
    refreshInFlight = (async () => {
      try {
        const response = await fetch('/api/auth/platform/refresh', {
          method: 'POST',
          headers: { 'X-Platform-Session': 'cookie' },
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Platform session refresh failed')
        const result = await response.json() as { accessToken: string }
        if (!result.accessToken) throw new Error('Platform refresh response was incomplete')
        localStorage.setItem(accessTokenKey, result.accessToken)
        window.dispatchEvent(new CustomEvent('aierp:token-refreshed', { detail: result.accessToken }))
        return result.accessToken
      } catch {
        expireSession()
        return null
      } finally {
        refreshInFlight = null
      }
    })()
    return refreshInFlight
  }

  const refreshToken = localStorage.getItem(refreshTokenKey)
  if (!refreshToken) return null
  refreshInFlight = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!response.ok) throw new Error('Session refresh failed')
      const result = await response.json() as { accessToken: string; refreshToken: string }
      if (!result.accessToken || !result.refreshToken) throw new Error('Session refresh response was incomplete')
      if (localStorage.getItem(refreshTokenKey) !== refreshToken) return null
      localStorage.setItem(accessTokenKey, result.accessToken)
      localStorage.setItem(refreshTokenKey, result.refreshToken)
      window.dispatchEvent(new CustomEvent('aierp:token-refreshed', { detail: result.accessToken }))
      return result.accessToken
    } catch {
      if (localStorage.getItem(refreshTokenKey) === refreshToken) expireSession()
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function expireSession() {
  localStorage.removeItem(accessTokenKey)
  localStorage.removeItem(refreshTokenKey)
}

/** Sends an ERP API request and retries once after a coordinated access-token refresh. */
export async function authenticatedFetch(url: string, token?: string, init?: RequestInit): Promise<Response> {
  const platformRequest = url.startsWith('/api/auth/platform/')
  const send = (accessToken?: string) => {
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type') && !(typeof FormData !== 'undefined' && init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    if (platformRequest) headers.set('X-Platform-Session', 'cookie')
    return fetch(url, {
      ...init,
      ...(platformRequest ? { credentials: 'same-origin' as const } : {}),
      headers,
    })
  }

  let response = await send(token)
  if (response.status !== 401 || !token || url.startsWith('/api/auth/')) return addTraceIdentifierToError(response)

  const currentToken = localStorage.getItem(accessTokenKey)
  const refreshedToken = currentToken && currentToken !== token ? currentToken : await refreshAccessToken()
  if (refreshedToken) response = await send(refreshedToken)
  if (response.status === 401) window.dispatchEvent(new CustomEvent('aierp:session-expired', { detail: token }))
  return addTraceIdentifierToError(response)
}
