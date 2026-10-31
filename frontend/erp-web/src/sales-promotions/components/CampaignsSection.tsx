import AdvancedDataGrid from '../../AdvancedDataGrid'
import type { Campaign, CampaignScreenField } from './types'

type Props = {
  campaigns: Campaign[]
  visibleCampaigns: Campaign[]
  selectedCampaign: Campaign | null
  selectedCampaignId: string
  fields: CampaignScreenField[]
  query: string
  role: string
  busy: boolean
  onQueryChange: (query: string) => void
  onRefresh: () => void
  onSelect: (campaignId: string) => void
  onEdit: (campaign: Campaign) => void
  onToggleStatus: (campaign: Campaign) => void
}

export default function CampaignsSection({
  campaigns,
  visibleCampaigns,
  selectedCampaign,
  selectedCampaignId,
  fields,
  query,
  role,
  busy,
  onQueryChange,
  onRefresh,
  onSelect,
  onEdit,
  onToggleStatus,
}: Props) {
  const visibleFields = fields.filter(field => field.visible)
  const campaignCell = (campaign: Campaign, key: string) => {
    switch (key) {
      case 'code': return <b>{campaign.code}</b>
      case 'name': return campaign.name
      case 'discountPercent': return `%${campaign.discountPercent}`
      case 'effectiveFrom': return campaign.effectiveFrom
      case 'effectiveThrough': return campaign.effectiveThrough
      case 'status': return campaign.isActive ? 'Aktif' : 'Pasif'
      case 'applicationCount': return campaign.applicationCount
      default: return null
    }
  }

  return <section className="panel sales-campaign-workbench">
    <div className="panel-heading"><div><b>Kampanya listesi</b><small>{campaigns.length} kayıt · teklif indirimi kampanya koşullarına göre hesaplanır</small></div><button className="secondary" onClick={onRefresh}>Yenile</button></div>
    <label className="sales-campaign-search">Kampanya ara<input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Kod veya kampanya adı" /></label>
    <div className="sales-campaign-layout">
      <div className="table-scroll"><AdvancedDataGrid hideSearch enableRowSelection={false} gridId="sales-campaigns-v2" initialColumnWidths={visibleFields.map(field => ({ code: 100, name: 140, discountPercent: 80, effectiveFrom: 100, effectiveThrough: 100, status: 85, applicationCount: 125 }[field.key] ?? 90))} minimumColumnWidths={visibleFields.map(field => ({ code: 80, name: 110, discountPercent: 65, effectiveFrom: 80, effectiveThrough: 80, status: 70, applicationCount: 100 }[field.key] ?? 70))}>
        <thead><tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
        <tbody>{visibleCampaigns.map(campaign => <tr key={campaign.id} aria-selected={campaign.id === selectedCampaignId} onClick={() => onSelect(campaign.id)}>{visibleFields.map(field => <td key={field.key}>{campaignCell(campaign, field.key)}</td>)}</tr>)}{visibleCampaigns.length === 0 && <tr><td colSpan={Math.max(1, visibleFields.length)}>{query ? 'Aramayla eşleşen kampanya yok.' : 'Henüz kampanya tanımlanmadı.'}</td></tr>}</tbody>
      </AdvancedDataGrid></div>
      {selectedCampaign && <aside className="sales-campaign-detail">
        <div className="sales-campaign-detail-heading"><div><small>SEÇİLİ KAMPANYA</small><h2>{selectedCampaign.name}</h2><p>{selectedCampaign.code}</p></div>{role === 'TenantAdmin' && <div className="sales-campaign-actions"><button type="button" className="secondary" disabled={busy} onClick={() => onEdit(selectedCampaign)}>Düzenle</button><button type="button" className={selectedCampaign.isActive ? 'secondary' : 'primary'} disabled={busy} onClick={() => onToggleStatus(selectedCampaign)}>{busy ? 'Kaydediliyor…' : selectedCampaign.isActive ? 'Pasifleştir' : 'Etkinleştir'}</button></div>}</div>
        <dl><div><dt>İndirim</dt><dd>%{selectedCampaign.discountPercent}</dd></div><div><dt>Geçerlilik</dt><dd>{selectedCampaign.effectiveFrom} – {selectedCampaign.effectiveThrough}</dd></div><div><dt>Durum</dt><dd>{selectedCampaign.isActive ? 'Aktif' : 'Pasif'}</dd></div><div><dt>Uygulama sayısı</dt><dd>{selectedCampaign.applicationCount}</dd></div></dl>
      </aside>}
    </div>
  </section>
}
