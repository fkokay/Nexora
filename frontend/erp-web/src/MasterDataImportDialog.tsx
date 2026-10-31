import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { authenticatedFetch } from './authApi'
import './master-data-import.css'

type Kind = 'customers' | 'stock'
type ImportRow = Record<string, string | number | boolean | null>
type RowError = { rowNumber: number; field: string; message: string }

const config = {
  customers: {
    title: 'Cari kartı içe aktar', endpoint: '/api/customers/bulk-import',
    headers: ['code','name','type','taxNumber','identityNumber','taxOffice','currencyCode','riskLimit','paymentTermDays','isActive'],
    template: ['code,name,type,taxNumber,identityNumber,taxOffice,currencyCode,riskLimit,paymentTermDays,isActive','C-1001,"Örnek Makine Sanayi A.Ş.",Customer,1234567890,,İstanbul,TRY,250000,30,true','T-1001,"Örnek Tedarik Ltd.",Supplier,,,,TRY,,,true'].join('\r\n'),
    aliases: { code:['kod','cari kodu'], name:['unvan','ünvan','cari adi','cari adı'], type:['tur','tür'], taxNumber:['vergi no','vergi numarasi','vergi numarası','vkn'], identityNumber:['tckn','tc kimlik no','tc kimlik numarasi','tc kimlik numarası'], taxOffice:['vergi dairesi'], currencyCode:['doviz','döviz','doviz kodu','döviz kodu','para birimi'], riskLimit:['risk limiti'], paymentTermDays:['vade','vade gunu','vade günü'], isActive:['aktif','durum'] } as Record<string,string[]>,
  },
  stock: {
    title: 'Stok kartı içe aktar', endpoint: '/api/stock/items/bulk-import',
    headers: ['code','name','barcode','unitCode','category','minimumStock','trackingMode','procurementLeadTimeDays','manufacturingLeadTimeDays','isActive'],
    template: ['code,name,barcode,unitCode,category,minimumStock,trackingMode,procurementLeadTimeDays,manufacturingLeadTimeDays,isActive','MAT-1001,"Paslanmaz Çelik Sac 2mm",8690000000001,KG,Hammadde,25,None,14,0,true','YAR-1001,"Pompa Gövdesi",8690000000002,EA,Yarı Mamul,2,Lot,7,3,true'].join('\r\n'),
    aliases: { code:['kod','stok kodu'], name:['stok adi','stok adı','ad'], barcode:['barkod'], unitCode:['birim','birim kodu'], category:['kategori'], minimumStock:['minimum stok','min stok'], trackingMode:['takip modu','izleme modu'], procurementLeadTimeDays:['tedarik suresi','tedarik süresi'], manufacturingLeadTimeDays:['uretim suresi','üretim süresi'], isActive:['aktif','durum'] } as Record<string,string[]>,
  },
} satisfies Record<Kind, { title:string; endpoint:string; headers:string[]; template:string; aliases:Record<string,string[]> }>

function parseCsv(source:string): string[][] {
  const firstLine=source.split(/\r?\n/,1)[0]||''
  const delimiter=(firstLine.match(/;/g)?.length||0)>(firstLine.match(/,/g)?.length||0)?';':','
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false
  for(let i=0;i<source.length;i++){
    const char=source[i]
    if(char==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(char===delimiter&&!quoted){row.push(field);field=''}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&source[i+1]==='\n')i++;row.push(field);field='';if(row.some(value=>value.trim()))rows.push(row);row=[]}
    else field+=char
  }
  if(quoted)throw new Error('CSV dosyasında kapanmamış tırnak var.')
  if(field||row.length){row.push(field);if(row.some(value=>value.trim()))rows.push(row)}
  if(rows.length<2)throw new Error('CSV başlık ve en az bir veri satırı içermeli.')
  return rows
}

function headerKey(value:string):string {
  return value.replace(/^\uFEFF/,'').trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[ _-]+/g,'')
}

