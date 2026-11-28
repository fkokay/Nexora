import type { GlobalSearchResult, Locale } from './WorkspaceComponents'
import type { InventoryPageKey, SalesPageKey, ManufacturingPageKey } from './erp-types'

export const shellText: Record<Locale, Record<string, string>> = {
  tr: { workspace:'ÇALIŞMA ALANI', overview:'Genel Bakış', customers:'Cari Hesaplar', crm:'CRM Fırsatları', manufacturing:'Üretim', inventory:'Stok & Depo', sales:'Satış', purchasing:'Satın Alma', finance:'Finans', management:'YÖNETİM', audit:'İşlem kayıtları', access:'İzin politikaları', integrations:'Entegrasyon kuyruğu', development:'GELİŞTİRME MERKEZİ', requests:'Geliştirme talepleri', assistant:'AI ERP Asistanı', platformTools:'PLATFORM UYARLAMA', settings:'Ayarlar', help:'Yardım merkezi', tenantWorkspace:'Kurumsal çalışma alanı', search:'Hızlı ara', platform:'Platform', signOut:'Oturumu kapat', language:'Dil / Language', recipes:'Ürün reçeteleri', workCenters:'İş merkezleri', orders:'Üretim emirleri', mrp:'Malzeme planlama', studio:'AI Development Studio', modules:'Modül pazaryeri', forms:'Özel formlar', workflows:'İş akışları', rules:'İş kuralları', reports:'Rapor oluşturucu', lists:'Dinamik listeler', menus:'Özel menüler' },
  en: { workspace:'WORKSPACE', overview:'Overview', customers:'Customer management', crm:'CRM opportunities', manufacturing:'Manufacturing', inventory:'Inventory & Warehousing', sales:'Sales', purchasing:'Purchasing', finance:'Finance', management:'ADMINISTRATION', audit:'Audit log', access:'Access policies', integrations:'Integration queue', development:'DEVELOPMENT CENTER', requests:'Development requests', assistant:'AI ERP Assistant', platformTools:'PLATFORM CUSTOMIZATION', settings:'Settings', help:'Help center', tenantWorkspace:'Business workspace', search:'Search', platform:'Platform', signOut:'Sign out', language:'Language / Dil', recipes:'Product recipes', workCenters:'Work centers', orders:'Production orders', mrp:'Material planning', studio:'AI Development Studio', modules:'Module marketplace', forms:'Custom forms', workflows:'Workflows', rules:'Business rules', reports:'Report builder', lists:'Dynamic lists', menus:'Custom menus' }
}

export const inventoryPageTitles: Record<InventoryPageKey, string> = {
  'inventory-stock':'Stok Kartları', 'inventory-stock-create':'Yeni stok kartı', 'inventory-stock-movements':'Stok Hareketleri', 'inventory-cost':'Stok Değerleme', 'inventory-warehouses':'Depo Yönetimi', 'inventory-transfers':'Depolar arası transferler', 'inventory-transfer-document':'Depo transferi belgesi', 'inventory-locations':'Raf ve Konumlar', 'inventory-tracking':'Lot / Seri İzleme'
}
const inventoryPageTitlesEn: Record<InventoryPageKey, string> = {
  'inventory-stock':'Stock items', 'inventory-stock-create':'Create stock item', 'inventory-stock-movements':'Stock movements', 'inventory-cost':'Stock valuation', 'inventory-warehouses':'Warehouses', 'inventory-transfers':'Inter-warehouse transfers', 'inventory-transfer-document':'Warehouse transfer document', 'inventory-locations':'Locations', 'inventory-tracking':'Lot / serial tracking'
}

export const manufacturingPageTitles: Record<ManufacturingPageKey, string> = {
  'manufacturing-recipes':'Tanımlı reçeteler', 'manufacturing-recipe-create':'Reçete oluştur', 'manufacturing-work-centers':'İş merkezleri', 'manufacturing-work-center-create':'İş merkezi tanımla', 'manufacturing-orders':'Üretim emirleri', 'manufacturing-order-create':'Yeni üretim emri', 'manufacturing-mrp':'Malzeme planlama', 'manufacturing-cost-variance':'Maliyet analizi'
}
const manufacturingPageTitlesEn: Record<ManufacturingPageKey, string> = {
  'manufacturing-recipes':'Defined recipes', 'manufacturing-recipe-create':'Create recipe', 'manufacturing-work-centers':'Work centers', 'manufacturing-work-center-create':'Define work center', 'manufacturing-orders':'Production orders', 'manufacturing-order-create':'New production order', 'manufacturing-mrp':'Material planning', 'manufacturing-cost-variance':'Cost analysis'
}

