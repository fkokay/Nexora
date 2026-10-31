import AdvancedDataGrid from '../../AdvancedDataGrid'
import { ShieldCheck, Sparkles } from 'lucide-react'
import type { FormEvent } from 'react'
import type { AIProviderSettings } from './aiSettingsPresentation'
import { formatOpenAiUsdPrice, OPENAI_GPT6_COMPARISON, OPENAI_MODEL_PRICES } from './aiSettingsPresentation'

type Props = {
  settings: AIProviderSettings | null
  provider: 'OpenAI' | 'NVIDIA'
  setProvider: (provider: 'OpenAI' | 'NVIDIA') => void
  openAIKey: string
  setOpenAIKey: (value: string) => void
  nvidiaKey: string
  setNvidiaKey: (value: string) => void
  openAIModel: string
  setOpenAIModel: (value: string) => void
  nvidiaModel: string
  setNvidiaModel: (value: string) => void
  openAIModels: string[]
  nvidiaModels: string[]
  loadingOpenAIModels: boolean
  loadingNvidiaModels: boolean
  clearOpenAI: boolean
  setClearOpenAI: (value: boolean) => void
  clearNvidia: boolean
  setClearNvidia: (value: boolean) => void
  onSave: (event: FormEvent) => void
  onLoadOpenAIModels: () => void
  onLoadNvidiaModels: () => void
}

type CredentialCardProps = {
  title: string
  configured: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
  helpText: string
  clearLabel: string
  clear: boolean
  onClearChange: (value: boolean) => void
}

function CredentialCard({ title, configured, value, onChange, placeholder, helpText, clearLabel, clear, onClearChange }: CredentialCardProps) {
  return <label className="ai-credential-card"><span className="ai-credential-title"><b>{title}</b><span className={configured ? 'credential-status configured' : 'credential-status'}>{configured ? 'Anahtar kayıtlı' : 'Yapılandırılmadı'}</span></span><input type="password" autoComplete="new-password" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={1024}/><small>{helpText}</small>{configured && <span className="inline-check"><input type="checkbox" checked={clear} onChange={event => onClearChange(event.target.checked)}/> {clearLabel}</span>}</label>
}

function OpenAIModelSettings({ model, setModel, models, loading, onLoad }: { model: string; setModel: (value: string) => void; models: string[]; loading: boolean; onLoad: () => void }) {
  return <div className="ai-model-field"><div className="ai-model-heading"><label htmlFor="openai-model">OpenAI modeli<small>API anahtarınızla erişilebilen metin modelleri listelenir.</small></label><button type="button" className="secondary" onClick={onLoad} disabled={loading}>{loading ? 'Yükleniyor…' : 'Modelleri getir'}</button></div><select id="openai-model" value={model} onChange={event => setModel(event.target.value)} disabled={models.length === 0 && !model}><option value="">Model seçin</option>{model && !models.includes(model) && <option value={model}>{model} · kayıtlı</option>}{models.map(item => { const price = OPENAI_MODEL_PRICES[item]; return <option key={item} value={item}>{item}{price ? ` · ${formatOpenAiUsdPrice(price.inputUsdPerMillion)} input / ${formatOpenAiUsdPrice(price.outputUsdPerMillion)} output per 1M tokens (USD)` : ''}</option> })}</select><small>Model listesi OpenAI API anahtarınızla sunucu üzerinden alınır.</small>
    {model && <div className="ai-model-cost"><b>Seçili model maliyeti · {model}</b>{OPENAI_MODEL_PRICES[model] ? <p>Girdi <strong>{formatOpenAiUsdPrice(OPENAI_MODEL_PRICES[model].inputUsdPerMillion)}</strong> / 1M token <span>·</span> Çıktı <strong>{formatOpenAiUsdPrice(OPENAI_MODEL_PRICES[model].outputUsdPerMillion)}</strong> / 1M token</p> : <p>Bu model için fiyat bilgisi listede yok. Güncel tutarı OpenAI fiyatlandırma sayfasından doğrulayın.</p>}<small>USD / 1M metin tokenı · Standart işleme, kısa bağlam · Fiyatlar 27.10.2026 tarihinde doğrulandı. 272K üzeri girdi, farklı işleme türleri ve bölgesel uç noktalar farklı fiyatlanabilir.</small></div>}
    <div className="ai-model-comparison"><b>GPT-6 model karşılaştırması</b><div className="ai-model-comparison-scroll"><AdvancedDataGrid><thead><tr><th>Model</th><th>Kullanım</th><th>Girdi · USD / 1M token</th><th>Çıktı · USD / 1M token</th><th>Bağlam</th></tr></thead><tbody>{OPENAI_GPT6_COMPARISON.map(item => { const price = OPENAI_MODEL_PRICES[item.id]; return <tr key={item.id} className={model === item.id ? 'selected' : ''}><td><b>{item.name}</b><small>{item.id}</small></td><td>{item.use}</td><td>{price ? formatOpenAiUsdPrice(price.inputUsdPerMillion) : 'Fiyat yok'}</td><td>{price ? formatOpenAiUsdPrice(price.outputUsdPerMillion) : 'Fiyat yok'}</td><td>1.05M token</td></tr> })}</tbody></AdvancedDataGrid></div><small>Fiyatlar USD cinsindendir; model erişimi API hesabınıza göre değişir. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">Güncel fiyatları OpenAI’de görüntüleyin</a>.</small></div>
  </div>
}