function decimalValue(value:string,label:string,rowNumber:number):number|null {
  const raw=value.trim();if(!raw)return null
  let normalized=raw.replace(/[\s₺$€£]/g,'')
  if(normalized.includes(',')&&normalized.includes('.'))normalized=normalized.lastIndexOf(',')>normalized.lastIndexOf('.')?normalized.replace(/\./g,'').replace(',','.'):normalized.replace(/,/g,'')
  else normalized=normalized.replace(',','.')
  const result=Number(normalized)
  if(!Number.isFinite(result))throw new Error(`${rowNumber}. satır · ${label}: geçerli bir sayı girin.`)
  return result
}

function boolValue(value:string,label:string,rowNumber:number):boolean {
  const normalized=value.trim().toLocaleLowerCase('tr-TR')
  if(!normalized||['true','1','evet','aktif','yes'].includes(normalized))return true
  if(['false','0','hayir','hayır','pasif','no'].includes(normalized))return false
  throw new Error(`${rowNumber}. satır · ${label}: true/false veya Evet/Hayır kullanın.`)
}

function mapRow(kind:Kind, headers:string[], values:string[], rowNumber:number):ImportRow {
  const settings=config[kind]
  const normalized=headers.map(headerKey)
  const get=(key:string)=>{
    const wanted=[key,...(settings.aliases[key]||[])].map(headerKey)
    const index=normalized.findIndex(header=>wanted.includes(header))
    return index<0?'':(values[index]||'').trim()
  }
  const code=get('code'),name=get('name')
  if(!code)throw new Error(`${rowNumber}. satır · Kod zorunludur.`)
  if(!name)throw new Error(`${rowNumber}. satır · Ad/ünvan zorunludur.`)
  const active=boolValue(get('isActive'),'Aktif',rowNumber)
  if(kind==='customers'){
    const typeRaw=get('type').toLocaleLowerCase('tr-TR')
    const type=typeRaw===''||typeRaw==='customer'||typeRaw==='musteri'||typeRaw==='müşteri'?'Customer':typeRaw==='supplier'||typeRaw==='tedarikci'||typeRaw==='tedarikçi'?'Supplier':typeRaw==='both'||typeRaw==='her ikisi'||typeRaw==='müşteri & tedarikçi'||typeRaw==='musteri & tedarikci'?'Both':null
    if(!type)throw new Error(`${rowNumber}. satır · Tür Customer, Supplier veya Both olmalıdır.`)
    const term=decimalValue(get('paymentTermDays'),'Vade günü',rowNumber)??0
    const risk=decimalValue(get('riskLimit'),'Risk limiti',rowNumber)
    if(!Number.isInteger(term))throw new Error(`${rowNumber}. satır · Vade günü tam sayı olmalıdır.`)
    return {code,name,type,taxNumber:get('taxNumber')||null,identityNumber:get('identityNumber')||null,taxOffice:get('taxOffice')||null,currencyCode:get('currencyCode')||'TRY',riskLimit:risk,paymentTermDays:term,isActive:active}
  }
  const trackingRaw=get('trackingMode').toLocaleLowerCase('tr-TR')
  const trackingMode=trackingRaw==='lot'||trackingRaw==='lot takibi'?'Lot':trackingRaw==='serial'||trackingRaw==='seri'||trackingRaw==='seri takibi'?'Serial':trackingRaw===''||trackingRaw==='none'||trackingRaw==='yok'||trackingRaw==='takipsiz'?'None':'Invalid'
  if(trackingMode==='Invalid')throw new Error(`${rowNumber}. satır · Takip modu None, Lot veya Serial olmalıdır.`)
  const minimumStock=decimalValue(get('minimumStock'),'Minimum stok',rowNumber)??0
  const procurement=decimalValue(get('procurementLeadTimeDays'),'Tedarik süresi',rowNumber)??0
  const manufacturing=decimalValue(get('manufacturingLeadTimeDays'),'Üretim süresi',rowNumber)??0
  if(!Number.isInteger(procurement)||!Number.isInteger(manufacturing))throw new Error(`${rowNumber}. satır · Tedarik ve üretim süreleri tam sayı gün olmalıdır.`)
  return {code,name,barcode:get('barcode')||null,unitCode:get('unitCode')||'EA',category:get('category')||null,minimumStock,trackingMode,procurementLeadTimeDays:procurement,manufacturingLeadTimeDays:manufacturing,isActive:active}
}