const salesPageTitles: Record<SalesPageKey, string> = {
  'sales-customer-requests':'Satış Talepleri', 'sales-requests':'Satınalma Talepleri', 'sales-purchase-quotes':'Satınalma Teklifleri', 'sales-quotes':'Satış Teklifleri', 'sales-quote-create':'Yeni Teklif', 'sales-orders':'Satış Siparişleri', 'sales-order-create':'Yeni Sipariş', 'sales-order-document':'Sipariş Belgesi', 'sales-quote-document':'Teklif Belgesi', 'sales-invoice-document':'Fatura Belgesi', 'sales-delivery-document':'İrsaliye Belgesi', 'sales-invoices':'Satış Faturaları', 'sales-invoice-create':'Yeni satış faturası', 'sales-deliveries':'Satış İrsaliyeleri', 'sales-delivery-create':'Yeni İrsaliye', 'sales-promotions':'Kampanyalar', 'sales-distribution':'Dağıtım planı', 'sales-purchasing':'Satınalma Siparişleri', 'sales-purchase-order-create':'Yeni satınalma siparişi', 'sales-purchase-invoices':'Satınalma Faturaları', 'sales-purchase-receipts':'Mal kabulleri', 'sales-returns':'Satış İadeleri', 'sales-purchase-returns':'Satınalma İadeleri', 'sales-purchase-delivery-notes':'Satınalma İrsaliyeleri', 'sales-purchase-invoice-entry':'Mal kabul faturası girişi', 'sales-purchase-invoice-drafts':'Satınalma faturası taslakları', 'commercial-contracts':'Ticari sözleşmeler'
}
const salesPageTitlesEn: Record<SalesPageKey, string> = {
  'sales-customer-requests':'Sales requests', 'sales-requests':'Purchase requests', 'sales-purchase-quotes':'Purchase supplier quotes', 'sales-quotes':'Sales quotes', 'sales-quote-create':'New quote', 'sales-orders':'Sales orders', 'sales-order-create':'New sales order', 'sales-order-document':'Sales order document', 'sales-quote-document':'Sales quote document', 'sales-invoice-document':'Sales invoice document', 'sales-delivery-document':'Sales delivery document', 'sales-invoices':'Sales invoices', 'sales-invoice-create':'New sales invoice', 'sales-deliveries':'Sales deliveries', 'sales-delivery-create':'New delivery', 'sales-promotions':'Sales promotions', 'sales-distribution':'Distribution plan', 'sales-purchasing':'Purchase orders', 'sales-purchase-order-create':'New purchase order', 'sales-purchase-invoices':'Purchase invoices', 'sales-purchase-receipts':'Goods receipts', 'sales-returns':'Sales returns', 'sales-purchase-returns':'Purchase returns', 'sales-purchase-delivery-notes':'Supplier delivery notes', 'sales-purchase-invoice-entry':'Purchase invoice entry', 'sales-purchase-invoice-drafts':'Independent invoice drafts', 'commercial-contracts':'Commercial contracts'
}

export const salesNavigationPages: SalesPageKey[] = ['sales-customer-requests','sales-quotes','sales-orders','sales-deliveries','sales-invoices','sales-returns','sales-distribution','sales-promotions']
export const purchasingNavigationPages: SalesPageKey[] = ['sales-requests','sales-purchase-quotes','sales-purchasing','sales-purchase-delivery-notes','sales-purchase-receipts','sales-purchase-invoices','sales-purchase-returns','sales-purchase-invoice-entry','sales-purchase-invoice-drafts','commercial-contracts']

/**
 * Arama sonuçlarında (menüde) yer almayan, profil menüsü, ayarlar veya geliştirici
 * modu panelinden açılan ekranların sekme başlıkları. Burada olmayan bir ekran,
 * sekme başlığı olarak ham sayfa anahtarını gösterir.
 */
