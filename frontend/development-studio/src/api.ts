export async function api<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string; errors?: Record<string, string[]> } | null
    const validation = Object.values(payload?.errors ?? {}).flat().join(' ')
    throw new Error(response.status === 401 ? 'Oturum geçersiz. Yeniden giriş yapın.' : payload?.error || payload?.detail || validation || (response.status === 403 ? 'Bu işlem için yetkiniz yok.' : payload?.title) || `İstek başarısız (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
