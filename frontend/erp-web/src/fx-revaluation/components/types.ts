import type { FxRevaluationVoucher, FxRevaluationVoucherSummary } from '../../erp-types'

export type FxRevaluationMoneyFormatter = (value: number, currency: string) => string

export type FxRevaluationHeaderProps = {
  /** Voucher count shown next to the title; null while unknown. */
  count: number | null
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
  emptyMessage: string
  /** Page toolbar element (list-v2) that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null
  money: FxRevaluationMoneyFormatter
  onOpen: (id: string) => void
}

export type FxRevaluationVoucherDetailProps = {
  token: string
  voucher: FxRevaluationVoucher
  money: FxRevaluationMoneyFormatter
  onClose: () => void
}
