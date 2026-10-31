import type { FxRevaluationMessagesProps } from './types'

export default function FxRevaluationMessages({ error, notice, onDismissError, onDismissNotice }: FxRevaluationMessagesProps) {
  return <>
    {error&&<div className="alert inline-alert">{error}<button onClick={onDismissError}>×</button></div>}
    {notice&&<div className="notice">{notice}<button onClick={onDismissNotice}>×</button></div>}
  </>
}
