export function ManufacturingCostVarianceError({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  if (!error) return null
  return <div className="alert inline-alert" role="alert">{error}<button type="button" onClick={onDismiss}>×</button></div>
}
