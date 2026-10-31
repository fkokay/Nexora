type ScreenField = { key: string; label: string; section?: string | null }

/** Renders contiguous section headers in the supplied (already visible and ordered) field list. */
export default function ScreenViewGroupHeader({ fields, generalLabel = 'Genel' }: { fields: ScreenField[]; generalLabel?: string }) {
  const groups = fields.reduce<{ label: string; count: number }[]>((result, field) => {
    const label = field.section?.trim() || generalLabel
    const current = result[result.length - 1]
    if (current?.label === label) current.count++
    else result.push({ label, count: 1 })
    return result
  }, [])

  if (!fields.some(field => field.section?.trim())) return null
  return <tr className="screen-view-group-row">{groups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.count}>{group.label}</th>)}</tr>
}