export default function MasterDataImportDialog({kind,token,onClose,onImported}:{kind:Kind;token:string;onClose:()=>void;onImported:()=>Promise<void>|void}) {
  const settings=config[kind]
  const [fileName,setFileName]=useState(''),[rows,setRows]=useState<ImportRow[]>([]),[error,setError]=useState(''),[rowErrors,setRowErrors]=useState<RowError[]>([]),[busy,setBusy]=useState(false),[done,setDone]=useState<number|null>(null)
  const preview=useMemo(()=>rows.slice(0,6),[rows])

  async function selectFile(file:File|null){
    setFileName('');setRows([]);setRowErrors([]);setError('');setDone(null)
    if(!file)return
    const isCsv=file.name.toLocaleLowerCase('tr-TR').endsWith('.csv'),isExcel=/\.(xlsx|xls)$/i.test(file.name)
    if(!isCsv&&!isExcel){setError('Lütfen .csv veya .xlsx/.xls dosyası seçin.');return}
    if(file.size>5*1024*1024){setError('Aktarım dosyası en fazla 5 MB olabilir.');return}
    try{
      let matrix:string[][]
      if(isCsv)matrix=parseCsv(await file.text())
      else {const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});const sheet=workbook.Sheets[workbook.SheetNames[0]];if(!sheet)throw new Error('Excel dosyasında okunabilir çalışma sayfası yok.');matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:false,defval:''}).map(row=>row.map(value=>value==null?'':String(value)));if(matrix.length<2)throw new Error('Excel çalışma sayfası başlık ve en az bir veri satırı içermeli.')}
      const headers=matrix[0].map(value=>value.replace(/^\uFEFF/,'').trim())
      const normalized=headers.map(headerKey),known=settings.headers.map(headerKey),aliases=Object.values(settings.aliases).flat().map(headerKey)
      if(!headers.some(header=>['code','kod','cari kodu','stok kodu'].map(headerKey).includes(header))||!headers.some(header=>['name','ünvan','unvan','stok adı','stok adi','ad'].map(headerKey).includes(header)))throw new Error('CSV dosyasında Kod ve Ad/Ünvan sütunları bulunmalı.')
      const unexpected=headers.filter((_,index)=>!known.includes(normalized[index])&&!aliases.includes(normalized[index]))
      if(unexpected.length)throw new Error(`Tanınmayan sütun(lar): ${unexpected.join(', ')}. Şablondaki sütun adlarını kullanın.`)
      if(matrix.length-1>5000)throw new Error('Tek dosyada en fazla 5.000 satır aktarılabilir.')
      const mapped:ImportRow[]=[],errors:RowError[]=[]
      matrix.slice(1).forEach((values,index)=>{try{mapped.push(mapRow(kind,headers,values,index+2))}catch(cause){errors.push({rowNumber:index+2,field:'',message:(cause as Error).message})}})
      setFileName(file.name);setRows(mapped);setRowErrors(errors)
      if(errors.length)setError(`${errors.length} satırda ön doğrulama hatası var. Bu dosya aktarılmayacak.`)
    }catch(cause){setError((cause as Error).message)}
  }

  async function importRows(){
    if(!rows.length||rowErrors.length)return
    setBusy(true);setError('');setRowErrors([])
    try{
      const response=await authenticatedFetch(settings.endpoint,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:rows})})
      const payload=await response.json().catch(()=>({})) as {imported?:number;error?:string;rowErrors?:RowError[]}
      if(!response.ok){setRowErrors(payload.rowErrors||[]);throw new Error(payload.error||`Aktarım başarısız (${response.status}).`)}
      setDone(payload.imported??rows.length);setRows([]);await onImported()
    }catch(cause){setError((cause as Error).message)}finally{setBusy(false)}
  }

  function downloadTemplate(){const blob=new Blob(['\uFEFF',settings.template],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=kind==='customers'?'cari-ice-aktarma-sablonu.csv':'stok-ice-aktarma-sablonu.csv';link.click();URL.revokeObjectURL(url)}
  async function downloadExcelTemplate(){const XLSX=await import('xlsx');const matrix=[settings.headers,...parseCsv(settings.template).slice(1)];const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(matrix),'Şablon');XLSX.writeFileXLSX(workbook,kind==='customers'?'cari-ice-aktarma-sablonu.xlsx':'stok-ice-aktarma-sablonu.xlsx')}
  return <div className="modal-backdrop master-import-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><section className="panel master-import-dialog" role="dialog" aria-modal="true" aria-labelledby="master-import-title">
    <header className="master-import-header"><div><p className="eyebrow">TOPLU VERİ AKTARIMI</p><h2 id="master-import-title">{settings.title}</h2><p>CSV veya Excel dosyası · en fazla 5.000 kayıt · hatalı satır varsa hiçbir kayıt eklenmez.</p></div><button type="button" className="icon-button" aria-label="Pencereyi kapat" disabled={busy} onClick={onClose}><X size={19}/></button></header>
    <div className="master-import-actions"><button type="button" className="secondary" onClick={downloadTemplate}><Download size={15}/> CSV şablonunu indir</button><button type="button" className="secondary" onClick={()=>void downloadExcelTemplate()}><Download size={15}/> Excel şablonunu indir</button><span>Şablon sütun adlarını koruyup kendi verilerinizle doldurun.</span></div>
    <label className="master-import-file"><FileSpreadsheet size={19}/><span><b>{fileName||'CSV veya Excel dosyası seçin'}</b><small>CSV UTF-8 · Excel .xlsx/.xls · en fazla 5 MB</small></span><input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" disabled={busy} onChange={event=>void selectFile(event.target.files?.[0]||null)}/></label>
    {error&&<div className="alert inline-alert" role="alert">{error}</div>}{done!==null&&<div className="notice" role="status">{done.toLocaleString('tr-TR')} kayıt başarıyla aktarıldı.</div>}
    {rowErrors.length>0&&<div className="master-import-errors"><b>Satır hataları</b><ul>{rowErrors.slice(0,30).map((item,index)=><li key={`${item.rowNumber}-${item.field}-${index}`}>Satır {item.rowNumber}{item.field?` · ${item.field}`:''}: {item.message}</li>)}</ul>{rowErrors.length>30&&<small>İlk 30 hata gösteriliyor; toplam {rowErrors.length} hata var.</small>}</div>}
    {rows.length>0&&<><div className="master-import-summary"><b>{rows.length.toLocaleString('tr-TR')} kayıt hazır</b><span>İlk {preview.length} satır önizleniyor. Kodlar ve barkodlar firmadaki kayıtlarla sunucuda karşılaştırılır.</span></div><div className="master-import-preview"><table><thead><tr>{settings.headers.slice(0,6).map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{preview.map((row,index)=><tr key={index}>{settings.headers.slice(0,6).map(header=><td key={header}>{String(row[header]??'—')}</td>)}</tr>)}</tbody></table></div></>}
    <footer className="master-import-footer"><span>İçe aktarma, cari ve stok kodlarını firmaya özel olarak denetler.</span><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>Kapat</button><button type="button" className="primary" disabled={busy||rows.length===0||rowErrors.length>0} onClick={()=>void importRows()}><Upload size={15}/>{busy?'Aktarılıyor…':` ${rows.length.toLocaleString('tr-TR')} kaydı aktar`}</button></div></footer>
  </section></div>
}
