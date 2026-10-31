import { ShieldCheck, Sparkles } from 'lucide-react'
import type { AIProviderSettings } from './aiSettingsPresentation'
import { formatOpenAiUsdPrice, OPENAI_MODEL_PRICES } from './aiSettingsPresentation'

type Props = {
  settings: AIProviderSettings | null
  provider: 'OpenAI' | 'NVIDIA'
  openAIModel: string
  nvidiaModel: string
  openAIModels: string[]
  nvidiaModels: string[]
}

export default function AIProviderInspector({ settings, provider, openAIModel, nvidiaModel, openAIModels, nvidiaModels }: Props) {
  return <aside className="ai-provider-inspector" aria-label="Seçili sağlayıcı ve model bilgisi"><div className="ai-provider-inspector-heading"><span className="ai-settings-icon"><Sparkles size={17}/></span><div><small>BAĞLANTI DURUMU</small><h2>{provider === 'OpenAI' ? 'OpenAI' : 'NVIDIA NIM'}</h2></div><i className={provider === 'OpenAI' ? settings?.openAIKeyConfigured ? 'configured' : 'missing' : settings?.nvidiaKeyConfigured ? 'configured' : 'missing'} aria-label={provider === 'OpenAI' ? settings?.openAIKeyConfigured ? 'Anahtar kayıtlı' : 'Anahtar eksik' : settings?.nvidiaKeyConfigured ? 'Anahtar kayıtlı' : 'Anahtar eksik'}/></div><dl><div><dt>Seçili model</dt><dd>{provider === 'OpenAI' ? openAIModel || 'Seçilmedi' : nvidiaModel || 'Seçilmedi'}</dd></div><div><dt>API anahtarı</dt><dd>{provider === 'OpenAI' ? settings?.openAIKeyConfigured ? 'Kayıtlı · gizli' : 'Yapılandırılmadı' : settings?.nvidiaKeyConfigured ? 'Kayıtlı · gizli' : 'Yapılandırılmadı'}</dd></div><div><dt>Firma kapsamı</dt><dd>Studio AI sohbetleri</dd></div><div><dt>Model kataloğu</dt><dd>{provider === 'OpenAI' ? openAIModels.length ? `${openAIModels.length} model yüklendi` : 'Henüz yüklenmedi' : nvidiaModels.length ? `${nvidiaModels.length} model yüklendi` : 'Henüz yüklenmedi'}</dd></div></dl>{provider === 'OpenAI' && <div className="ai-inspector-price"><b>Model maliyeti · USD / 1M token</b>{OPENAI_MODEL_PRICES[openAIModel] ? <p>Girdi {formatOpenAiUsdPrice(OPENAI_MODEL_PRICES[openAIModel].inputUsdPerMillion)} <span>·</span> Çıktı {formatOpenAiUsdPrice(OPENAI_MODEL_PRICES[openAIModel].outputUsdPerMillion)}</p> : <p>Bu model için fiyat listesi bulunmuyor.</p>}<small>Standart metin işlemi · kısa bağlam</small></div>}<div className="ai-inspector-privacy"><ShieldCheck size={15}/><span>Anahtarlar sunucuda şifrelenir, tekrar gösterilmez. Değerler bu panoda yer almaz.</span></div></aside>
}
