export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addLocalCalendarDays(days: number, date = new Date()): string {
  return localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}
