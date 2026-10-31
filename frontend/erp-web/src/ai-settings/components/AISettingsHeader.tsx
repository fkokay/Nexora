import { ShieldCheck, Sparkles } from 'lucide-react'
import type { AIProviderSettings } from './aiSettingsPresentation'

type Props = {
  settings: AIProviderSettings | null
  openAIModel: string
  nvidiaModel: string
  error: string
  notice: string
  busy: boolean
}

export default function AISettingsHeader({ settings, openAIModel, nvidiaModel, error, notice, busy }: Props) {
  return <>
    <div className="page-heading ai-settings-page-heading screen-page-header"><span className="ai-page-title-icon" aria-hidden="true"><Sparkles size={20}/></span><div><p className="eyebrow">YAPAY ZEKA <span>·</span> BAĞLANTI</p><h1>AI sağlayıcı ayarları</h1><p className="muted">Bu firmanın AI sohbetinde kullanılacak sağlayıcıyı ve API anahtarlarını yönetin.</p></div></div>
    {error && <div className="alert">{error}</div>}{notice && <div className="notice">{notice}</div>}
    <div className="ai-settings-commandbar"><div><small>FİRMA PROFİLİ</small><b>{settings ? `${settings.provider} · ${settings.provider === 'OpenAI' ? openAIModel || 'Model seçilmedi' : nvidiaModel || 'Model seçilmedi'}` : 'Ayarlar yükleniyor'}</b><span>{settings?.liveEvaluationEnabled ? 'Sentetik kalite testi açık' : 'Sağlayıcı ayarları'}</span></div><span className="ai-commandbar-scope"><ShieldCheck size={14}/> Tenant kapsamında</span><button className="primary" type="submit" form="ai-provider-settings-form" disabled={busy || !settings}>{busy ? 'Kaydediliyor…' : 'Ayarları kaydet'} <span aria-hidden="true">→</span></button></div>
  </>
}
