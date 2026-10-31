import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FileText, MoreHorizontal, Pencil, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { api, localDateString } from './erpApi'
import { groupBuiltInScreenFields } from './FinanceStudioGrid'
import type {
  CustomerItem, CustomerGroupItem, CustomerCompanyOption, CustomerLocationDefinitions,
  CustomerAddressItem, BuiltInScreenLayoutField, CustomerDialogRequest,
  CustomerCustomFieldDefinition, CustomerCustomFieldRevision, CustomerCustomFieldValueRevision,
  CustomerBalance, CustomerStatement, ExternalStatementLine, CustomerLedgerItem,
  CustomerCustomFieldValue, TurkeyLocationOption, TurkeyDistrictOption,
} from './erp-types'
import CustomerSalesInvoicesPanel from './CustomerSalesInvoicesPanel'
import MasterDataImportDialog from './MasterDataImportDialog'
import { CustomerDirectoryHeader } from './customers/components/CustomerDirectoryHeader'
import { CustomerFilters } from './customers/components/CustomerFilters'
import { CustomerGrid } from './customers/components/CustomerGrid'
import { CustomerDetailPanel, type CustomerDetailTab } from './customers/components/CustomerDetailPanel'

const customerCountryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
const customerCountryNames=new Intl.DisplayNames(['tr'],{type:'region'})
function turkeyDistrictsForProvince(province: string, provinces: TurkeyLocationOption[], districts: TurkeyDistrictOption[]): TurkeyLocationOption[] {
  const selected = provinces.find(item => item.name.toLocaleLowerCase('tr-TR') === province.trim().toLocaleLowerCase('tr-TR'))
  return selected ? districts.filter(item => item.provinceId === selected.id) : []
}

function CustomerLocationInput({id,label,value,options,onChange,required=false,optional=true}:{id:string;label:string;value:string;options:TurkeyLocationOption[];onChange:(value:string)=>void;required?:boolean;optional?:boolean}) {
  return <label>{label}{optional&&<span className="optional-label">İsteğe bağlı</span>}<input list={`${id}-options`} autoComplete="off" value={value} onChange={event=>onChange(event.target.value)} maxLength={100} required={required}/><datalist id={`${id}-options`}>{options.map(option=><option key={option.id} value={option.name}/>)}</datalist>{options.length===0&&<small className="customer-location-hint">Konum listesi boşsa il veya ilçeyi elle yazabilirsiniz.</small>}</label>
}

function CustomerCountryInput({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <label>Ülke<select value={value} onChange={event=>onChange(event.target.value)} required>{customerCountryCodes.map(code=><option key={code} value={code}>{customerCountryNames.of(code)??code} ({code})</option>)}</select></label>
}

function CustomerLocationMap({latitude,longitude,onChange}:{latitude:number|null;longitude:number|null;onChange:(latitude:number|null,longitude:number|null)=>void}) {
  const [mapOpen,setMapOpen]=useState(false)
  const mapElement=useRef<HTMLDivElement|null>(null),mapInstance=useRef<L.Map|null>(null),pin=useRef<L.CircleMarker|null>(null),onChangeRef=useRef(onChange)
  useEffect(()=>{onChangeRef.current=onChange},[onChange])
  useEffect(()=>{
    if(!mapOpen||!mapElement.current)return
    const map=L.map(mapElement.current,{center:latitude!==null&&longitude!==null?[latitude,longitude]:[39,35],zoom:latitude!==null&&longitude!==null?14:6,scrollWheelZoom:true})
    const environment=import.meta.env as ImportMetaEnv & { VITE_MAP_TILE_URL?:string }
    L.tileLayer(environment.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'}).addTo(map)
    map.on('click',event=>onChangeRef.current(event.latlng.lat,event.latlng.lng))
    mapInstance.current=map
    window.requestAnimationFrame(()=>map.invalidateSize())
    return()=>{map.remove();mapInstance.current=null;pin.current=null}
  },[mapOpen])
  useEffect(()=>{
    const map=mapInstance.current
    if(!map)return
    if(latitude===null||longitude===null){if(pin.current){map.removeLayer(pin.current);pin.current=null}return}
    if(pin.current)pin.current.setLatLng([latitude,longitude])
    else pin.current=L.circleMarker([latitude,longitude],{radius:9,color:'#ffffff',weight:3,fillColor:'#0878f9',fillOpacity:1}).addTo(map)
  },[latitude,longitude,mapOpen])
  const coordinatesRequired=latitude!==null||longitude!==null
  return <section className="customer-location-picker" aria-label="Harita konumu">
    <div className="customer-location-picker-heading"><div><b>Harita konumu</b><small>Haritaya tıklayarak pini seçin. Harita alanı OpenStreetMap harita sunucusuna iletilir.</small></div><button type="button" className="secondary small-button" aria-expanded={mapOpen} onClick={()=>setMapOpen(value=>!value)}>{mapOpen?'Haritayı kapat':'Haritayı aç'}</button></div>
    {mapOpen&&<><p className="customer-map-privacy-note">Cari adresinin metni harita hizmetine gönderilmez; ancak görüntülenen harita bölgesi tile isteklerinden tahmin edilebilir.</p><div ref={mapElement} className="customer-location-map" role="application" aria-label="Konum seçme haritası"/><div className="form-two customer-coordinate-fields"><label>Enlem<input aria-label="Enlem" type="number" min="-90" max="90" step="0.000001" value={latitude??''} required={coordinatesRequired} onChange={event=>onChange(event.target.value===''?null:Number(event.target.value),longitude)}/></label><label>Boylam<input aria-label="Boylam" type="number" min="-180" max="180" step="0.000001" value={longitude??''} required={coordinatesRequired} onChange={event=>onChange(latitude,event.target.value===''?null:Number(event.target.value))}/></label></div></>}
    <small className="customer-location-coordinates">{latitude!==null&&longitude!==null?`Seçilen konum: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`:'Haritada konum seçilmedi.'}</small>
  </section>
}

function CustomerActionsMenu({item,busy,onEdit,onInvoices,onPurchaseInvoices,onLedger,onAddresses,onFields,onToggleActive}:{item:CustomerItem;busy:boolean;onEdit:()=>void;onInvoices:()=>void;onPurchaseInvoices:()=>void;onLedger:()=>void;onAddresses:()=>void;onFields:()=>void;onToggleActive:()=>void}) {
  const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0,maxHeight:230})
  const triggerRef=useRef<HTMLButtonElement>(null),menuRef=useRef<HTMLDivElement>(null)
  function showMenu(){
    if(!triggerRef.current)return
    const rect=triggerRef.current.getBoundingClientRect(),width=190,gap=6,padding=8
    const left=Math.max(padding,Math.min(rect.right-width,window.innerWidth-width-padding))
    const below=Math.max(0,window.innerHeight-rect.bottom-gap-padding),above=Math.max(0,rect.top-gap-padding)
    const maxHeight=Math.min(230,Math.max(80,Math.max(below,above))),estimatedHeight=(item.type==='Both'?7:6)*36+12
    const top=below>=estimatedHeight||below>=above?rect.bottom+gap:Math.max(padding,rect.top-gap-maxHeight)
    setPosition({top,left,maxHeight});setOpen(true)
  }
  useLayoutEffect(()=>{
    if(!open||!menuRef.current||!triggerRef.current)return
    const rect=triggerRef.current.getBoundingClientRect(),menu=menuRef.current.getBoundingClientRect(),gap=6,padding=8
    const below=Math.max(0,window.innerHeight-rect.bottom-gap-padding),above=Math.max(0,rect.top-gap-padding),placeBelow=below>=menu.height||below>=above
    const top=placeBelow?Math.min(rect.bottom+gap,window.innerHeight-menu.height-padding):Math.max(padding,rect.top-gap-menu.height)
    const left=Math.max(padding,Math.min(rect.right-menu.width,window.innerWidth-menu.width-padding))
    setPosition(current=>current.top===top&&current.left===left?current:{...current,top,left,maxHeight:Math.min(230,Math.max(80,Math.max(below,above)))})
  },[open,item.type])
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!triggerRef.current?.contains(target)&&!menuRef.current?.contains(target))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    const viewportResize=()=>setOpen(false)
    const pageScroll=(event:Event)=>{const target=event.target;if(target instanceof Node&&menuRef.current?.contains(target))return;setOpen(false)}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',viewportResize);window.addEventListener('scroll',pageScroll,true)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',viewportResize);window.removeEventListener('scroll',pageScroll,true)}
  },[open])
  const run=(action:()=>void)=>{setOpen(false);action()}
  return <><button ref={triggerRef} type="button" className="customer-actions-trigger" aria-label={`${item.code} ${item.name} için işlemler`} aria-expanded={open} title="Cari işlemleri" disabled={busy} onClick={()=>open?setOpen(false):showMenu()}><MoreHorizontal size={17}/></button>{open&&createPortal(<div ref={menuRef} className="customer-actions-popover customer-actions-portal" role="group" aria-label={`${item.name} işlemleri`} style={{position:'fixed',top:position.top,left:position.left,right:'auto',bottom:'auto',height:'auto',maxHeight:position.maxHeight,overflowY:'auto'}}><button type="button" disabled={busy} onClick={()=>run(onEdit)}><Pencil size={14}/>Düzenle</button>{item.type!=='Supplier'&&<button type="button" disabled={busy} onClick={()=>run(onInvoices)}><FileText size={14}/>Satış faturaları</button>}{item.type!=='Customer'&&<button type="button" disabled={busy} onClick={()=>run(onPurchaseInvoices)}><FileText size={14}/>Alış faturaları</button>}<button type="button" disabled={busy} onClick={()=>run(onLedger)}>Hareketler</button><button type="button" disabled={busy} onClick={()=>run(onAddresses)}>Adresler</button><button type="button" disabled={busy} onClick={()=>run(onFields)}>Özel alanlar</button><button type="button" className="danger" disabled={busy} onClick={()=>run(onToggleActive)}>{item.isActive?'Pasife al':'Etkinleştir'}</button></div>,document.body)}</>
}

function parseCustomerStatementCsv(source:string):ExternalStatementLine[] {
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
  if(rows.length<2)throw new Error('Ekstre CSV dosyasında başlık ve en az bir hareket olmalı.')
  const headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim().toLocaleLowerCase('tr-TR'))
  const col=(...names:string[])=>headers.findIndex(h=>names.includes(h))
  const dateCol=col('date','tarih'),directionCol=col('direction','yön','yon','borç/alacak','borc/alacak'),amountCol=col('amount','tutar'),descriptionCol=col('description','açıklama','aciklama')
  if(dateCol<0||directionCol<0||amountCol<0)throw new Error('CSV başlıkları date, direction ve amount (veya Türkçe karşılıkları) içermeli.')
  const parseDate=(raw:string)=>{const value=raw.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const match=value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(match)return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;throw new Error(`Geçersiz tarih: ${value}`)}
  const parseAmount=(raw:string)=>{let value=raw.trim().replace(/[\s₺$€£]/g,'');if(value.includes(',')&&value.includes('.'))value=value.lastIndexOf(',')>value.lastIndexOf('.')?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');else if(value.includes(','))value=value.replace(',','.');const result=Number(value);if(!Number.isFinite(result)||result<=0)throw new Error(`Geçersiz tutar: ${raw}`);return result}
  return rows.slice(1).map((values,i)=>{const get=(index:number)=>index<0?'':(values[index]||'').trim();const directionRaw=get(directionCol).toLocaleLowerCase('tr-TR');const direction=directionRaw==='debit'||directionRaw==='borç'||directionRaw==='borc'?'Debit':directionRaw==='credit'||directionRaw==='alacak'?'Credit':null;if(!direction)throw new Error(`${i+2}. satırda yön Debit/Borç veya Credit/Alacak olmalı.`);return {entryDate:parseDate(get(dateCol)),direction,amount:parseAmount(get(amountCol)),description:get(descriptionCol)}})
}

