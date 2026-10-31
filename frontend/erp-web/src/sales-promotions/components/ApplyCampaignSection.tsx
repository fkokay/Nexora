import type { FormEvent } from 'react'
import type { Campaign, Quote } from './types'

type Props = {
  campaigns: Campaign[]
  quotes: Quote[]
  campaignId: string
  quoteId: string
  busy: boolean
  onCampaignChange: (id: string) => void
  onQuoteChange: (id: string) => void
  onSubmit: (event: FormEvent) => void
}

export default function ApplyCampaignSection({ campaigns, quotes, campaignId, quoteId, busy, onCampaignChange, onQuoteChange, onSubmit }: Props) {
  return <section className="panel sales-campaign-apply"><div className="panel-heading"><div><b>Teklife kampanya uygula</b><small>Yalnızca geçerlilik tarihindeki taslak tekliflerde kullanılabilir.</small></div></div><form onSubmit={onSubmit} className="form-two">
    <label>Kampanya<select value={campaignId} onChange={event => onCampaignChange(event.target.value)} required><option value="">Kampanya seçin</option>{campaigns.filter(campaign => campaign.isActive).map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.code} · {campaign.name} (%{campaign.discountPercent})</option>)}</select></label>
    <label>Taslak teklif<select value={quoteId} onChange={event => onQuoteChange(event.target.value)} required><option value="">Teklif seçin</option>{quotes.map(quote => <option key={quote.id} value={quote.id}>{quote.code} · {quote.customerName} · {quote.quoteDate} · {quote.grandTotal.toLocaleString('tr-TR')}</option>)}</select></label>
    <div className="modal-foot"><span>Kampanya aynı teklife bir kez uygulanabilir.</span><button className="primary" disabled={busy || !campaignId || !quoteId}>{busy ? 'Uygulanıyor…' : 'Teklife uygula'}</button></div>
  </form></section>
}
