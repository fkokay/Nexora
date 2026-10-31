import { useEffect, useState, type FormEvent } from 'react'
import './ai-settings.css'
import AIProviderInspector from './ai-settings/components/AIProviderInspector'
import AIProviderSettingsForm from './ai-settings/components/AIProviderSettingsForm'
import AILiveEvaluationSection from './ai-settings/components/AILiveEvaluationSection'
import AISettingsHeader from './ai-settings/components/AISettingsHeader'
import type { AIProviderSettings, LiveAiEvaluationResult } from './ai-settings/components/aiSettingsPresentation'

type RequestApi = <T>(url: string, token?: string, init?: RequestInit) => Promise<T>

export default function AISettingsPage({ token, requestApi }: { token: string; requestApi: RequestApi }) {
  const [settings, setSettings] = useState<AIProviderSettings | null>(null)
  const [provider, setProvider] = useState<'OpenAI' | 'NVIDIA'>('OpenAI')
  const [openAIKey, setOpenAIKey] = useState(''), [nvidiaKey, setNvidiaKey] = useState(''), [openAIModel, setOpenAIModel] = useState('gpt-6-astra'), [nvidiaModel, setNvidiaModel] = useState('')
  const [openAIModels, setOpenAIModels] = useState<string[]>([]), [nvidiaModels, setNvidiaModels] = useState<string[]>([]), [loadingOpenAIModels, setLoadingOpenAIModels] = useState(false), [loadingNvidiaModels, setLoadingNvidiaModels] = useState(false)
  const [clearOpenAI, setClearOpenAI] = useState(false), [clearNvidia, setClearNvidia] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [evaluationStatus, setEvaluationStatus] = useState<'unknown' | 'enabled' | 'disabled'>('unknown'), [evaluationBusy, setEvaluationBusy] = useState(false), [evaluationError, setEvaluationError] = useState(''), [evaluationResult, setEvaluationResult] = useState<LiveAiEvaluationResult | null>(null)

  async function load() {
    const result = await requestApi<AIProviderSettings>('/api/ai-settings', token)
    setSettings(result); setProvider(result.provider); setOpenAIModel(result.openAIModel); setNvidiaModel(result.nvidiaModel); setOpenAIKey(''); setNvidiaKey(''); setClearOpenAI(false); setClearNvidia(false); setEvaluationStatus(result.liveEvaluationEnabled ? 'enabled' : 'disabled')
  }
  useEffect(() => { void load().catch(e => setError((e as Error).message)) }, [token])

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = await requestApi<AIProviderSettings>('/api/ai-settings', token, { method: 'PUT', body: JSON.stringify({ provider, openAIKey: openAIKey || null, openAIModel, nvidiaKey: nvidiaKey || null, nvidiaModel, clearOpenAIKey: clearOpenAI, clearNvidiaKey: clearNvidia }) })
      setSettings(result); setEvaluationStatus(result.liveEvaluationEnabled ? 'enabled' : 'disabled'); setOpenAIKey(''); setNvidiaKey(''); setNotice('AI sağlayıcı ayarları güvenli biçimde kaydedildi.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function loadOpenAIModels() {
    setLoadingOpenAIModels(true); setError(''); setNotice('')
    try { const result = await requestApi<{ models: string[] }>('/api/ai-settings/openai-models', token, { method: 'POST', body: JSON.stringify({ apiKey: openAIKey || null }) }); setOpenAIModels(result.models); setNotice(`${result.models.length} OpenAI modeli yüklendi.`) }
    catch (e) { setError((e as Error).message) } finally { setLoadingOpenAIModels(false) }
  }
  async function loadNvidiaModels() {
    setLoadingNvidiaModels(true); setError(''); setNotice('')
    try { const result = await requestApi<{ models: string[] }>('/api/ai-settings/nvidia-models', token, { method: 'POST', body: JSON.stringify({ apiKey: nvidiaKey || null }) }); setNvidiaModels(result.models); setNotice(`${result.models.length} NVIDIA modeli yüklendi.`) }
    catch (e) { setError((e as Error).message) } finally { setLoadingNvidiaModels(false) }
  }
  async function runSyntheticEvaluation() {
    setEvaluationBusy(true); setEvaluationError(''); setEvaluationResult(null)
    try { const result = await requestApi<LiveAiEvaluationResult>('/api/ai-settings/live-evaluation', token, { method: 'POST', body: JSON.stringify({ caseId: 'inventory-arithmetic' }) }); setEvaluationStatus('enabled'); setEvaluationResult(result) }
    catch (e) {
      const message = (e as Error).message; setEvaluationError(message)
      if (/\b404\b|not found|bulunamadı/i.test(message)) { setEvaluationStatus('disabled'); setEvaluationError('Sentetik kalite testi bu sunucuda kapalı. TenantAdmin, sunucu ayarında AI:LiveEvaluation:Enabled=true değerini açıp API’yi yeniden başlatmalıdır.') }
      else if (!/\b401\b|\b403\b/.test(message)) setEvaluationStatus('enabled')
    } finally { setEvaluationBusy(false) }
  }

  return <div className="ai-settings-page">
    <AISettingsHeader settings={settings} openAIModel={openAIModel} nvidiaModel={nvidiaModel} error={error} notice={notice} busy={busy}/>
    <div className="ai-settings-layout">
      <section className="panel ai-settings-panel"><AIProviderSettingsForm settings={settings} provider={provider} setProvider={setProvider} openAIKey={openAIKey} setOpenAIKey={setOpenAIKey} nvidiaKey={nvidiaKey} setNvidiaKey={setNvidiaKey} openAIModel={openAIModel} setOpenAIModel={setOpenAIModel} nvidiaModel={nvidiaModel} setNvidiaModel={setNvidiaModel} openAIModels={openAIModels} nvidiaModels={nvidiaModels} loadingOpenAIModels={loadingOpenAIModels} loadingNvidiaModels={loadingNvidiaModels} clearOpenAI={clearOpenAI} setClearOpenAI={setClearOpenAI} clearNvidia={clearNvidia} setClearNvidia={setClearNvidia} onSave={save} onLoadOpenAIModels={() => void loadOpenAIModels()} onLoadNvidiaModels={() => void loadNvidiaModels()}/>
        <AILiveEvaluationSection settings={settings} evaluationStatus={evaluationStatus} evaluationBusy={evaluationBusy} evaluationError={evaluationError} evaluationResult={evaluationResult} onRun={() => void runSyntheticEvaluation()}/>
      </section>
      <AIProviderInspector settings={settings} provider={provider} openAIModel={openAIModel} nvidiaModel={nvidiaModel} openAIModels={openAIModels} nvidiaModels={nvidiaModels}/>
    </div>
  </div>
}
