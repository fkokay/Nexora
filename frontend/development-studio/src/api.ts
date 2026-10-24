const refreshTokenKey = 'aierp.studioRefreshToken'
let refreshInFlight: Promise<string | null> | null = null
const studioSessionHeaders = { 'X-Studio-Session': 'cookie' }

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
      if (!response.ok) throw new Error('Oturum yenilenemedi. Bağlantınızı kontrol edip yeniden deneyin.')
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
    const payload = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string; errors?: Record<string, string[]> } | null
    const validation = Object.values(payload?.errors ?? {}).flat().join(' ')
    if (response.status === 401 && token) {
      expireSession()
      throw new Error('Oturum süresi doldu. Lütfen yeniden giriş yapın.')
    }
    throw new Error(response.status === 401 ? 'E-posta veya parola hatalı.' : payload?.error || payload?.detail || validation || (response.status === 403 ? 'Bu işlem için yetkiniz yok.' : payload?.title) || `İstek başarısız (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