const standalonePageTitles: Record<string, Record<Locale, string>> = {
  modules: { tr: 'Modül pazaryeri', en: 'Module marketplace' },
  'location-definitions': { tr: 'İş yeri, şube ve fabrika', en: 'Workplaces, branches and plants' },
  'address-definitions': { tr: 'Adres tanımları', en: 'Address definitions' },
  'customer-groups': { tr: 'Cari Grupları', en: 'Customer groups' },
  'screen-views': { tr: 'Ekran Düzenleri', en: 'Screen layouts' },
  'custom-lists': { tr: 'Dinamik Listeler', en: 'Dynamic lists' },
  'custom-menus': { tr: 'Özel Menüler', en: 'Custom menus' },
  'custom-forms': { tr: 'Özel Formlar', en: 'Custom forms' },
  'business-rules': { tr: 'İş Kuralları', en: 'Business rules' },
  workflows: { tr: 'İş Akışları', en: 'Workflows' },
  reports: { tr: 'Rapor oluşturucu', en: 'Report builder' },
  'company-settings': { tr: 'Firma Ayarları', en: 'Company settings' },
  'license-settings': { tr: 'Firma Lisansı', en: 'Company license' },
  settings: { tr: 'Ayarlar', en: 'Settings' },
  'ai-settings': { tr: 'AI sağlayıcı ayarları', en: 'AI provider settings' },
  audit: { tr: 'İşlem kayıtları', en: 'Audit log' },
  access: { tr: 'İzin politikaları', en: 'Permission policies' },
  integrations: { tr: 'Entegrasyonlar', en: 'Integrations' },
  projects: { tr: 'Projeler', en: 'Projects' },
  'foreign-trade': { tr: 'Dış Ticaret', en: 'Foreign trade' },
  'human-resources': { tr: 'Bordro ve ücret', en: 'Payroll and pay' },
  'hr-employees': { tr: 'Personel', en: 'Employees' },
  'hr-employee-create': { tr: 'Personel kartı', en: 'Employee card' },
  'hr-leave-requests': { tr: 'İzin talepleri', en: 'Leave requests' },
  'hr-attendance': { tr: 'Puantaj', en: 'Attendance' },
  'hr-period-summary': { tr: 'Dönem özeti', en: 'Period summary' },
  'foreign-trade-case': { tr: 'Dış ticaret dosyası', en: 'Foreign trade case' },
  'fixed-assets': { tr: 'Duran Varlıklar', en: 'Fixed assets' },
  'fixed-asset-card': { tr: 'Kıymet kartı', en: 'Fixed asset card' },
}

export function standalonePageTitle(page: string, locale: Locale): string | undefined {
  return standalonePageTitles[page]?.[locale]
}

export function salesPageTitle(page: SalesPageKey, locale: Locale) {
  return locale === 'en' ? salesPageTitlesEn[page] : salesPageTitles[page]
}

export function inventoryPageTitle(page: InventoryPageKey, locale: Locale) {
  return locale === 'en' ? inventoryPageTitlesEn[page] : inventoryPageTitles[page]
}

export function manufacturingPageTitle(page: ManufacturingPageKey, locale: Locale) {
  return locale === 'en' ? manufacturingPageTitlesEn[page] : manufacturingPageTitles[page]
}

/** Sekme listesinde olmayan (ör. URL'den açılan önizleme) bilinen bir sayfanın adı; bilinmiyorsa undefined. */
export function knownPageTitle(page: string, locale: Locale): string | undefined {
  const pick = (tr: Record<string, string>, en: Record<string, string>) => (locale === 'en' ? en : tr)[page]
  return standalonePageTitle(page, locale)
    ?? pick(inventoryPageTitles, inventoryPageTitlesEn)
    ?? pick(salesPageTitles, salesPageTitlesEn)
    ?? pick(manufacturingPageTitles, manufacturingPageTitlesEn)
}

/**
 * Sayfa yolunun ve sekmenin adı: sekme başlığı (ham anahtar yedeği değilse), sonra arama dizinindeki ekran adı (ör. 'Cari Hesaplar',
 * 'Mizan'), sonra bilinen başlık; hiçbiri yoksa ham anahtar. URL ile açılan sistem sayfası önizlemesinin sekmesi olmayabilir.
 */
export function workspacePageLabel(page: string, locale: Locale, tabs: readonly { id: string; label: string }[], searchPages: readonly GlobalSearchResult[]): string {
  const raw = page.replace(/[-_]/g, ' ');
  const tabLabel = tabs.find((tab) => tab.id === page)?.label;
  if (tabLabel && tabLabel !== raw) return tabLabel;
  return searchPages.find((result) => result.page === page && result.kind !== 'customer')?.label || knownPageTitle(page, locale) || tabLabel || raw;
}
