import type { Locale } from './WorkspaceComponents'
import type { InventoryPageKey, SalesPageKey, ManufacturingPageKey } from './erp-types'

export const shellText: Record<Locale, Record<string, string>> = {
  tr: { workspace:'ÇALIŞMA ALANI', overview:'Genel Bakış', customers:'Cari Yönetimi', crm:'CRM Fırsatları', manufacturing:'Üretim', inventory:'Stok & Depo', sales:'Satış', purchasing:'Satın Alma', finance:'Finans', management:'YÖNETİM', audit:'İşlem kayıtları', access:'İzin politikaları', integrations:'Entegrasyon kuyruğu', development:'GELİŞTİRME MERKEZİ', requests:'Geliştirme talepleri', assistant:'AI ERP Asistanı', platformTools:'PLATFORM UYARLAMA', settings:'Ayarlar', help:'Yardım merkezi', tenantWorkspace:'Kurumsal çalışma alanı', search:'Hızlı ara', platform:'Platform', signOut:'Oturumu kapat', language:'Dil / Language', recipes:'Ürün reçeteleri', workCenters:'İş merkezleri', orders:'Üretim emirleri', mrp:'Malzeme planlama', studio:'AI Development Studio', modules:'Modül pazaryeri', forms:'Özel formlar', workflows:'İş akışları', rules:'İş kuralları', reports:'Rapor oluşturucu', lists:'Dinamik listeler', menus:'Özel menüler' },
  en: { workspace:'WORKSPACE', overview:'Overview', customers:'Customer management', crm:'CRM opportunities', manufacturing:'Manufacturing', inventory:'Inventory & Warehousing', sales:'Sales', purchasing:'Purchasing', finance:'Finance', management:'ADMINISTRATION', audit:'Audit log', access:'Access policies', integrations:'Integration queue', development:'DEVELOPMENT CENTER', requests:'Development requests', assistant:'AI ERP Assistant', platformTools:'PLATFORM CUSTOMIZATION', settings:'Settings', help:'Help center', tenantWorkspace:'Business workspace', search:'Search', platform:'Platform', signOut:'Sign out', language:'Language / Dil', recipes:'Product recipes', workCenters:'Work centers', orders:'Production orders', mrp:'Material planning', studio:'AI Development Studio', modules:'Module marketplace', forms:'Custom forms', workflows:'Workflows', rules:'Business rules', reports:'Report builder', lists:'Dynamic lists', menus:'Custom menus' }
}

export const inventoryPageTitles: Record<InventoryPageKey, string> = {
  'inventory-stock':'Stok Kartları', 'inventory-valuation':'Stok Değerleme', 'inventory-warehouses':'Depo Yönetimi', 'inventory-transfers':'Depolar arası transferler', 'inventory-locations':'Raf ve Konumlar', 'inventory-tracking':'Lot / Seri İzleme'
}
const inventoryPageTitlesEn: Record<InventoryPageKey, string> = {
  'inventory-stock':'Stock items', 'inventory-valuation':'Inventory valuation', 'inventory-warehouses':'Warehouses', 'inventory-transfers':'Inter-warehouse transfers', 'inventory-locations':'Locations', 'inventory-tracking':'Lot / serial tracking'
}

export const manufacturingPageTitles: Record<ManufacturingPageKey, string> = {
  'manufacturing-recipes':'Tanımlı reçeteler', 'manufacturing-recipe-create':'Reçete oluştur', 'manufacturing-work-centers':'İş merkezleri', 'manufacturing-orders':'Üretim emirleri', 'manufacturing-mrp':'Malzeme planlama', 'manufacturing-cost-variance':'Maliyet analizi'
}
const manufacturingPageTitlesEn: Record<ManufacturingPageKey, string> = {
  'manufacturing-recipes':'Defined recipes', 'manufacturing-recipe-create':'Create recipe', 'manufacturing-work-centers':'Work centers', 'manufacturing-orders':'Production orders', 'manufacturing-mrp':'Material planning', 'manufacturing-cost-variance':'Cost analysis'
}

const salesPageTitles: Record<SalesPageKey, string> = {
  'sales-requests':'Satınalma Talepleri', 'sales-purchase-quotes':'Satınalma Teklifleri', 'sales-quotes':'Teklifler', 'sales-orders':'Satış Siparişleri', 'sales-invoices':'Satış Faturaları', 'sales-deliveries':'İrsaliyeler', 'sales-promotions':'Kampanyalar', 'sales-distribution':'Dağıtım planı', 'sales-purchasing':'Tedarikçi Siparişleri', 'sales-purchase-invoices':'Satın Alma Faturaları', 'sales-purchase-receipts':'Mal kabulleri', 'sales-purchase-delivery-notes':'İrsaliyeler', 'sales-purchase-invoice-entry':'Mal kabul faturası girişi', 'sales-purchase-invoice-drafts':'Bağımsız fatura taslakları', 'commercial-contracts':'Ticari sözleşmeler'
}
const salesPageTitlesEn: Record<SalesPageKey, string> = {
  'sales-requests':'Purchase requests', 'sales-purchase-quotes':'Purchase supplier quotes', 'sales-quotes':'Sales quotes', 'sales-orders':'Sales orders', 'sales-invoices':'Sales invoices', 'sales-deliveries':'Sales deliveries', 'sales-promotions':'Sales promotions', 'sales-distribution':'Distribution plan', 'sales-purchasing':'Supplier orders', 'sales-purchase-invoices':'Purchase invoices', 'sales-purchase-receipts':'Goods receipts', 'sales-purchase-delivery-notes':'Supplier delivery notes', 'sales-purchase-invoice-entry':'Purchase invoice entry', 'sales-purchase-invoice-drafts':'Independent invoice drafts', 'commercial-contracts':'Commercial contracts'
}

export const salesNavigationPages: SalesPageKey[] = ['sales-quotes','sales-orders','sales-deliveries','sales-invoices','sales-distribution','sales-promotions']
export const purchasingNavigationPages: SalesPageKey[] = ['sales-requests','sales-purchase-quotes','sales-purchasing','sales-purchase-delivery-notes','sales-purchase-receipts','sales-purchase-invoices','sales-purchase-invoice-entry','sales-purchase-invoice-drafts','commercial-contracts']

export function salesPageTitle(page: SalesPageKey, locale: Locale) {
  return locale === 'en' ? salesPageTitlesEn[page] : salesPageTitles[page]
}

export function inventoryPageTitle(page: InventoryPageKey, locale: Locale) {
  return locale === 'en' ? inventoryPageTitlesEn[page] : inventoryPageTitles[page]
}

export function manufacturingPageTitle(page: ManufacturingPageKey, locale: Locale) {
  return locale === 'en' ? manufacturingPageTitlesEn[page] : manufacturingPageTitles[page]
}
