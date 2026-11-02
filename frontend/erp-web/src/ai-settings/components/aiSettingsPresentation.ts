export type AIProviderSettings = {
  provider: 'OpenAI' | 'NVIDIA'
  openAIKeyConfigured: boolean
  openAIModel: string
  nvidiaKeyConfigured: boolean
  nvidiaModel: string
  liveEvaluationEnabled: boolean
}

export type LiveAiEvaluationResult = {
  evaluationSetId: string
  caseId: string
  answer?: string
  store: boolean
  humanReviewRequired: boolean
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  } | null
}

export function formatEvaluationUsage(usage: LiveAiEvaluationResult['usage']) {
  if (!usage) return ''
  const input = usage.inputTokens ?? usage.input_tokens
  const output = usage.outputTokens ?? usage.output_tokens
  const total = usage.totalTokens ?? usage.total_tokens
  const parts = [
    typeof input === 'number' ? `Girdi ${input}` : '',
    typeof output === 'number' ? `Çıktı ${output}` : '',
    typeof total === 'number' ? `Toplam ${total}` : '',
  ].filter(Boolean)
  return parts.length ? `Token kullanımı · ${parts.join(' · ')}` : ''
}

// OpenAI Standard text-token rates, USD per 1M tokens; verified 2026-10-27.
// Source: https://developers.openai.com/api/docs/pricing (short-context Standard rates).
// Unknown/new model IDs stay unpriced instead of inheriting an estimate.
export const OPENAI_MODEL_PRICES: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> = {
  'gpt-6-luna': { inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.50 },
  'gpt-6.1-sol': { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
  'gpt-6.1-terra': { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
  'gpt-6-astra': { inputUsdPerMillion: 10, outputUsdPerMillion: 50 },
}

export const OPENAI_GPT6_COMPARISON = [
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', use: 'Odaklı, yüksek hacimli işler' },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', use: 'Hızlı, verimli görsel akıl yürütme' },
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', use: 'Karmaşık işler için denge' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', use: 'En zorlu akıl yürütme ve kodlama' },
] as const

export const formatOpenAiUsdPrice = (price: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(price)
