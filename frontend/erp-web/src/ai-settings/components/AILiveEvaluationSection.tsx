import { ShieldCheck } from 'lucide-react'
import { formatEvaluationUsage, type AIProviderSettings, type LiveAiEvaluationResult } from './aiSettingsPresentation'

type Props = {
  settings: AIProviderSettings | null
  evaluationStatus: 'unknown' | 'enabled' | 'disabled'
  evaluationBusy: boolean
  evaluationError: string
  evaluationResult: LiveAiEvaluationResult | null
  onRun: () => void
}

export default function AILiveEvaluationSection({ settings, evaluationStatus, evaluationBusy, evaluationError, evaluationResult, onRun }: Props) {
  return <section className="ai-live-evaluation" aria-labelledby="ai-live-evaluation-title"><div className="ai-live-evaluation-heading"><div><p className="eyebrow">SENTETİK KALİTE KONTROLÜ</p><h3 id="ai-live-evaluation-title">Sentetik kalite testi</h3><p>ERP kayıtlarına erişmeden sabit bir örnekle AI yanıtını kontrol edin.</p></div><span className={`ai-evaluation-status ${evaluationStatus}`}>{evaluationStatus === 'enabled' ? 'Açık' : evaluationStatus === 'disabled' ? 'Kapalı' : 'Durum doğrulanmadı'}</span></div>
    <div className="ai-evaluation-notice"><ShieldCheck size={16}/><span>Başlatmadan önce: Bu işlem kayıtlı OpenAI modeli ve sunucuda kayıtlı OpenAI anahtarıyla Responses API’ye <b>tek bir sentetik çağrı</b> gönderir ve sağlayıcı ücretlendirmesine tabi olabilir. Bu ekran güvenilir güncel bir fiyat tahmini sunmuyor; yanıt token kullanımını içerirse gösterilir. Sohbet geçmişi, gerçek ERP verisi ve API anahtarı gönderilmez veya gösterilmez.</span></div>
    {evaluationError && <div className="alert" role="alert">{evaluationError}</div>}
    {evaluationResult && <div className="ai-evaluation-result" role="status"><b>Sentetik çağrı tamamlandı</b><span>Set: {evaluationResult.evaluationSetId} · Fixture: {evaluationResult.caseId}</span><span>Saklama: {evaluationResult.store === false ? 'Kapalı' : 'Bilinmiyor'} · İnsan değerlendirmesi: {evaluationResult.humanReviewRequired ? 'Gerekli' : 'Gerekli değil'}</span>{formatEvaluationUsage(evaluationResult.usage) && <span>{formatEvaluationUsage(evaluationResult.usage)}</span>}</div>}
    <div className="ai-evaluation-footer"><small>{evaluationStatus === 'disabled' ? 'Test kapalı. TenantAdmin, sunucu ayarında AI:LiveEvaluation:Enabled=true değerini açıp API’yi yeniden başlatmalıdır.' : !settings?.openAIKeyConfigured || settings.provider !== 'OpenAI' ? 'Test için kayıtlı OpenAI sağlayıcısı ve API anahtarı gerekir.' : 'Feature flag açık; çalıştırma için tek sentetik provider çağrısı gerekir.'}</small><button type="button" className="primary" onClick={onRun} disabled={evaluationBusy || evaluationStatus === 'disabled' || !settings?.openAIKeyConfigured || settings.provider !== 'OpenAI'}>{evaluationBusy ? 'Çalıştırılıyor…' : 'Tek sentetik çağrıyı çalıştır'}</button></div>
  </section>
}
