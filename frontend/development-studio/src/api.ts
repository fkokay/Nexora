const refreshTokenKey = 'aierp.studioRefreshToken'
let refreshInFlight: Promise<string | null> | null = null
const studioSessionHeaders = { 'X-Studio-Session': 'cookie' }

type ApiErrorPayload = { error?: string; detail?: string; title?: string; traceId?: string; errors?: Record<string, string[]> }

function supportCode(response: Response, payload?: ApiErrorPayload | null): string | null {
  const value = response.headers.get('X-Trace-Id') || payload?.traceId
  return value && /^[A-Za-z0-9-]{8,80}$/.test(value) ? value : null
}

function failureMessage(response: Response, payload?: ApiErrorPayload | null, authenticated = false): string {
  const code = supportCode(response, payload)
  const suffix = code ? ` (Destek kodu: ${code})` : ''
  if (response.status === 401) return `${authenticated ? 'Oturum süresi doldu. Lütfen yeniden giriş yapın.' : 'E-posta veya parola hatalı.'}${suffix}`
  if (response.status >= 500) return `Sunucu hatası. Lütfen daha sonra yeniden deneyin.${suffix}`
  const validation = Object.values(payload?.errors ?? {}).flat().join(' ')
  return payload?.error || payload?.detail || validation || (response.status === 403 ? 'Bu işlem için yetkiniz yok.' : payload?.title) || `İstek başarısız (${response.status}).`
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload | null> {
  return await response.json().catch(() => null) as ApiErrorPayload | null
}

function expireSession() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('aierp:session-expired'))
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  const performRefresh = async () => {
    const refreshToken = localStorage.getItem(refreshTokenKey)
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...studioSessionHeaders },
        body: JSON.stringify(refreshToken ? { refreshToken } : {})
      })
      if (response.status === 401) {
        // Another tab may have completed rotation and updated the shared cookie.
        const retry = await fetch('/api/auth/refresh', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...studioSessionHeaders },
          body: '{}'
        })
        if (retry.status >= 500) {
          const payload = await readErrorPayload(retry)
          throw new Error(`Oturum yenilenemedi. Lütfen daha sonra yeniden deneyin.${supportCode(retry, payload) ? ` (Destek kodu: ${supportCode(retry, payload)})` : ''}`)
        }
        if (retry.ok) {
          const rotated = await retry.json() as { accessToken?: string }
          if (rotated.accessToken) {
            localStorage.setItem('aierp.accessToken', rotated.accessToken)
            localStorage.removeItem(refreshTokenKey)
            window.dispatchEvent(new CustomEvent('aierp:access-token-refreshed', { detail: rotated.accessToken }))
            return rotated.accessToken
          }
        }
        localStorage.removeItem(refreshTokenKey)
        expireSession()
        return null
      }
      if (!response.ok) {
        const payload = await readErrorPayload(response)
        throw new Error(response.status >= 500
          ? failureMessage(response, payload)
          : 'Oturum yenilenemedi. Bağlantınızı kontrol edip yeniden deneyin.')
      }
      const result = await response.json() as { accessToken?: string }
      if (!result.accessToken) throw new Error('Oturum yanıtı geçersiz.')
      localStorage.setItem('aierp.accessToken', result.accessToken)
      localStorage.removeItem(refreshTokenKey)
      window.dispatchEvent(new CustomEvent('aierp:access-token-refreshed', { detail: result.accessToken }))
      return result.accessToken
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Oturum yenilenemedi. Bağlantınızı kontrol edip yeniden deneyin.')
      throw error
    }
  }
  const run = () => performRefresh()
  refreshInFlight = (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('aierp-studio-token-refresh', run)
    : run()).finally(() => { refreshInFlight = null })
  return refreshInFlight
}

export async function migrateLegacyRefreshToken(): Promise<void> {
  if (!localStorage.getItem(refreshTokenKey)) return
  await refreshAccessToken()
}

export async function authorizedFetch(url: string, token?: string, init?: RequestInit): Promise<Response> {
  const send = (accessToken?: string) => fetch(url, {
    ...init,
    // Tenant/project authorization can change during the GitHub callback flow.
    // Never let the browser reuse a stale API response for these private reads.
    cache: init?.cache ?? 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers
    }
  })
  let response = await send(token)
  if (response.status === 401 && token && !url.startsWith('/api/auth/')) {
    const renewedToken = await refreshAccessToken()
    if (renewedToken) response = await send(renewedToken)
  }
  return response
}

export async function api<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(url, token, init)
  if (!response.ok) {
    const payload = await readErrorPayload(response)
    if (response.status === 401 && token) {
      expireSession()
      throw new Error(failureMessage(response, payload, true))
    }
    throw new Error(failureMessage(response, payload))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