function NvidiaModelSettings({ model, setModel, models, loading, onLoad }: { model: string; setModel: (value: string) => void; models: string[]; loading: boolean; onLoad: () => void }) {
  return <div className="ai-model-field"><div className="ai-model-heading"><label htmlFor="nvidia-model">NVIDIA modeli<small>NVIDIA API kataloğundaki modeller listelenir.</small></label><button type="button" className="secondary" onClick={onLoad} disabled={loading}>{loading ? 'Yükleniyor…' : 'Modelleri getir'}</button></div><select id="nvidia-model" value={model} onChange={event => setModel(event.target.value)} disabled={models.length === 0 && !model}><option value="">Model seçin</option>{model && !models.includes(model) && <option value={model}>{model} · kayıtlı</option>}{models.map(item => <option key={item} value={item}>{item}</option>)}</select><small>Model listesi NVIDIA API’sinden sunucu üzerinden alınır.</small></div>
}

export default function AIProviderSettingsForm(props: Props) {
  const { settings, provider, setProvider, openAIKey, setOpenAIKey, nvidiaKey, setNvidiaKey, openAIModel, setOpenAIModel, nvidiaModel, setNvidiaModel, openAIModels, nvidiaModels, loadingOpenAIModels, loadingNvidiaModels, clearOpenAI, setClearOpenAI, clearNvidia, setClearNvidia, onSave, onLoadOpenAIModels, onLoadNvidiaModels } = props
  return <><div className="panel-heading ai-settings-heading"><div><span className="ai-settings-icon"><Sparkles size={17}/></span><div><h3>AI sağlayıcı bağlantısı</h3><p>Bu firmanın Studio sohbetinde kullanılacak modeli ve erişim bilgilerini yönetin.</p></div></div><span className="ai-settings-scope"><ShieldCheck size={14}/> Firma ayarı</span></div>{settings && <form id="ai-provider-settings-form" onSubmit={onSave}>
    <div className="ai-provider-choice"><label htmlFor="ai-provider">Aktif sağlayıcı<span>Yeni sohbetlerde kullanılacak yapay zekâ</span></label><select id="ai-provider" value={provider} onChange={event => setProvider(event.target.value as 'OpenAI' | 'NVIDIA')}><option value="OpenAI">OpenAI</option><option value="NVIDIA">NVIDIA NIM</option></select></div>
    <div className="ai-credential-grid">{provider === 'OpenAI' ? <CredentialCard title="OpenAI API anahtarı" configured={settings.openAIKeyConfigured} value={openAIKey} onChange={setOpenAIKey} placeholder={settings.openAIKeyConfigured ? 'Yeni anahtar girerek değiştirin' : 'sk-…'} helpText={settings.openAIKeyConfigured ? 'Mevcut anahtar güvenli biçimde korunur.' : 'OpenAI hesabınızdaki API anahtarını girin.'} clearLabel="OpenAI anahtarını sil" clear={clearOpenAI} onClearChange={setClearOpenAI}/> : <CredentialCard title="NVIDIA NIM API anahtarı" configured={settings.nvidiaKeyConfigured} value={nvidiaKey} onChange={setNvidiaKey} placeholder={settings.nvidiaKeyConfigured ? 'Yeni anahtar girerek değiştirin' : 'nvapi-…'} helpText={settings.nvidiaKeyConfigured ? 'Mevcut anahtar güvenli biçimde korunur.' : 'NVIDIA NIM hesabınızdaki API anahtarını girin.'} clearLabel="NVIDIA anahtarını sil" clear={clearNvidia} onClearChange={setClearNvidia}/>}</div>
    {provider === 'OpenAI' ? <OpenAIModelSettings model={openAIModel} setModel={setOpenAIModel} models={openAIModels} loading={loadingOpenAIModels} onLoad={onLoadOpenAIModels}/> : <NvidiaModelSettings model={nvidiaModel} setModel={setNvidiaModel} models={nvidiaModels} loading={loadingNvidiaModels} onLoad={onLoadNvidiaModels}/>}
    <div className="boundary-note"><ShieldCheck size={17}/><span>API anahtarları sunucuda şifrelenerek saklanır ve tekrar gösterilmez. Sağlayıcı seçimi bu firmanın Studio AI sohbetine uygulanır.</span></div>
    <div className="ai-settings-footer"><span>{settings.provider === provider ? 'Şu anda seçili: ' + provider : 'Sağlayıcı değişikliği kaydedilmedi'}</span><span>Değişiklikler kaydedilene kadar etkinleşmez.</span></div>
  </form>}</>
}