function CustomersPage({token,role,initialSearch,onOpenSalesInvoice,onOpenPurchaseInvoices}:{token:string;role:string;initialSearch:string;onOpenSalesInvoice:(invoiceId:string)=>void;onOpenPurchaseInvoices:(supplier:{id:string;name:string})=>void}) {
  const [items,setItems]=useState<CustomerItem[]>([]), [groups,setGroups]=useState<CustomerGroupItem[]>([]), [companyOptions,setCompanyOptions]=useState<CustomerCompanyOption[]>([]), [total,setTotal]=useState(0), [loading,setLoading]=useState(true)
  const [locationDefinitions,setLocationDefinitions]=useState<CustomerLocationDefinitions>({provinces:[],districts:[]})
  const [selectedCustomerId,setSelectedCustomerId]=useState<string|null>(null)
  const [isSmallScreen,setIsSmallScreen]=useState(()=>window.matchMedia('(max-width: 1280px)').matches)
  const [hasAutoSelectedCustomer,setHasAutoSelectedCustomer]=useState(false)
  const [customerDetailTab,setCustomerDetailTab]=useState<CustomerDetailTab>('general')
  const [exportBusy,setExportBusy]=useState(false)
  const [importOpen,setImportOpen]=useState(false)
  const [customerDetailAddress,setCustomerDetailAddress]=useState<CustomerAddressItem|null>(null)
  const [customerDetailAddressLoaded,setCustomerDetailAddressLoaded]=useState(false)
  const [screenFields,setScreenFields]=useState<BuiltInScreenLayoutField[]>([
    {key:'code',label:'Cari kodu',visible:true,position:0,width:110},{key:'name',label:'Ünvan',visible:true,position:1,width:190},{key:'groupName',label:'Cari grubu',visible:true,position:2,width:150},
    {key:'type',label:'Tür',visible:true,position:3,width:100},{key:'currencyCode',label:'Döviz',visible:true,position:4,width:78},{key:'paymentTermDays',label:'Vade',visible:true,position:5,width:88},
    {key:'taxNumber',label:'Vergi no',visible:true,position:6,width:130},{key:'status',label:'Durum',visible:true,position:7,width:86},{key:'actions',label:'İşlemler',visible:true,position:8,width:92,fixed:true}
  ])
  const [detailFields,setDetailFields]=useState<BuiltInScreenLayoutField[]>([
    {key:'groupName',label:'Cari grubu',visible:true,position:0},{key:'taxNumber',label:'Vergi no',visible:true,position:1},
    {key:'identityNumber',label:'T.C. kimlik no',visible:true,position:2},{key:'taxOffice',label:'Vergi dairesi',visible:true,position:3},
    {key:'currencyCode',label:'Para birimi',visible:true,position:4},{key:'paymentTermDays',label:'Vade',visible:true,position:5},
    {key:'riskLimit',label:'Risk limiti',visible:true,position:6}
  ])
  const [filter,setFilter]=useState(''), [search,setSearch]=useState(''), [page,setPage]=useState(1)
  const [typeFilter,setTypeFilter]=useState(''), [statusFilter,setStatusFilter]=useState('')
  useEffect(()=>{if(!initialSearch)return;setSearch(initialSearch);setFilter(initialSearch);setPage(1)},[initialSearch])
  useEffect(()=>{const timer=window.setTimeout(()=>{setPage(1);setFilter(search.trim())},250);return()=>window.clearTimeout(timer)},[search])
  const [customerCreateTab,setCustomerCreateTab]=useState('basic')
  const [modal,setModal]=useState(false), [groupModal,setGroupModal]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('')
  const [customerDialog,setCustomerDialog]=useState<CustomerDialogRequest|null>(null),[customerDialogValue,setCustomerDialogValue]=useState('')
  const [editingCustomer,setEditingCustomer]=useState<CustomerItem|null>(null)
  const [code,setCode]=useState(''), [name,setName]=useState(''), [type,setType]=useState<CustomerItem['type']>('Customer'), [taxNumber,setTaxNumber]=useState('')
  const [identityNumber,setIdentityNumber]=useState(''), [taxOffice,setTaxOffice]=useState('')
  const [groupId,setGroupId]=useState(''), [parentCompanyId,setParentCompanyId]=useState(''), [currencyCode,setCurrencyCode]=useState('TRY'), [riskLimit,setRiskLimit]=useState(''), [paymentTermDays,setPaymentTermDays]=useState('0')
  const [groupCode,setGroupCode]=useState(''), [groupName,setGroupName]=useState(''),[editingGroup,setEditingGroup]=useState<CustomerGroupItem|null>(null),[groupError,setGroupError]=useState('')
  const [fieldCustomer,setFieldCustomer]=useState<CustomerItem|null>(null),[customerFields,setCustomerFields]=useState<CustomerCustomFieldDefinition[]>([]),[customerFieldValues,setCustomerFieldValues]=useState<Record<string,string>>({}),[customerFieldCode,setCustomerFieldCode]=useState(''),[customerFieldLabel,setCustomerFieldLabel]=useState(''),[customerFieldType,setCustomerFieldType]=useState<CustomerCustomFieldDefinition['dataType']>('Text'),[customerFieldMaxLength,setCustomerFieldMaxLength]=useState('200')
  const [customerFieldDefinitionScreen,setCustomerFieldDefinitionScreen]=useState<'closed'|'list'|'create'>('closed')
  const [customerCreateFields,setCustomerCreateFields]=useState<CustomerCustomFieldDefinition[]>([]),[customerCreateValues,setCustomerCreateValues]=useState<Record<string,string>>({}),[customerFieldRequired,setCustomerFieldRequired]=useState(false)
  const [customerFieldMetadataHistory,setCustomerFieldMetadataHistory]=useState<CustomerCustomFieldRevision[]>([]),[customerFieldMetadataDefinition,setCustomerFieldMetadataDefinition]=useState<CustomerCustomFieldDefinition|null>(null)
  const [customerFieldValueHistory,setCustomerFieldValueHistory]=useState<CustomerCustomFieldValueRevision[]>([]),[customerFieldValueHistoryDefinition,setCustomerFieldValueHistoryDefinition]=useState<CustomerCustomFieldDefinition|null>(null)
  const [addressCustomer,setAddressCustomer]=useState<CustomerItem|null>(null), [addresses,setAddresses]=useState<CustomerAddressItem[]>([])
  const [addressKind,setAddressKind]=useState<CustomerAddressItem['kind']>('General'), [addressLabel,setAddressLabel]=useState(''), [addressLine,setAddressLine]=useState(''), [addressCity,setAddressCity]=useState(''), [addressDistrict,setAddressDistrict]=useState(''), [addressPostalCode,setAddressPostalCode]=useState(''), [addressCountry,setAddressCountry]=useState('TR'), [addressLatitude,setAddressLatitude]=useState<number|null>(null), [addressLongitude,setAddressLongitude]=useState<number|null>(null)
  const [ledgerCustomer,setLedgerCustomer]=useState<CustomerItem|null>(null), [ledgerBalance,setLedgerBalance]=useState<CustomerBalance|null>(null), [statementPage,setStatementPage]=useState(1)
  const [customerMovementOpen,setCustomerMovementOpen]=useState(false),[reconciliationPage,setReconciliationPage]=useState(1)
  const [salesInvoicesCustomer,setSalesInvoicesCustomer]=useState<CustomerItem|null>(null)
  const today=localDateString(),[statementFrom,setStatementFrom]=useState(`${today.slice(0,8)}01`),[statementTo,setStatementTo]=useState(today),[statement,setStatement]=useState<CustomerStatement|null>(null),[externalRows,setExternalRows]=useState<ExternalStatementLine[]>([]),[externalFileName,setExternalFileName]=useState(''),[externalPerspective,setExternalPerspective]=useState<'counterparty'|'same'>('counterparty')
  const [movementDirection,setMovementDirection]=useState<CustomerLedgerItem['direction']>('Debit'), [movementAmount,setMovementAmount]=useState(''), [movementDescription,setMovementDescription]=useState(''), [movementDate,setMovementDate]=useState(localDateString())
  function confirmCustomerAction(message:string,options:{title?:string;confirmLabel?:string;danger?:boolean}={}):Promise<boolean>{return new Promise(resolve=>setCustomerDialog({kind:'confirm',title:options.title||'İşlemi onaylayın',message,confirmLabel:options.confirmLabel||'Onayla',danger:options.danger??false,resolve}))}
  function promptCustomerValue(title:string,message:string,initialValue:string,options:{valueLabel?:string;inputType?:'text'|'number';min?:number;max?:number;maxLength?:number;choices?:{value:string;label:string}[]}={}):Promise<string|null>{setCustomerDialogValue(initialValue);return new Promise(resolve=>setCustomerDialog({kind:'prompt',title,message,valueLabel:options.valueLabel||'Değer',initialValue,inputType:options.inputType||'text',min:options.min,max:options.max,maxLength:options.maxLength,choices:options.choices,resolve}))}
  function finishCustomerDialog(value:boolean|string|null){const request=customerDialog;setCustomerDialog(null);if(request?.kind==='confirm')request.resolve(value===true);else if(request?.kind==='prompt')request.resolve(typeof value==='string'?value:null)}
  async function load() {
    setLoading(true); setError('')
    try { const params=new URLSearchParams({q:filter,page:String(page),pageSize:'25'});if(typeFilter)params.set('type',typeFilter);if(statusFilter)params.set('status',statusFilter);const data=await api<{items:CustomerItem[];totalCount:number}>(`/api/customers/?${params.toString()}`,token); setItems(data.items); setTotal(data.totalCount) }
    catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  async function exportCustomers(format:'csv'|'xlsx') {
    setExportBusy(true)
    try {
      const params=new URLSearchParams({q:filter,page:'1',pageSize:'100'});if(typeFilter)params.set('type',typeFilter);if(statusFilter)params.set('status',statusFilter)
      const first=await api<{items:CustomerItem[];totalCount:number}>(`/api/customers/?${params}`,token)
      const rows=[...first.items]
      for(let nextPage=2;rows.length<first.totalCount;nextPage++){
        params.set('page',String(nextPage));const result=await api<{items:CustomerItem[];totalCount:number}>(`/api/customers/?${params}`,token);if(!result.items.length)break;rows.push(...result.items)
      }
      const data=rows.map(item=>({'Cari kodu':item.code,'Ünvan':item.name,'Cari grubu':item.groupName||'','Tür':item.type==='Customer'?'Müşteri':item.type==='Supplier'?'Tedarikçi':'Müşteri & Tedarikçi','Döviz':item.currencyCode,'Vade (gün)':item.paymentTermDays,'Vergi no':item.taxNumber||'','Vergi dairesi':item.taxOffice||'','Risk limiti':item.riskLimit??'','Durum':item.isActive?'Aktif':'Pasif'}))
      const fileName=`cariler-${localDateString()}.${format}`
      if(format==='xlsx'){const XLSX=await import('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(data),'Cariler');XLSX.writeFileXLSX(workbook,fileName)}
      else {const headers=Object.keys(data[0]||{'Cari kodu':''});const cell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;const csv=[headers.map(cell).join(','),...data.map(row=>headers.map(header=>cell((row as Record<string,unknown>)[header])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
    } catch(error) { setError((error as Error).message) } finally { setExportBusy(false) }
  }
  async function loadScreenLayout() {
    try {
      const active=await api<{fields:BuiltInScreenLayoutField[]}>('/api/screen-views/customers/active',token)
      setScreenFields(active.fields.map((field,index)=>({...field,fixed:field.key==='actions',position:field.position??index})))
    } catch(e) { setError((e as Error).message) }
  }
  async function loadCustomerDetailLayout() {
    try {
      const active=await api<{fields:BuiltInScreenLayoutField[]}>('/api/screen-views/customer-details/active',token)
      const existing=active.fields.map((field,index)=>({...field,position:field.position??index})).sort((a,b)=>a.position-b.position)
      const existingKeys=new Set(existing.map(field=>field.key))
      const additions=[{key:'identityNumber',label:'T.C. kimlik no',visible:true},{key:'taxOffice',label:'Vergi dairesi',visible:true}].filter(field=>!existingKeys.has(field.key))
      const taxNumberIndex=existing.findIndex(field=>field.key==='taxNumber')
      const fields=taxNumberIndex<0?[...existing,...additions]:[...existing.slice(0,taxNumberIndex+1),...additions,...existing.slice(taxNumberIndex+1)]
      setDetailFields(fields.map((field,position)=>({...field,position})))
    } catch(e) { setError((e as Error).message) }
  }
  async function loadGroups() { try { setGroups(await api<CustomerGroupItem[]>('/api/customer-groups/',token)) } catch(e) { setError((e as Error).message) } }
  const visibleScreenFields=useMemo(()=>screenFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position),[screenFields])
  const visibleScreenGroups=useMemo(()=>groupBuiltInScreenFields(visibleScreenFields),[visibleScreenFields])
  const selectedCustomer=items.find(item=>item.id===selectedCustomerId)??null
  useEffect(()=>{const media=window.matchMedia('(max-width: 1280px)');const update=()=>setIsSmallScreen(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  useEffect(()=>{if(loading)return;if(items.length===0){if(selectedCustomerId)setSelectedCustomerId(null);return}if(!selectedCustomerId){if(isSmallScreen||hasAutoSelectedCustomer)return;setSelectedCustomerId(items[0].id);setHasAutoSelectedCustomer(true);return}if(!items.some(item=>item.id===selectedCustomerId)){if(isSmallScreen){setSelectedCustomerId(null);return}setSelectedCustomerId(items[0].id)}},[items,loading,selectedCustomerId,isSmallScreen,hasAutoSelectedCustomer])
  useEffect(()=>{ void load(); void loadGroups() },[token,filter,page,typeFilter,statusFilter])
  useEffect(()=>{let cancelled=false;api<CustomerCompanyOption[]>('/api/customers/company-options',token).then(options=>{if(!cancelled)setCompanyOptions(options)}).catch(()=>{if(!cancelled)setCompanyOptions([])});return()=>{cancelled=true}},[token])
  useEffect(()=>{let cancelled=false;api<CustomerLocationDefinitions>('/api/location-definitions/',token).then(data=>{if(!cancelled)setLocationDefinitions(data)}).catch(()=>{if(!cancelled)setLocationDefinitions({provinces:[],districts:[]})});return()=>{cancelled=true}},[token])
  useEffect(()=>{ void loadScreenLayout() },[token])
  useEffect(()=>{ void loadCustomerDetailLayout() },[token])
  useEffect(()=>{
    let cancelled=false
    setCustomerDetailAddress(null)
    setCustomerDetailAddressLoaded(false)
    if(!selectedCustomerId)return ()=>{cancelled=true}
    void api<CustomerAddressItem[]>(`/api/customers/${selectedCustomerId}/addresses`,token).then(addresses=>{
      if(!cancelled){setCustomerDetailAddress(addresses.find(address=>address.isActive&&address.isDefault&&address.kind==='General')??addresses.find(address=>address.isActive&&address.isDefault)??null);setCustomerDetailAddressLoaded(true)}
    }).catch(()=>{if(!cancelled){setCustomerDetailAddress(null);setCustomerDetailAddressLoaded(true)}})
    return ()=>{cancelled=true}
  },[selectedCustomerId,token])
  const visibleCustomerDetailFields=useMemo(()=>detailFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position),[detailFields])
  async function openCustomerModal() {
    setCustomerCreateValues({});setCode('');setName('');setTaxNumber('');setIdentityNumber('');setTaxOffice('');setType('Customer');setGroupId('');setParentCompanyId('');setCurrencyCode('TRY');setRiskLimit('');setPaymentTermDays('0');setAddressLabel('Merkez');setAddressLine('');setAddressCity('');setAddressDistrict('');setAddressPostalCode('');setAddressCountry('TR');setAddressLatitude(null);setAddressLongitude(null);setError('')
    try { setCustomerCreateFields(await api<CustomerCustomFieldDefinition[]>('/api/customers/custom-fields',token));setModal(true) }
    catch(e) { setError((e as Error).message) }
  }
  async function create(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { await api<CustomerItem>('/api/customers/',token,{method:'POST',body:JSON.stringify({code,name,type,taxNumber:taxNumber||null,identityNumber:identityNumber||null,taxOffice:taxOffice||null,address:addressLine.trim()||addressCity.trim()||addressDistrict.trim()||addressPostalCode.trim()?{kind:'General',label:addressLabel||'Merkez',addressLine,city:addressCity,district:addressDistrict||null,postalCode:addressPostalCode||null,countryCode:addressCountry,isDefault:true,latitude:addressLatitude,longitude:addressLongitude}:null,isActive:true,groupId:groupId||null,parentCompanyId:parentCompanyId||null,currencyCode,riskLimit:riskLimit?Number(riskLimit):null,paymentTermDays:Number(paymentTermDays),customFields:customerCreateValues})}); setCode('');setName('');setTaxNumber('');setIdentityNumber('');setTaxOffice('');setType('Customer');setGroupId('');setParentCompanyId('');setCurrencyCode('TRY');setRiskLimit('');setPaymentTermDays('0');setCustomerCreateValues({});setModal(false);setNotice('Cari kartı oluşturuldu.'); if(page!==1)setPage(1);else await load() }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function openEditCustomer(item:CustomerItem) {
    setError('');setNotice('');setCode(item.code);setName(item.name);setType(item.type);setTaxNumber(item.taxNumber||'');setIdentityNumber(item.identityNumber||'');setTaxOffice(item.taxOffice||'');setGroupId(item.groupId||'');setParentCompanyId(item.parentCompanyId||'');setCurrencyCode(item.currencyCode);setRiskLimit(item.riskLimit==null?'':String(item.riskLimit));setPaymentTermDays(String(item.paymentTermDays));setAddressLabel('Merkez');setAddressLine('');setAddressCity('');setAddressDistrict('');setAddressPostalCode('');setAddressCountry('TR');setAddressLatitude(null);setAddressLongitude(null)
    try { const existing=await api<CustomerAddressItem[]>(`/api/customers/${item.id}/addresses`,token); const primary=existing.find(x=>x.kind==='General'&&x.isDefault&&x.isActive); if(primary){setAddressLabel(primary.label);setAddressLine(primary.addressLine);setAddressCity(primary.city);setAddressDistrict(primary.district||'');setAddressPostalCode(primary.postalCode||'');setAddressCountry(primary.countryCode||'TR');setAddressLatitude(primary.latitude);setAddressLongitude(primary.longitude)} } catch(e) { setError((e as Error).message) }
    setEditingCustomer(item)
  }
  async function saveCustomerEdit(e:React.FormEvent) {
    e.preventDefault();if(!editingCustomer)return;setBusy(true);setError('');setNotice('')
    try {
      await api<CustomerItem>(`/api/customers/${editingCustomer.id}`,token,{method:'PUT',body:JSON.stringify({code,name,type,taxNumber:taxNumber||null,identityNumber:identityNumber||null,taxOffice:taxOffice||null,address:addressLine.trim()||addressCity.trim()||addressDistrict.trim()||addressPostalCode.trim()?{kind:'General',label:addressLabel||'Merkez',addressLine,city:addressCity,district:addressDistrict||null,postalCode:addressPostalCode||null,countryCode:addressCountry,isDefault:true,latitude:addressLatitude,longitude:addressLongitude}:null,isActive:editingCustomer.isActive,rowVersion:editingCustomer.rowVersion,groupId:groupId||null,parentCompanyId:parentCompanyId||null,currencyCode,riskLimit:riskLimit?Number(riskLimit):null,paymentTermDays:Number(paymentTermDays)})})
      setEditingCustomer(null);setNotice('Cari kartı güncellendi.');await load()
    } catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function createGroup(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setGroupError('')
    try {
      const group=await api<CustomerGroupItem>(editingGroup?`/api/customer-groups/${editingGroup.id}`:'/api/customer-groups/',token,{method:editingGroup?'PUT':'POST',body:JSON.stringify({code:groupCode,name:groupName})})
      setGroups(current=>editingGroup?current.map(item=>item.id===group.id?group:item):[...current,group]);setGroupCode('');setGroupName('');setEditingGroup(null);setGroupModal(false);setNotice(editingGroup?'Cari grubu güncellendi.':'Cari grubu oluşturuldu.')
    } catch(e) { setGroupError((e as Error).message) } finally { setBusy(false) }
  }
  async function deleteGroup(group:CustomerGroupItem) {
    if(!await confirmCustomerAction(`“${group.name}” grubu silinsin mi? Gruba bağlı cari kartları varsa silme işlemi engellenir.`,{title:'Cari grubunu sil',confirmLabel:'Grubu sil',danger:true}))return
    setBusy(true);setGroupError('')
    try { await api(`/api/customer-groups/${group.id}`,token,{method:'DELETE'});setGroups(current=>current.filter(item=>item.id!==group.id));setNotice('Cari grubu silindi.') }
    catch(e) { setGroupError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggleActive(item:CustomerItem) {
    setBusy(true);setError('');setNotice('')
    try { await api<CustomerItem>(`/api/customers/${item.id}`,token,{method:'PUT',body:JSON.stringify({code:item.code,name:item.name,type:item.type,taxNumber:item.taxNumber,identityNumber:item.identityNumber,taxOffice:item.taxOffice,isActive:!item.isActive,rowVersion:item.rowVersion,groupId:item.groupId,parentCompanyId:item.parentCompanyId||null,currencyCode:item.currencyCode,riskLimit:item.riskLimit,paymentTermDays:item.paymentTermDays})});setNotice(item.isActive?'Cari kart pasife alındı.':'Cari kart yeniden etkinleştirildi.');await load() }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function openCustomerFields(item:CustomerItem) {
    setFieldCustomer(item);setCustomerFields([]);setCustomerFieldValues({});setCustomerFieldMetadataDefinition(null);setCustomerFieldMetadataHistory([]);setCustomerFieldValueHistoryDefinition(null);setCustomerFieldValueHistory([]);setError('')
    try { const [definitions,values]=await Promise.all([api<CustomerCustomFieldDefinition[]>('/api/customers/custom-fields',token),api<CustomerCustomFieldValue[]>(`/api/customers/${item.id}/custom-fields`,token)]);setCustomerFields(definitions);setCustomerFieldValues(Object.fromEntries(values.map(value=>[value.code,value.value]))) }
    catch(e) { setError((e as Error).message) }
  }
  async function saveCustomerFieldValues(e:React.FormEvent) {
    e.preventDefault();if(!fieldCustomer)return;setBusy(true);setError('')
    try { const values=await api<CustomerCustomFieldValue[]>(`/api/customers/${fieldCustomer.id}/custom-fields`,token,{method:'PUT',body:JSON.stringify({values:customerFieldValues})});setCustomerFieldValues(Object.fromEntries(values.map(value=>[value.code,value.value])));setNotice('Cari özel alan değerleri kaydedildi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function createCustomerField(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('')
    try { await api<CustomerCustomFieldDefinition>('/api/customers/custom-fields',token,{method:'POST',body:JSON.stringify({code:customerFieldCode,label:customerFieldLabel,dataType:customerFieldType,maxLength:Number(customerFieldMaxLength),isRequired:customerFieldRequired})});setCustomerFieldCode('');setCustomerFieldLabel('');setCustomerFieldMaxLength('200');setCustomerFieldRequired(false);if(fieldCustomer)await openCustomerFields(fieldCustomer);setCustomerFieldDefinitionScreen('list');setNotice('Cari özel alan tanımı oluşturuldu.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function deactivateCustomerField(field:CustomerCustomFieldDefinition) {
    if(!await confirmCustomerAction(`${field.label} alanı yeni değer girişinden kaldırılacak; mevcut değerler korunacak. Devam edilsin mi?`,{title:'Özel alanı devre dışı bırak',confirmLabel:'Devre dışı bırak',danger:true}))return;setBusy(true);setError('')
    try { await api<void>(`/api/customers/custom-fields/${field.id}`,token,{method:'DELETE'});setCustomerFields(current=>current.filter(item=>item.id!==field.id));await loadCustomerFieldMetadataHistory(field);setNotice('Cari özel alanı devre dışı bırakıldı. Sürüm geçmişinden yeniden etkinleştirebilirsiniz.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function editCustomerField(field:CustomerCustomFieldDefinition) {
    const label=(await promptCustomerValue('Özel alanı düzenle','Yeni alan etiketini girin.',field.label,{valueLabel:'Alan etiketi',maxLength:120}))?.trim();if(!label)return
    let maxLength=field.maxLength;if(field.dataType==='Text'){const raw=await promptCustomerValue('Metin sınırı','Karakter sayısını 1–500 arasında belirleyin.',String(field.maxLength),{valueLabel:'En fazla karakter',inputType:'number',min:1,max:500});if(raw===null)return;maxLength=Number(raw);if(!Number.isInteger(maxLength)||maxLength<1||maxLength>500){setError('Metin uzunluğu 1–500 arasında olmalıdır.');return}}
    const requiredValue=await promptCustomerValue('Zorunluluk ayarı','Zorunlu yapmak için tüm mevcut carilerde değer bulunmalıdır.',field.isRequired?'true':'false',{valueLabel:'Zorunlu alan',choices:[{value:'true',label:'Evet'},{value:'false',label:'Hayır'}]});if(requiredValue===null)return
    const isRequired=requiredValue==='true'
    setBusy(true);setError('')
    try { await api<CustomerCustomFieldDefinition>(`/api/customers/custom-fields/${field.id}`,token,{method:'PUT',body:JSON.stringify({label,maxLength,isRequired})});if(fieldCustomer)await openCustomerFields(fieldCustomer);await loadCustomerFieldMetadataHistory(field);setNotice('Cari özel alan tanımı yeni sürüm olarak kaydedildi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function loadCustomerFieldMetadataHistory(field:CustomerCustomFieldDefinition) {
    setCustomerFieldMetadataDefinition(field);setCustomerFieldMetadataHistory([])
    try { setCustomerFieldMetadataHistory(await api<CustomerCustomFieldRevision[]>(`/api/customers/custom-fields/${field.id}/history`,token)) }
    catch(e) { setError((e as Error).message) }
  }
  async function loadCustomerFieldValueHistory(field:CustomerCustomFieldDefinition) {
    if(!fieldCustomer)return;setCustomerFieldValueHistoryDefinition(field);setCustomerFieldValueHistory([])
    try { setCustomerFieldValueHistory(await api<CustomerCustomFieldValueRevision[]>(`/api/customers/${fieldCustomer.id}/custom-fields/${field.id}/history`,token)) }
    catch(e) { setError((e as Error).message) }
  }
  async function restoreCustomerFieldValueRevision(revision:CustomerCustomFieldValueRevision) {
    if(!fieldCustomer||!customerFieldValueHistoryDefinition||!await confirmCustomerAction(`${revision.label} alanının ${new Date(revision.createdAt).toLocaleString('tr-TR')} tarihli değişikliği geri alınsın mı? Bu işlem yeni bir geçmiş kaydı oluşturur.`,{title:'Önceki değeri geri yükle',confirmLabel:'Geri yükle'}))return
    setBusy(true);setError('')
    try { await api<CustomerCustomFieldValue>(`/api/customers/${fieldCustomer.id}/custom-fields/${revision.definitionId}/history/${revision.id}/restore`,token,{method:'POST',body:JSON.stringify({confirmation:true})});await openCustomerFields(fieldCustomer);await loadCustomerFieldValueHistory(customerFieldValueHistoryDefinition);setNotice('Önceki cari özel alan değeri geri yüklendi; işlem geçmişe eklendi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function restoreCustomerFieldMetadataRevision(revision:CustomerCustomFieldRevision) {
    if(!customerFieldMetadataDefinition||!await confirmCustomerAction(`${revision.code} alanının v${revision.version} tanımı geri yüklensin mi? Bu işlem yeni sürüm oluşturur.`,{title:'Alan tanımını geri yükle',confirmLabel:'Geri yükle'}))return
    setBusy(true);setError('')
    try { await api<CustomerCustomFieldDefinition>(`/api/customers/custom-fields/${revision.definitionId}/restore`,token,{method:'POST',body:JSON.stringify({version:revision.version,confirmation:true})});if(fieldCustomer)await openCustomerFields(fieldCustomer);await loadCustomerFieldMetadataHistory(customerFieldMetadataDefinition);setNotice(`v${revision.version} tanımı yeni sürüm olarak geri yüklendi.`) }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function openAddresses(item:CustomerItem) {
    setError('');setAddressKind('General');setAddressLabel('');setAddressLine('');setAddressCity('');setAddressDistrict('');setAddressPostalCode('');setAddressCountry('TR');setAddressLatitude(null);setAddressLongitude(null);setAddressCustomer(item)
    try { setAddresses(await api<CustomerAddressItem[]>(`/api/customers/${item.id}/addresses`,token)) } catch(e) { setError((e as Error).message) }
  }
  async function createAddress(e:React.FormEvent) {
    e.preventDefault();if(!addressCustomer)return;setBusy(true);setError('')
    try { const isDefault=!addresses.some(x=>x.isActive&&x.kind===addressKind&&x.isDefault);const address=await api<CustomerAddressItem>(`/api/customers/${addressCustomer.id}/addresses`,token,{method:'POST',body:JSON.stringify({kind:addressKind,label:addressLabel,addressLine,city:addressCity,district:addressDistrict||null,postalCode:addressPostalCode||null,countryCode:addressCountry,isDefault,latitude:addressLatitude,longitude:addressLongitude})});const nextAddresses=[...addresses.filter(x=>!(address.isDefault&&x.kind===address.kind)),address];setAddresses(nextAddresses);setCustomerDetailAddress(nextAddresses.find(x=>x.isActive&&x.isDefault&&x.kind==='General')??nextAddresses.find(x=>x.isActive&&x.isDefault)??null);setCustomerDetailAddressLoaded(true);setAddressLabel('');setAddressLine('');setAddressCity('');setAddressDistrict('');setAddressPostalCode('');setAddressLatitude(null);setAddressLongitude(null);setNotice('Adres kaydedildi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function toggleAddressActive(address:CustomerAddressItem) {
    if(!addressCustomer)return;setBusy(true);setError('')
    try { const updated=await api<CustomerAddressItem>(`/api/customers/${addressCustomer.id}/addresses/${address.id}`,token,{method:'PUT',body:JSON.stringify({...address,isActive:!address.isActive,isDefault:address.isActive?false:address.isDefault})});const nextAddresses=addresses.map(x=>x.id===address.id?updated:x);setAddresses(nextAddresses);setCustomerDetailAddress(nextAddresses.find(x=>x.isActive&&x.isDefault&&x.kind==='General')??nextAddresses.find(x=>x.isActive&&x.isDefault)??null);setCustomerDetailAddressLoaded(true) }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function openLedger(item:CustomerItem) {
    setError('');setLedgerCustomer(item);setLedgerBalance(null);setStatement(null);setStatementPage(1);setReconciliationPage(1);setExternalRows([]);setExternalFileName('')
    try { const [balance,statementData]=await Promise.all([api<CustomerBalance>(`/api/customers/${item.id}/balance`,token),api<CustomerStatement>(`/api/customers/${item.id}/statement?from=${statementFrom}&to=${statementTo}`,token)]);setLedgerBalance(balance);setStatement(statementData);setStatementPage(1) }
    catch(e) { setError((e as Error).message) }
  }
  async function reloadStatement(){if(!ledgerCustomer)return;setError('');try{const data=await api<CustomerStatement>(`/api/customers/${ledgerCustomer.id}/statement?from=${statementFrom}&to=${statementTo}`,token);setStatement(data);setStatementPage(1);setExternalRows([]);setExternalFileName('')}catch(e){setError((e as Error).message)}}
  function downloadCustomerStatement(){if(!statement)return;const escape=(value:string)=>`"${value.replace(/"/g,'""')}"`;const rows=[['date','direction','amount','description','balance'],...statement.items.map(x=>[x.entryDate,x.direction,x.amount.toFixed(2),x.description,x.balance.toFixed(2)])];const csv=`\uFEFF${rows.map(row=>row.map(escape).join(';')).join('\r\n')}`;const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`cari-ekstresi-${statement.customerCode}-${statement.from}-${statement.to}.csv`;anchor.click();URL.revokeObjectURL(url)}
  async function importCustomerStatement(file:File|null){if(!file)return;setError('');try{const rows=parseCustomerStatementCsv(await file.text());setExternalRows(rows);setReconciliationPage(1);setExternalFileName(file.name)}catch(e){setExternalRows([]);setReconciliationPage(1);setExternalFileName('');setError((e as Error).message)}}
  const statementPageSize=50,statementPageCount=Math.max(1,Math.ceil((statement?.items.length??0)/statementPageSize)),pagedStatementItems=statement?.items.slice((statementPage-1)*statementPageSize,statementPage*statementPageSize)??[]
  const reconciliation=useMemo(()=>{const buckets=new Map<string,{items:CustomerStatement['items'];cursor:number}>(),matchedErpIds=new Set<string>(),externalMatched=new Set<number>();let matched=0;if(statement){for(const item of statement.items){const key=`${item.entryDate}|${item.direction}|${Math.round(item.amount*100)}`;const bucket=buckets.get(key);if(bucket)bucket.items.push(item);else buckets.set(key,{items:[item],cursor:0})}externalRows.forEach((external,index)=>{const direction=externalPerspective==='counterparty'?(external.direction==='Debit'?'Credit':'Debit'):external.direction,key=`${external.entryDate}|${direction}|${Math.round(external.amount*100)}`,bucket=buckets.get(key),candidate=bucket?.items[bucket.cursor];if(candidate&&Math.abs(candidate.amount-external.amount)<0.005){bucket.cursor++;matchedErpIds.add(candidate.id);externalMatched.add(index);matched++}})}const erpUnmatchedItems=statement?.items.filter(item=>!matchedErpIds.has(item.id))??[],externalUnmatchedItems=externalRows.filter((_,index)=>!externalMatched.has(index)),rows=[...erpUnmatchedItems.map(item=>({key:`erp-${item.id}`,source:'erp' as const,item})),...externalUnmatchedItems.map((item,index)=>({key:`external-${index}`,source:'external' as const,item}))];return {matched,erpUnmatched:erpUnmatchedItems.length,externalUnmatched:externalUnmatchedItems.length,rows,totalUnmatched:rows.length}},[statement,externalRows,externalPerspective])
  const reconciliationPageSize=50,reconciliationPageCount=Math.max(1,Math.ceil(reconciliation.totalUnmatched/reconciliationPageSize)),visibleReconciliationRows=reconciliation.rows.slice((reconciliationPage-1)*reconciliationPageSize,reconciliationPage*reconciliationPageSize)
  async function createMovement(e:React.FormEvent) {
    e.preventDefault();if(!ledgerCustomer)return;setBusy(true);setError('')
    try { await api<CustomerLedgerItem>(`/api/customers/${ledgerCustomer.id}/ledger`,token,{method:'POST',body:JSON.stringify({entryDate:movementDate,direction:movementDirection,amount:Number(movementAmount),currencyCode:ledgerCustomer.currencyCode,description:movementDescription})});setMovementAmount('');setMovementDescription('');setCustomerMovementOpen(false);await openLedger(ledgerCustomer);setNotice('Cari hareketi kaydedildi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function reverseMovement(item:CustomerLedgerItem) {
    if(!ledgerCustomer)return;const reason=(await promptCustomerValue('Cari hareketini ters kaydet','Bu hareket silinmez; karşı yönlü yeni kayıt oluşturulur. Ters kayıt nedenini girin.','',{valueLabel:'Ters kayıt nedeni',maxLength:240}))?.trim();if(!reason)return;setBusy(true);setError('')
    try { await api<CustomerLedgerItem>(`/api/customers/${ledgerCustomer.id}/ledger/${item.id}/reverse`,token,{method:'POST',body:JSON.stringify({reason})});await openLedger(ledgerCustomer);setNotice('Ters kayıt oluşturuldu; kaynak hareket silinmedi.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function renderScreenCell(field:BuiltInScreenLayoutField,item:CustomerItem) {
    switch(field.key) {
      case 'code': return <span className="customer-code">{item.code}</span>
      case 'name': return <><b className="customer-name">{item.name}</b>{item.riskLimit!=null&&<small className="cell-subtitle">Risk {item.riskLimit.toLocaleString('tr-TR')}</small>}</>
      case 'groupName': return item.groupName||'Grup atanmamış'
      case 'type': return <span className={`party-pill ${item.type.toLowerCase()}`}>{item.type==='Customer'?'Müşteri':item.type==='Supplier'?'Tedarikçi':'Müşteri & Tedarikçi'}</span>
      case 'currencyCode': return item.currencyCode
      case 'paymentTermDays': return `${item.paymentTermDays} gün`
      case 'taxNumber': return <span className="tax-cell">{item.taxNumber||'—'}</span>
      case 'status': return <span className={`active-pill ${item.isActive?'yes':'no'}`}><i/>{item.isActive?'Aktif':'Pasif'}</span>
      case 'actions': return <CustomerActionsMenu item={item} busy={busy} onEdit={()=>openEditCustomer(item)} onInvoices={()=>setSalesInvoicesCustomer(item)} onPurchaseInvoices={()=>onOpenPurchaseInvoices({id:item.id,name:item.name})} onLedger={()=>void openLedger(item)} onAddresses={()=>void openAddresses(item)} onFields={()=>void openCustomerFields(item)} onToggleActive={()=>void toggleActive(item)}/>
      default: return '—'
    }
  }
  return <><CustomerDirectoryHeader canImport={role==='TenantAdmin'} exportBusy={exportBusy} onImport={()=>setImportOpen(true)} onExport={format=>void exportCustomers(format)} onGroups={()=>{setEditingGroup(null);setGroupCode('');setGroupName('');setGroupError('');setGroupModal(true)}} onCreate={()=>void openCustomerModal()}/>
    {error&&<div className="alert inline-alert">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}{notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <nav className="customer-directory-tabs" aria-label="Cari türü sekmeleri">{[{label:'Tüm Cariler',value:''},{label:'Müşteriler',value:'Customer'},{label:'Tedarikçiler',value:'Supplier'},{label:'Diğer',value:'Both'}].map(tab=><button type="button" key={tab.label} className={typeFilter===tab.value?'active':''} aria-current={typeFilter===tab.value?'page':undefined} onClick={()=>{setTypeFilter(tab.value);setPage(1)}}>{tab.label}</button>)}</nav>
    <CustomerFilters search={search} typeFilter={typeFilter} statusFilter={statusFilter} onSearchChange={setSearch} onTypeChange={value=>{setTypeFilter(value);setPage(1)}} onStatusChange={value=>{setStatusFilter(value);setPage(1)}} onApply={()=>{setPage(1);setFilter(search.trim())}}/>
    <div className="customer-directory-layout"><div className="erp-workbench customer-workbench"><CustomerGrid items={items} fields={visibleScreenFields} groups={visibleScreenGroups} total={total} page={page} loading={loading} filter={filter} selectedCustomerId={selectedCustomer?.id??null} onRefresh={()=>void load()} onPageChange={setPage} onSelect={item=>setSelectedCustomerId(item.id)} renderCell={renderScreenCell}/></div>
    <CustomerDetailPanel customer={selectedCustomer} isSmallScreen={isSmallScreen} tab={customerDetailTab} fields={visibleCustomerDetailFields} address={customerDetailAddress} addressLoaded={customerDetailAddressLoaded} onTabChange={setCustomerDetailTab} onClose={()=>setSelectedCustomerId(null)} onBackdropClose={()=>setSelectedCustomerId(null)} onEdit={()=>selectedCustomer&&void openEditCustomer(selectedCustomer)} onInvoices={()=>selectedCustomer&&setSalesInvoicesCustomer(selectedCustomer)} onLedger={()=>selectedCustomer&&void openLedger(selectedCustomer)} onAddresses={()=>selectedCustomer&&void openAddresses(selectedCustomer)} onFields={()=>selectedCustomer&&void openCustomerFields(selectedCustomer)}/></div>
    {editingCustomer&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditingCustomer(null)}}><div className="modal customer-edit-modal"><div className="modal-head"><div><p className="eyebrow">CARİ YÖNETİMİ · DÜZENLEME</p><h2>{editingCustomer.code} cari kartı</h2></div><button type="button" className="icon-button" disabled={busy} aria-label="Düzenlemeyi kapat" onClick={()=>setEditingCustomer(null)}><X size={19}/></button></div><p className="muted modal-sub">Değişiklikler yalnızca seçili firma kaydına uygulanır. Eşzamanlı güncelleme varsa yenileyip tekrar deneyin.</p>{error&&<div className="alert inline-alert" role="alert">{error}<button type="button" aria-label="Hatayı kapat" onClick={()=>setError("")}><X size={15}/></button></div>}<form onSubmit={saveCustomerEdit} className="customer-edit-form">
          <div className="customer-edit-fields">
            <fieldset className="customer-edit-section">
              <legend>Cari bilgileri</legend>
              <div className="form-two">
                <label>Cari kodu<input value={code} onChange={e=>setCode(e.target.value)} required maxLength={64}/></label>
                <label>Cari türü<select value={type} onChange={e=>setType(e.target.value as CustomerItem['type'])}><option value="Customer">Müşteri</option><option value="Supplier">Tedarikçi</option><option value="Both">Müşteri &amp; Tedarikçi</option></select></label>
              </div>
              <label>Ünvan<input value={name} onChange={e=>setName(e.target.value)} required maxLength={200}/></label>
              <div className="form-two">
                <label>Cari grubu<select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Grup atama</option>{groups.filter(x=>x.isActive).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Grup şirketi / Ana firma<select value={parentCompanyId} onChange={event=>setParentCompanyId(event.target.value)}><option value="">Bağımsız firma</option>{companyOptions.filter(company=>company.id!==editingCustomer?.id).map(company=><option key={company.id} value={company.id}>{company.name} · {company.code}</option>)}</select><small>Bu cari seçilen ana firmanın alt firması olur.</small></label>
                <label>Döviz kodu<input value={currencyCode} onChange={e=>setCurrencyCode(e.target.value.toUpperCase().slice(0,3))} required maxLength={3}/></label>
              </div>
            </fieldset>
            <fieldset className="customer-edit-section">
              <legend>Finansal bilgiler</legend>
              <div className="form-two">
                <label>Risk limiti<input type="number" min="0" step="0.01" value={riskLimit} onChange={e=>setRiskLimit(e.target.value)} placeholder="Belirtilmedi"/></label>
                <label>Vade günü<input type="number" min="0" max="3650" value={paymentTermDays} onChange={e=>setPaymentTermDays(e.target.value)} required/></label>
              </div>
            </fieldset>
            <fieldset className="customer-edit-section">
              <legend>Vergi ve adres bilgileri <span>İsteğe bağlı</span></legend>
              <div className="form-two">
                <label>T.C. kimlik no<input inputMode="numeric" value={identityNumber} onChange={e=>setIdentityNumber(e.target.value.replace(/\D/g,"").slice(0,11))} maxLength={11} placeholder="11 haneli TCKN"/></label>
                <label>Vergi numarası<input inputMode="numeric" value={taxNumber} onChange={e=>setTaxNumber(e.target.value)} maxLength={32} placeholder="VKN"/></label>
              </div>
              <div className="form-two">
                <label>Vergi dairesi<input value={taxOffice} onChange={e=>setTaxOffice(e.target.value)} maxLength={120}/></label>
                <label>Posta kodu<input value={addressPostalCode} onChange={e=>setAddressPostalCode(e.target.value)} maxLength={20}/></label>
                <CustomerCountryInput value={addressCountry} onChange={value=>{setAddressCountry(value);setAddressCity('');setAddressDistrict('')}}/>
              </div>
              <label>Adres<textarea value={addressLine} onChange={e=>setAddressLine(e.target.value)} maxLength={400} required={!!(addressCity.trim()||addressDistrict.trim()||addressPostalCode.trim())} placeholder="Mahalle, cadde, sokak ve kapı no"/></label>
              <div className="form-two">
                <CustomerLocationInput id="customer-edit-province" label="İl" value={addressCity} options={addressCountry==='TR'?locationDefinitions.provinces:[]} required={!!(addressLine.trim()||addressDistrict.trim()||addressPostalCode.trim())} onChange={value=>{setAddressCity(value);setAddressDistrict('')}}/>
                <CustomerLocationInput id="customer-edit-district" label="İlçe" value={addressDistrict} options={addressCountry==='TR'?turkeyDistrictsForProvince(addressCity,locationDefinitions.provinces,locationDefinitions.districts):[]} onChange={setAddressDistrict}/>
              </div>
            </fieldset>
          </div>
          <div className="modal-foot customer-edit-footer"><span><ShieldCheck size={14}/>{editingCustomer.isActive?'Aktif cari kartı':'Pasif cari kartı'} · sürüm kontrollü kayıt</span><div><button type="button" className="secondary" disabled={busy} onClick={()=>setEditingCustomer(null)}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Değişiklikleri kaydet'} <span>→</span></button></div></div>
        </form></div></div>}
    {modal&&<div className="master-data-create-backdrop"><section className="master-data-create-surface customer-create-modal"><div className="modal-head"><div><p className="eyebrow">CARİ YÖNETİMİ</p><h2>Yeni cari kartı</h2></div><button className="icon-button" onClick={()=>setModal(false)}><X size={19}/></button></div><p className="muted modal-sub">Bu kart yalnızca seçili firmanızda kullanılabilir.</p><form className="customer-create-form" onSubmit={create}><nav className="customer-create-tabs" aria-label="Cari form bölümleri">{[['basic','Genel bilgiler','customer-create-basic'],['finance','Finansal bilgiler','customer-create-finance'],['contact','Vergi ve iletişim','customer-create-contact'],['other','Diğer bilgiler','customer-create-other']].map(([key,label,id])=><button key={key} type="button" aria-current={customerCreateTab===key?'page':undefined} onClick={()=>{setCustomerCreateTab(key);document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}}>{label}</button>)}</nav><div className="customer-create-fields"><fieldset id="customer-create-basic" className="customer-create-section"><legend>Temel bilgiler</legend><div className="form-two"><label>Cari kodu<input value={code} onChange={e=>setCode(e.target.value)} required maxLength={64} placeholder="Örn. C-1001"/></label><label>Cari türü<select value={type} onChange={e=>setType(e.target.value as CustomerItem['type'])}><option value="Customer">Müşteri</option><option value="Supplier">Tedarikçi</option><option value="Both">Müşteri & Tedarikçi</option></select></label></div><label>Ünvan<input value={name} onChange={e=>setName(e.target.value)} required maxLength={200} placeholder="Firma veya kişi adı"/></label></fieldset><fieldset id="customer-create-finance" className="customer-create-section"><legend>Finansal bilgiler</legend><div className="form-two"><label>Cari grubu<select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Grup atama</option>{groups.filter(x=>x.isActive).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Grup şirketi / Ana firma<select value={parentCompanyId} onChange={event=>setParentCompanyId(event.target.value)}><option value="">Bağımsız firma</option>{companyOptions.filter(company=>company.id!==editingCustomer?.id).map(company=><option key={company.id} value={company.id}>{company.name} · {company.code}</option>)}</select><small>Bu cari seçilen ana firmanın alt firması olur.</small></label><label>Döviz kodu<input value={currencyCode} onChange={e=>setCurrencyCode(e.target.value.toUpperCase().slice(0,3))} required maxLength={3} placeholder="TRY"/></label><label>Risk limiti<input type="number" min="0" step="0.01" value={riskLimit} onChange={e=>setRiskLimit(e.target.value)} placeholder="Belirtilmedi"/></label><label>Vade günü<input type="number" min="0" max="3650" value={paymentTermDays} onChange={e=>setPaymentTermDays(e.target.value)}/></label></div></fieldset><fieldset id="customer-create-contact" className="customer-create-section"><legend>Vergi ve iletişim bilgileri</legend><div className="form-two"><label>T.C. kimlik no <span className="optional-label">İsteğe bağlı</span><input inputMode="numeric" value={identityNumber} onChange={e=>setIdentityNumber(e.target.value.replace(/\D/g,"").slice(0,11))} maxLength={11} placeholder="11 haneli TCKN"/></label><label>Vergi numarası <span className="optional-label">İsteğe bağlı</span><input inputMode="numeric" value={taxNumber} onChange={e=>setTaxNumber(e.target.value)} maxLength={32} placeholder="VKN"/></label><label>Vergi dairesi <span className="optional-label">İsteğe bağlı</span><input value={taxOffice} onChange={e=>setTaxOffice(e.target.value)} maxLength={120}/></label><label>Posta kodu <span className="optional-label">İsteğe bağlı</span><input value={addressPostalCode} onChange={e=>setAddressPostalCode(e.target.value)} maxLength={20}/></label><CustomerCountryInput value={addressCountry} onChange={value=>{setAddressCountry(value);setAddressCity('');setAddressDistrict('')}}/></div><label>Adres <span className="optional-label">İsteğe bağlı</span><textarea value={addressLine} onChange={e=>setAddressLine(e.target.value)} maxLength={400} required={!!(addressCity.trim()||addressDistrict.trim()||addressPostalCode.trim())} placeholder="Mahalle, cadde, sokak ve kapı no"/></label><div className="form-two"><CustomerLocationInput id="customer-create-province" label="İl" value={addressCity} options={addressCountry==='TR'?locationDefinitions.provinces:[]} required={!!(addressLine.trim()||addressDistrict.trim()||addressPostalCode.trim())} onChange={value=>{setAddressCity(value);setAddressDistrict('')}}/><CustomerLocationInput id="customer-create-district" label="İlçe" value={addressDistrict} options={addressCountry==='TR'?turkeyDistrictsForProvince(addressCity,locationDefinitions.provinces,locationDefinitions.districts):[]} onChange={setAddressDistrict}/></div><CustomerLocationMap latitude={addressLatitude} longitude={addressLongitude} onChange={(latitude,longitude)=>{setAddressLatitude(latitude);setAddressLongitude(longitude)}}/></fieldset>{customerCreateFields.length>0&&<fieldset id="customer-create-other" className="customer-create-section"><legend>Cari özel alanları</legend><p>Zorunlu değerler cari kartıyla birlikte kaydedilir.</p><div className="form-two">{customerCreateFields.map(field=><label key={field.id}>{field.label}{field.isRequired?' *':''}<small>{field.code} · {field.dataType}</small>{field.dataType==='Boolean'?<select required={field.isRequired} value={customerCreateValues[field.code]||''} onChange={e=>setCustomerCreateValues(current=>({...current,[field.code]:e.target.value}))}><option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option></select>:<input type={field.dataType==='Decimal'?'number':field.dataType==='Date'?'date':'text'} step={field.dataType==='Decimal'?'any':undefined} maxLength={field.dataType==='Text'?field.maxLength:undefined} required={field.isRequired} value={customerCreateValues[field.code]||''} onChange={e=>setCustomerCreateValues(current=>({...current,[field.code]:e.target.value}))}/>}</label>)}</div></fieldset>}</div><div className="modal-foot"><span><ShieldCheck size={14}/>{localStorage.getItem('aierp.tenant') ? JSON.parse(localStorage.getItem('aierp.tenant')||'{}').name : 'Aktif firma'}</span><div><button type="button" className="secondary" onClick={()=>setModal(false)}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Cari kartını kaydet'} <span>→</span></button></div></div></form></section></div>}
    {fieldCustomer && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setFieldCustomer(null) }}>
      <div className="modal customer-fields-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">CARİ ÖZELLEŞTİRMESİ</p>
            <h2>{fieldCustomer.code} · {fieldCustomer.name}</h2>
          </div>
          <div className="customer-field-modal-actions">{role === 'TenantAdmin' && <button type="button" className="secondary small-button" disabled={busy} onClick={() => setCustomerFieldDefinitionScreen('list')}>Alan tanımları</button>}<button type="button" className="icon-button" aria-label="Kapat" disabled={busy} onClick={() => setFieldCustomer(null)}><X size={19}/></button></div>
        </div>
        <p className="muted customer-fields-description">Firma tanımları müşteri ve tedarikçi cari kartlarında kullanılır. Değerler veri türüne göre doğrulanır.</p>
        <form className="customer-field-values-form" onSubmit={saveCustomerFieldValues}>
          <div className="requests-list customer-field-values-list">
            {customerFields.map(field => <article className="request-row expanded" key={field.id}>
              <div className="request-info">
                <label>{field.label} <small>({field.code} · {field.dataType} · v{field.version}{field.isRequired ? ' · zorunlu' : ''})</small>
                  {field.dataType === 'Boolean'
                    ? <select required={field.isRequired} value={customerFieldValues[field.code] || ''} onChange={e => setCustomerFieldValues(current => ({ ...current, [field.code]: e.target.value }))}><option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option></select>
                    : <input type={field.dataType === 'Decimal' ? 'number' : field.dataType === 'Date' ? 'date' : 'text'} step={field.dataType === 'Decimal' ? 'any' : undefined} maxLength={field.dataType === 'Text' ? field.maxLength : undefined} required={field.isRequired} value={customerFieldValues[field.code] || ''} onChange={e => setCustomerFieldValues(current => ({ ...current, [field.code]: e.target.value }))}/>}
                </label>
              </div>
              <div className="customer-field-actions">
                <button type="button" className="row-action" disabled={busy} onClick={() => void loadCustomerFieldValueHistory(field)}>Değer geçmişi</button>
              </div>
            </article>)}
            {customerFields.length === 0 && <div className="empty-small">Bu firma için henüz cari özel alanı tanımlanmadı.</div>}
          </div>
          <div className="modal-foot customer-field-values-footer">
            <span>Değerler tenant kapsamında saklanır.</span>
            <div><button type="button" className="secondary" disabled={busy} onClick={() => setFieldCustomer(null)}>Kapat</button><button className="primary" disabled={busy}>Değerleri kaydet</button></div>
          </div>
        </form>
        {customerFieldValueHistoryDefinition && <section className="panel customer-field-history">
          <div className="panel-heading"><div><b>{customerFieldValueHistoryDefinition.label} · değer geçmişi</b><small>Son 50 değişiklik; geri yükleme yeni bir geçmiş kaydı oluşturur.</small></div><button type="button" className="secondary small-button" onClick={() => setCustomerFieldValueHistoryDefinition(null)}>Kapat</button></div>
          <div className="requests-list">{customerFieldValueHistory.map(revision => <article className="request-row" key={revision.id}><div className="request-info"><b>{revision.previousValue ?? '—'} → {revision.newValue ?? '—'}</b><small>Tanım v{revision.definitionVersion} · {new Date(revision.createdAt).toLocaleString('tr-TR')}</small></div><button type="button" className="secondary small-button" disabled={busy} onClick={() => void restoreCustomerFieldValueRevision(revision)}>Önceki değeri geri yükle</button></article>)}{customerFieldValueHistory.length === 0 && <div className="empty-small">Bu alan için değer geçmişi yok.</div>}</div>
        </section>}
      </div>
    </div>}
    {fieldCustomer && role === 'TenantAdmin' && customerFieldDefinitionScreen !== 'closed' && <div className="modal-backdrop customer-field-definition-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setCustomerFieldDefinitionScreen('closed') }}>
      <section className="modal customer-fields-modal customer-field-definition-modal" role="dialog" aria-modal="true" aria-labelledby="customer-field-definition-title">
        <div className="modal-head"><div><p className="eyebrow">CARİ ÖZEL ALAN TANIMLARI</p><h2 id="customer-field-definition-title">{customerFieldDefinitionScreen === 'list' ? 'Alan tanımları' : 'Yeni alan tanımı'}</h2></div><button type="button" className="icon-button" aria-label="Kapat" disabled={busy} onClick={() => setCustomerFieldDefinitionScreen('closed')}><X size={19}/></button></div>
        {error && <div className="alert inline-alert" role="alert">{error}</div>}
        {customerFieldDefinitionScreen === 'list' ? <>
          <p className="muted customer-fields-description">Bu tanımlar firma içindeki müşteri ve tedarikçi kartlarında kullanılabilir.</p>
          <div className="requests-list customer-field-definition-list">{customerFields.map(field => <article className="request-row" key={field.id}><div className="request-info"><b>{field.label}</b><small>{field.code} · {field.dataType}{field.dataType === 'Text' ? ` · en fazla ${field.maxLength} karakter` : ''} · v{field.version}{field.isRequired ? ' · zorunlu' : ''} · {field.isActive ? 'Etkin' : 'Devre dışı'}</small></div><div className="customer-field-actions"><button type="button" className="row-action" disabled={busy} onClick={() => void editCustomerField(field)}>Düzenle</button><button type="button" className="row-action" disabled={busy} onClick={() => void loadCustomerFieldMetadataHistory(field)}>Sürüm geçmişi</button><button type="button" className="row-action danger-action" disabled={busy} onClick={() => void deactivateCustomerField(field)}>Devre dışı bırak</button></div></article>)}{customerFields.length === 0 && <div className="empty-small">Henüz cari özel alan tanımı yok.</div>}</div>
          <div className="modal-foot"><span>Alan tanımları tüm cari kartlarında geçerlidir.</span><div><button type="button" className="secondary" onClick={() => setCustomerFieldDefinitionScreen('closed')}>Kapat</button><button type="button" className="primary" onClick={() => setCustomerFieldDefinitionScreen('create')}>Yeni alan tanımla</button></div></div>
        </> : <form onSubmit={createCustomerField} className="customer-field-create-form">
          <div className="panel-heading"><div><b>Alan bilgileri</b><small>Tanım firma içindeki müşteri ve tedarikçi kartlarında kullanılabilir.</small></div></div>
          <div className="form-two"><label>Alan kodu<input value={customerFieldCode} onChange={e => setCustomerFieldCode(e.target.value.toUpperCase())} required maxLength={40} placeholder="SEKTOR"/></label><label>Ekran etiketi<input value={customerFieldLabel} onChange={e => setCustomerFieldLabel(e.target.value)} required maxLength={120}/></label></div>
          <div className="form-two"><label>Veri türü<select value={customerFieldType} onChange={e => setCustomerFieldType(e.target.value as CustomerCustomFieldDefinition['dataType'])}><option value="Text">Metin</option><option value="Decimal">Ondalık sayı</option><option value="Date">Tarih</option><option value="Boolean">Evet/Hayır</option></select></label>{customerFieldType === 'Text' && <label>En fazla karakter<input type="number" min="1" max="500" value={customerFieldMaxLength} onChange={e => setCustomerFieldMaxLength(e.target.value)} required/></label>}</div>
          <label className="check-row"><input type="checkbox" checked={customerFieldRequired} onChange={e => setCustomerFieldRequired(e.target.checked)}/> Bu alanı zorunlu yap</label>
          <div className="modal-foot"><span>Mevcut kayıtlar yeni zorunlu değer isteyebilir.</span><div><button type="button" className="secondary" disabled={busy} onClick={() => setCustomerFieldDefinitionScreen('list')}>Geri</button><button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Alan tanımını kaydet'}</button></div></div>
        </form>}
        {customerFieldMetadataDefinition && <section className="panel customer-field-history"><div className="panel-heading"><div><b>{customerFieldMetadataDefinition.code} · sürüm geçmişi</b><small>Tanım değişiklikleri korunur; geri yükleme yeni sürüm ekler.</small></div><button type="button" className="secondary small-button" onClick={() => setCustomerFieldMetadataDefinition(null)}>Kapat</button></div><div className="requests-list">{customerFieldMetadataHistory.map(revision => <article className="request-row" key={revision.id}><div className="request-info"><b>v{revision.version} · {revision.label}</b><small>{revision.dataType} · {revision.isActive ? 'Etkin' : 'Devre dışı'} · {revision.changeKind} · {new Date(revision.createdAt).toLocaleString('tr-TR')}</small></div><button type="button" className="secondary small-button" disabled={busy} onClick={() => void restoreCustomerFieldMetadataRevision(revision)}>Bu sürümü geri yükle</button></article>)}</div></section>}
      </section>
    </div>}
    {groupModal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setGroupModal(false)}}><div className="modal group-modal"><div className="modal-head"><div><p className="eyebrow">CARİ YÖNETİMİ</p><h2>Cari grupları</h2><p className="muted">Cari kartlarını sınıflandırmak için firma gruplarını yönetin.</p></div><button className="icon-button" onClick={()=>setGroupModal(false)}><X size={19}/></button></div>{groupError&&<div className="alert inline-alert">{groupError}<button onClick={()=>setGroupError('')}><X size={15}/></button></div>}<div className="group-list">{groups.map(g=><article className="group-row" key={g.id}><div className="group-mark">{g.name.slice(0,1).toUpperCase()}</div><div className="group-info"><b>{g.name}</b><small>{g.code} · {g.isActive?'Aktif':'Pasif'}</small></div><div className="group-actions"><button className="secondary small-button" disabled={busy} aria-label={`${g.name} grubunu düzenle`} onClick={()=>{setEditingGroup(g);setGroupCode(g.code);setGroupName(g.name);setGroupError('')}}><Pencil size={13}/> Düzenle</button><button className="icon-button group-delete" disabled={busy} aria-label={`${g.name} grubunu sil`} title="Grubu sil" onClick={()=>void deleteGroup(g)}><Trash2 size={15}/></button></div></article>)}{groups.length===0&&<div className="group-empty"><div className="group-mark"><Users size={16}/></div><b>Henüz grup tanımı yok</b><span>Yeni grup ekleyerek başlayın.</span></div>}</div><form className="group-form" onSubmit={createGroup}><div className="group-form-heading"><b>{editingGroup?'Grubu düzenle':'Yeni grup'}</b>{editingGroup&&<button type="button" className="text-button" onClick={()=>{setEditingGroup(null);setGroupCode('');setGroupName('');setGroupError('')}}>Düzenlemeyi iptal et</button>}</div><div className="form-two"><label>Grup kodu<input value={groupCode} onChange={e=>setGroupCode(e.target.value)} maxLength={40} required placeholder="Örn. B2B"/></label><label>Grup adı<input value={groupName} onChange={e=>setGroupName(e.target.value)} maxLength={120} required placeholder="Örn. Kurumsal müşteriler"/></label></div><div className="modal-foot"><span>Yalnızca bu firmada kullanılır.</span><div><button type="button" className="secondary" onClick={()=>setGroupModal(false)}>Kapat</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':editingGroup?'Değişiklikleri kaydet':'Grup ekle'}</button></div></div></form></div></div>}
    {addressCustomer&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAddressCustomer(null)}}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{addressCustomer.code}</p><h2>{addressCustomer.name} · Adresler</h2></div><button className="icon-button" onClick={()=>setAddressCustomer(null)}><X size={19}/></button></div><div className="address-list">{addresses.map(a=><div className={`address-row ${a.isActive?'':'inactive'}`} key={a.id}><div><b>{a.label}{a.isDefault?' · Varsayılan':''}</b><small>{a.addressLine}, {a.district?`${a.district}, `:''}{a.city} · {a.countryCode}</small></div><div><span>{a.kind==='Billing'?'Fatura':a.kind==='Delivery'?'Teslimat':'Genel'}</span><button className="row-action" disabled={busy} onClick={()=>void toggleAddressActive(a)}>{a.isActive?'Pasife al':'Etkinleştir'}</button></div></div>)}{addresses.length===0&&<p className="muted">Bu cari için henüz adres yok.</p>}</div><form onSubmit={createAddress}><div className="form-two"><label>Adres türü<select value={addressKind} onChange={e=>setAddressKind(e.target.value as CustomerAddressItem['kind'])}><option value="General">Genel</option><option value="Billing">Fatura</option><option value="Delivery">Teslimat</option></select></label><label>Adres etiketi<input value={addressLabel} onChange={e=>setAddressLabel(e.target.value)} required maxLength={80} placeholder="Merkez ofis"/></label></div><label>Adres<input value={addressLine} onChange={e=>setAddressLine(e.target.value)} required maxLength={400}/></label><div className="form-two"><CustomerLocationInput id="customer-address-province" label="İl" value={addressCity} options={addressCountry==='TR'?locationDefinitions.provinces:[]} required optional={false} onChange={value=>{setAddressCity(value);setAddressDistrict('')}}/><CustomerLocationInput id="customer-address-district" label="İlçe" value={addressDistrict} options={addressCountry==='TR'?turkeyDistrictsForProvince(addressCity,locationDefinitions.provinces,locationDefinitions.districts):[]} onChange={setAddressDistrict}/></div><CustomerLocationMap latitude={addressLatitude} longitude={addressLongitude} onChange={(latitude,longitude)=>{setAddressLatitude(latitude);setAddressLongitude(longitude)}}/><div className="form-two"><label>Posta kodu<input value={addressPostalCode} onChange={e=>setAddressPostalCode(e.target.value)} maxLength={20}/></label><CustomerCountryInput value={addressCountry} onChange={value=>{setAddressCountry(value);setAddressCity('');setAddressDistrict('')}}/></div><div className="modal-foot"><span>Varsayılan adres ilk kayıtta atanır.</span><div><button type="button" className="secondary" onClick={()=>setAddressCustomer(null)}>Kapat</button><button className="primary" disabled={busy}>Adres ekle</button></div></div></form></div></div>}
    {salesInvoicesCustomer&&<CustomerSalesInvoicesPanel token={token} customer={salesInvoicesCustomer} onClose={()=>setSalesInvoicesCustomer(null)} onOpenInvoice={invoiceId=>{setSalesInvoicesCustomer(null);onOpenSalesInvoice(invoiceId)}}/>}{ledgerCustomer&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLedgerCustomer(null)}}><div className="modal ledger-modal"><div className="modal-head"><div><p className="eyebrow">{ledgerCustomer.code} · CARİ MUTABAKAT</p><h2>{ledgerCustomer.name}</h2></div><button className="icon-button" onClick={()=>setLedgerCustomer(null)}><X size={19}/></button></div><div className="balance-banner"><div><small>Güncel bakiye</small><b>{ledgerBalance?`${Math.abs(ledgerBalance.balance).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${ledgerBalance.currencyCode}`:'Hesaplanıyor…'}</b><span>{ledgerBalance?.balanceSide==='Debit'?'Borç bakiyesi':ledgerBalance?.balanceSide==='Credit'?'Alacak bakiyesi':'Denk bakiye'}{ledgerBalance?.riskLimit!=null?` · Risk limiti ${ledgerBalance.riskLimit.toLocaleString('tr-TR')}`:''}</span></div><span className="ledger-currency">{ledgerCustomer.currencyCode}</span></div><div className="panel"><div className="form-two"><label>Dönem başlangıcı<input type="date" value={statementFrom} max={statementTo} onChange={e=>setStatementFrom(e.target.value)} required/></label><label>Dönem bitişi<input type="date" value={statementTo} min={statementFrom} onChange={e=>setStatementTo(e.target.value)} required/></label></div><div className="modal-foot"><span>{statement?`Dönem açılış ${statement.openingBalance.toLocaleString('tr-TR',{minimumFractionDigits:2})} · Borç ${statement.debitTotal.toLocaleString('tr-TR',{minimumFractionDigits:2})} · Alacak ${statement.creditTotal.toLocaleString('tr-TR',{minimumFractionDigits:2})} · Kapanış ${statement.closingBalance.toLocaleString('tr-TR',{minimumFractionDigits:2})} ${statement.currencyCode}`:'Ekstre yükleniyor…'}</span><div><button className="secondary" onClick={()=>void reloadStatement()}>Dönemi getir</button><button className="secondary" disabled={!statement} onClick={downloadCustomerStatement}>CSV dışa aktar</button></div></div></div><div className="panel"><div className="panel-heading"><div><h3>Karşı taraf ekstresiyle karşılaştır</h3><p>CSV dosyası tarayıcıda işlenir. Tarih, tutar ve yön karşılaştırılır; karşı taraf yönü varsayılan olarak ters çevrilir.</p></div></div><div className="form-two"><label>Ekstredeki yön<select value={externalPerspective} onChange={e=>setExternalPerspective(e.target.value as 'counterparty'|'same')}><option value="counterparty">Karşı taraf yönü (Borç/Alacak ters)</option><option value="same">ERP ile aynı yön</option></select></label><label>Ekstre CSV dosyası<input type="file" accept=".csv,text/csv" onChange={e=>void importCustomerStatement(e.target.files?.[0]||null)}/></label></div><div className="modal-foot"><span>{externalFileName?`${externalFileName} · ${externalRows.length} satır · ${reconciliation.matched} eşleşme · ${reconciliation.erpUnmatched} ERP farkı · ${reconciliation.externalUnmatched} karşı taraf farkı`:'CSV başlıkları date, direction, amount; Türkçe karşılıkları da desteklenir.'}</span>{externalRows.length>0&&<button className="secondary" onClick={()=>{setExternalRows([]);setExternalFileName('')}}>Karşılaştırmayı temizle</button>}</div>{externalRows.length>0&&<div className="address-list"><b>Karşılaştırma farkları</b>{visibleReconciliationRows.map(row=><div className="address-row" key={row.key}><span>{row.source==='erp'?'ERP kaydı':'Karşı taraf'} · {row.item.entryDate} · {row.item.direction==='Debit'?'Borç':'Alacak'} · {row.item.amount.toLocaleString('tr-TR',{minimumFractionDigits:2})} {row.source==='erp'?row.item.currencyCode:statement?.currencyCode} · {row.item.description||'Açıklama yok'}</span></div>)}{reconciliation.totalUnmatched===0&&<div className="address-row"><b>Tüm hareketler eşleşti.</b></div>}{reconciliationPageCount>1&&<div className="modal-foot reconciliation-pagination"><span>Fark {((reconciliationPage-1)*reconciliationPageSize+1).toLocaleString('tr-TR')}–{Math.min(reconciliationPage*reconciliationPageSize,reconciliation.totalUnmatched).toLocaleString('tr-TR')} / {reconciliation.totalUnmatched.toLocaleString('tr-TR')}</span><div><button type="button" className="secondary" disabled={reconciliationPage<=1} onClick={()=>setReconciliationPage(page=>Math.max(1,page-1))}>Önceki</button><button type="button" className="secondary" disabled={reconciliationPage>=reconciliationPageCount} onClick={()=>setReconciliationPage(page=>Math.min(reconciliationPageCount,page+1))}>Sonraki</button></div></div>}</div>}</div><div className="ledger-list"><table className="customer-table"><thead><tr><th>Tarih</th><th>Yön</th><th>Açıklama</th><th>Tutar</th><th>Dönem bakiyesi</th><th></th></tr></thead><tbody>{pagedStatementItems.map(item=><tr key={item.id}><td>{item.entryDate.split('-').reverse().join('.')}</td><td><span className={`party-pill ${item.direction==='Debit'?'':'supplier'}`}>{item.direction==='Debit'?'Borç':'Alacak'}</span></td><td>{item.description}{item.reversalOfId&&<small className="cell-subtitle">Ters kayıt</small>}{item.hasReversal&&<small className="cell-subtitle">İptal edildi · geçmiş kaydı korunuyor</small>}</td><td>{item.amount.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} {item.currencyCode}</td><td>{item.balance.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td>{!item.reversalOfId&&!item.hasReversal&&<button className="row-action" disabled={busy} onClick={()=>void reverseMovement(item)}>Ters kayıt</button>}</td></tr>)}{statement?.items.length===0&&<tr><td colSpan={6} className="table-empty">Seçilen dönemde cari hareket yok.</td></tr>}</tbody></table></div>{statementPageCount>1&&<div className="modal-foot statement-pagination"><span>Sayfa {statementPage} / {statementPageCount} · {statement?.items.length??0} hareket · Sayfa başına 50</span><div><button type="button" className="secondary" disabled={statementPage<=1} onClick={()=>setStatementPage(page=>Math.max(1,page-1))}>Önceki</button><button type="button" className="secondary" disabled={statementPage>=statementPageCount} onClick={()=>setStatementPage(page=>Math.min(statementPageCount,page+1))}>Sonraki</button></div></div>}<div className="modal-foot"><span>Toplam {statement?.items.length??0} hareket · Kaydedilen hareketler ters kayıtla iptal edilir.</span><div><button type="button" className="secondary" onClick={()=>setLedgerCustomer(null)}>Kapat</button><button type="button" className="primary" onClick={()=>{setError('');setCustomerMovementOpen(true)}}>Hareket ekle</button></div></div></div></div>}{customerMovementOpen&&ledgerCustomer&&<div className="modal-backdrop customer-movement-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setCustomerMovementOpen(false)}}><section className="modal customer-movement-modal" role="dialog" aria-modal="true" aria-labelledby="customer-movement-title"><div className="modal-head"><div><p className="eyebrow">{ledgerCustomer.code} · CARİ HAREKET</p><h2 id="customer-movement-title">Yeni hareket</h2><p className="muted">{ledgerCustomer.name} · {ledgerCustomer.currencyCode}</p></div><button type="button" className="icon-button" disabled={busy} aria-label="Hareket penceresini kapat" onClick={()=>setCustomerMovementOpen(false)}><X size={19}/></button></div>{error&&<div className="alert inline-alert" role="alert">{error}<button type="button" aria-label="Hatayı kapat" onClick={()=>setError('')}><X size={15}/></button></div>}<form onSubmit={createMovement}><div className="form-two"><label>Hareket yönü<select value={movementDirection} onChange={e=>setMovementDirection(e.target.value as CustomerLedgerItem['direction'])}><option value="Debit">Borç</option><option value="Credit">Alacak</option></select></label><label>Tarih<input type="date" value={movementDate} onChange={e=>setMovementDate(e.target.value)} required/></label></div><div className="form-two"><label>Tutar ({ledgerCustomer.currencyCode})<input type="number" min="0.01" step="0.01" value={movementAmount} onChange={e=>setMovementAmount(e.target.value)} required/></label><label>Açıklama<input value={movementDescription} onChange={e=>setMovementDescription(e.target.value)} maxLength={240} required placeholder="Örn. Açılış bakiyesi"/></label></div><div className="modal-foot"><span>Kaydedilen hareket silinemez; iptal ters kayıtla yapılır.</span><div><button type="button" className="secondary" disabled={busy} onClick={()=>setCustomerMovementOpen(false)}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Hareketi kaydet'}</button></div></div></form></section></div>}
    {customerDialog&&<div className="modal-backdrop customer-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)finishCustomerDialog(null)}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();finishCustomerDialog(null)}}}><section className="modal customer-dialog-modal" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title"><div className="modal-head"><div><p className="eyebrow">CARİ YÖNETİMİ</p><h2 id="customer-dialog-title">{customerDialog.title}</h2></div><button type="button" className="icon-button" aria-label="Pencereyi kapat" onClick={()=>finishCustomerDialog(null)}><X size={19}/></button></div><p className="customer-dialog-message">{customerDialog.message}</p>{customerDialog.kind==='prompt'&&(customerDialog.choices?<label className="customer-dialog-field">{customerDialog.valueLabel}<select autoFocus value={customerDialogValue} onChange={event=>setCustomerDialogValue(event.target.value)}>{customerDialog.choices.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>:<label className="customer-dialog-field">{customerDialog.valueLabel}<input autoFocus type={customerDialog.inputType} min={customerDialog.min} max={customerDialog.max} maxLength={customerDialog.maxLength} value={customerDialogValue} onChange={event=>setCustomerDialogValue(event.target.value)}/></label>)}<div className="modal-foot customer-dialog-footer"><button type="button" className="secondary" onClick={()=>finishCustomerDialog(null)}>Vazgeç</button><button type="button" className={customerDialog.kind==='confirm'&&customerDialog.danger?'secondary danger-action':'primary'} onClick={()=>finishCustomerDialog(customerDialog.kind==='confirm'?true:customerDialogValue)}>{customerDialog.kind==='confirm'?customerDialog.confirmLabel:'Kaydet'}</button></div></section></div>}
    {importOpen&&<MasterDataImportDialog kind="customers" token={token} onClose={()=>setImportOpen(false)} onImported={load}/>}
  </>
}

export { CustomersPage }
