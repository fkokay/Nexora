export function SettingsSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} className={`settings-switch${checked ? ' is-on' : ''}`} onClick={onChange} aria-label={label}><i/></button>
}
