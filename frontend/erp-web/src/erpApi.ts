import { authenticatedFetch } from './authApi'
import { localDateString } from './dateUtils'
import type { StockItem, BankStatementInputLine } from './erp-types'
export { localDateString }

export async function api<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, init)
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; title?: string; traceId?: string; errors?: Record<string, string[]> } | null
    const validation = Object.values(payload?.errors ?? {}).flat().join(' ')
    const trace = payload?.traceId ? ` İz kimliği: ${payload.traceId}.` : ''
    throw new Error(response.status === 401 ? 'Oturum geçersiz. Yeniden giriş yapın.' : response.status === 403 ? 'Bu işlem için yetkiniz yok.' : (payload?.error || validation || payload?.title || `İstek başarısız (${response.status}).`) + trace)
  }
  if (init?.method && !['GET','HEAD'].includes(init.method.toUpperCase())) window.dispatchEvent(new CustomEvent('nexora:workspace-clean'))
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

export function parseBankStatementCsv(source:string):BankStatementInputLine[] {
  const firstLine=source.split(/\r?\n/,1)[0]||''
  const delimiter=(firstLine.match(/;/g)?.length||0)>(firstLine.match(/,/g)?.length||0)?';':','
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false
  for(let i=0;i<source.length;i++){
    const char=source[i]
    if(char==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(char===delimiter&&!quoted){row.push(field);field=''}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&source[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[]}
    else field+=char
  }
  if(field||row.length){row.push(field);if(row.some(x=>x.trim()))rows.push(row)}
  if(rows.length<1)throw new Error('CSV başlık satırı bulunamadı.')
  const headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim().toLocaleLowerCase('tr-TR'))
  const col=(...names:string[])=>headers.findIndex(h=>names.includes(h))
  const dateCol=col('date','tarih'),amountCol=col('amount','tutar','signedamount'),descriptionCol=col('description','açıklama','aciklama','işlem açıklaması','islem aciklamasi')
  if(dateCol<0||amountCol<0||descriptionCol<0)throw new Error('CSV başlıkları date, amount ve description (veya Türkçe karşılıkları) içermeli.')
  const referenceCol=col('reference','referans'),idCol=col('externalid','transactionid','bankid','işlem no','islem no')
  const parseDate=(raw:string)=>{const value=raw.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const match=value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(match)return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;throw new Error(`Geçersiz tarih: ${value}`)}
  const parseAmount=(raw:string)=>{let value=raw.trim().replace(/[\s₺$€£]/g,'');if(value.includes(',')&&value.includes('.'))value=value.lastIndexOf(',')>value.lastIndexOf('.')?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');else if(value.includes(','))value=value.replace(',','.');const result=Number(value);if(!Number.isFinite(result))throw new Error(`Geçersiz tutar: ${raw}`);return result}
  return rows.slice(1).map((values,i)=>{const get=(index:number)=>index<0?'':(values[index]||'').trim();const signedAmount=parseAmount(get(amountCol));if(!signedAmount)throw new Error(`${i+2}. satırda tutar sıfır olamaz.`);return {transactionDate:parseDate(get(dateCol)),signedAmount,description:get(descriptionCol),reference:get(referenceCol)||null,externalId:get(idCol)||null}})
}
