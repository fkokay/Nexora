import { MapPin, Pencil, X } from 'lucide-react'
import type { BuiltInScreenLayoutField, CustomerAddressItem, CustomerItem } from '../../erp-types'

export type CustomerDetailTab = 'general' | 'contact' | 'finance' | 'other'

type Props = {
  customer: CustomerItem | null
  isSmallScreen: boolean
  tab: CustomerDetailTab
  fields: BuiltInScreenLayoutField[]
  address: CustomerAddressItem | null
  addressLoaded: boolean
  onTabChange: (tab: CustomerDetailTab) => void
  onClose: () => void
  onEdit: () => void
  onInvoices: () => void
  onLedger: () => void
  onAddresses: () => void
  onFields: () => void
  onBackdropClose: () => void
}

export function CustomerDetailPanel({ customer, isSmallScreen, tab, fields, address, addressLoaded, onTabChange, onClose, onEdit, onInvoices, onLedger, onAddresses, onFields, onBackdropClose }: Props) {
  if (!customer) return null
  const visibleFields = fields.filter(field => tab === 'general' ? ['groupName', 'taxNumber', 'identityNumber'].includes(field.key) : tab === 'finance' ? ['currencyCode', 'paymentTermDays', 'riskLimit'].includes(field.key) : tab === 'other' ? ['taxOffice'].includes(field.key) : false)
  const valueFor = (key: string) => key === 'groupName' ? customer.groupName || 'Atanmamış' : key === 'taxNumber' ? customer.taxNumber || '—' : key === 'identityNumber' ? customer.identityNumber || '—' : key === 'taxOffice' ? customer.taxOffice || '—' : key === 'currencyCode' ? customer.currencyCode : key === 'paymentTermDays' ? `${customer.paymentTermDays} gün` : key === 'riskLimit' ? customer.riskLimit == null ? 'Belirtilmedi' : `${customer.riskLimit.toLocaleString('tr-TR')} ${customer.currencyCode}` : '—'
  return <aside className={`customer-detail-backdrop${isSmallScreen ? ' is-popup' : ''}`} onMouseDown={event => { if (isSmallScreen && event.target === event.currentTarget) onBackdropClose() }}>
    <section className="customer-detail-modal" role={isSmallScreen ? 'dialog' : undefined} aria-modal={isSmallScreen ? 'true' : undefined} aria-labelledby="customer-detail-title">
      <div className="erp-record-heading"><div><span className="erp-record-kind">{customer.type === 'Customer' ? 'MÜŞTERİ' : customer.type === 'Supplier' ? 'TEDARİKÇİ' : 'MÜŞTERİ & TEDARİKÇİ'}</span><h2 id="customer-detail-title">{customer.name}</h2><small><span>{customer.code}</span><span className={`customer-status-pill${customer.isActive ? ' is-active' : ' is-inactive'}`}>{customer.isActive ? 'Aktif' : 'Pasif'}</span></small></div><div className="customer-detail-header-actions"><button className="secondary small-button" onClick={onEdit}><Pencil size={14}/> Düzenle</button><button type="button" className="icon-button" aria-label="Cari detayını kapat" onClick={onClose}><X size={19}/></button></div></div>
      <nav className="customer-detail-tabs" aria-label="Cari detay sekmeleri">{[{ label: 'Genel Bilgiler', value: 'general' }, { label: 'İletişim', value: 'contact' }, { label: 'Finans', value: 'finance' }, { label: 'Diğer', value: 'other' }].map(item => <button type="button" key={item.value} className={tab === item.value ? 'active' : ''} onClick={() => onTabChange(item.value as CustomerDetailTab)}>{item.label}</button>)}</nav>
      <dl className="erp-record-facts customer-detail-facts">{visibleFields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{valueFor(field.key)}</dd></div>)}</dl>
      {tab === 'contact' && <section className="customer-default-address"><div className="customer-default-address-icon"><MapPin size={16}/></div><div><span>Varsayılan adres</span>{!addressLoaded ? <strong>Yükleniyor…</strong> : address ? <><strong>{address.label}</strong><small>{address.addressLine}{address.district ? `, ${address.district}` : ''}, {address.city}{address.postalCode ? ` · ${address.postalCode}` : ''} · {address.countryCode}</small>{address.latitude !== null && address.longitude !== null && <small>Harita konumu: {address.latitude.toFixed(6)}, {address.longitude.toFixed(6)}</small>}</> : <small>Varsayılan adres tanımlanmamış.</small>}<button className="secondary small-button" onClick={onAddresses}>Adresleri yönet</button></div></section>}
      {tab === 'other' && <section className="customer-company-hierarchy"><div><span>Şirket hiyerarşisi</span>{customer.parentCompanyName ? <strong>Ana firma: {customer.parentCompanyName}</strong> : <strong>Bağımsız firma</strong>}</div>{(customer.subsidiaryCount || 0) > 0 && <small>{customer.subsidiaryCount} alt firma bağlı</small>}</section>}
      <div className="erp-record-actions">{customer.type !== 'Supplier' && <button className="secondary small-button" onClick={onInvoices}>Satış faturaları</button>}<button className="secondary small-button" onClick={onLedger}>Hareketler</button><button className="secondary small-button" onClick={onAddresses}>Adresler</button><button className="secondary small-button" onClick={onFields}>Özel alanlar</button></div>
    </section>
  </aside>
}
