import type { ChangeEvent } from 'react'
import type { Translate } from './types'

export type EmployeeFiltersProps = {
  search: string
  onSearchChange: (value: string) => void
  visibleCount: number
  totalCount: number
  translate: Translate
}

export default function EmployeeFilters({ search, onSearchChange, visibleCount, totalCount, translate }: EmployeeFiltersProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)

  return (
    <div className="hr-list-toolbar">
      <label>
        <span>{translate('Personel ara', 'Search employees')}</span>
        <input
          type="search"
          value={search}
          onChange={handleSearchChange}
          placeholder={translate('Kod, ad, departman veya görev', 'Code, name, department, or job title')}
        />
      </label>
      <small>{translate(`${visibleCount} / ${totalCount} kayıt`, `${visibleCount} / ${totalCount} records`)}</small>
    </div>
  )
}
