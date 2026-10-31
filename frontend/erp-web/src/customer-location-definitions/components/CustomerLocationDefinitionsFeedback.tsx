import { X } from 'lucide-react'

type Props = {
  error: string
  notice: string
  onDismissError: () => void
  onDismissNotice: () => void
}

export function CustomerLocationDefinitionsFeedback({ error, notice, onDismissError, onDismissNotice }: Props) {
  return <>
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" onClick={onDismissError}><X size={15}/></button></div>}
    {notice && <div className="notice">{notice}<button type="button" onClick={onDismissNotice}><X size={15}/></button></div>}
  </>
}
