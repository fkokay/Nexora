type Props = {
  error: string
  notice: string
  onDismissError: () => void
}

export default function ExchangeRatesMessages({ error, notice, onDismissError }: Props) {
  return <>
    {error && <div className="alert inline-alert">{error}<button onClick={onDismissError}>×</button></div>}
    {notice && <div className="notice">{notice}</div>}
  </>
}
