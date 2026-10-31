import type { FxRevaluationVoucher, FxRevaluationVoucherSummary } from '../../erp-types'

export type FxRevaluationMoneyFormatter = (value: number, currency: string) => string

export type FxRevaluationHeaderProps = {
  onRefresh: () => void
}

export type FxRevaluationMessagesProps = {
  error: string
  notice: string
  onDismissError: () => void
  onDismissNotice: () => void
}

export type FxRevaluationCreateFormProps = {
  date: string
  today: string
  busy: boolean
  onDateChange: (date: string) => void
  onCreate: () => void
}

export type FxRevaluationVoucherGridProps = {
  token: string
  vouchers: FxRevaluationVoucherSummary[]
  money: FxRevaluationMoneyFormatter
  onOpen: (id: string) => void
}

export type FxRevaluationVoucherDetailProps = {
  token: string
  voucher: FxRevaluationVoucher
  money: FxRevaluationMoneyFormatter
  onClose: () => void
}
