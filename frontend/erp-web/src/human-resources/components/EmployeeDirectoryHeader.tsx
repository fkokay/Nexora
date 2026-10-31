import { Plus } from 'lucide-react'
import type { Translate } from './types'

export type EmployeeDirectoryHeaderProps = {
  isAdmin: boolean
  busy: boolean
  onAddEmployee: () => void
  translate: Translate
}

export default function EmployeeDirectoryHeader({ isAdmin, busy, onAddEmployee, translate }: EmployeeDirectoryHeaderProps) {
  return (
    <div className="panel-heading">
      <div>
        <h3>{translate('Personel listesi', 'Employee directory')}</h3>
        <p>{translate('Yalnız temel iş bilgileri tutulur. Kimlik, banka ve sağlık bilgileri istenmez.', 'Only basic work details are stored. No national ID, banking or health data is requested.')}</p>
      </div>
      {isAdmin && (
        <button type="button" className="primary" disabled={busy} onClick={onAddEmployee}>
          <Plus size={16} />
          {translate('Personel ekle', 'Add employee')}
        </button>
      )}
    </div>
  )
}
