import type { StockItem } from '../documents/models'

export const localDateString = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export async function api<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; title?: string; errors?: Record<string, string[]> } | null
    const validation = Object.values(payload?.errors ?? {}).flat().join(' ')
    throw new Error(response.status === 401 ? 'Oturum geçersiz. Yeniden giriş yapın.' : response.status === 403 ? 'Bu işlem için yetkiniz yok.' : payload?.error || validation || payload?.title || `İstek başarısız (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function loadAllPages<T>(url:string,token:string):Promise<T[]> {
  const first=await api<{items:T[];pageSize:number;totalCount:number}>(`${url}${url.includes('?')?'&':'?'}page=1&pageSize=100`,token)
  const pageCount=Math.ceil(first.totalCount/first.pageSize)
  if(pageCount<=1)return first.items
  const items=[...first.items]
  for(let start=2;start<=pageCount;start+=5){
    const count=Math.min(5,pageCount-start+1)
    const batch=await Promise.all(Array.from({length:count},(_,index)=>api<{items:T[]}>(`${url}${url.includes('?')?'&':'?'}page=${start+index}&pageSize=${first.pageSize}`,token)))
    items.push(...batch.flatMap(page=>page.items))
  }
  return items
}

export async function loadStockItemCatalog(token:string):Promise<StockItem[]> { return loadAllPages<StockItem>('/api/stock/items/',token) }
