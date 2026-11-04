import { CalendarDays, Hash, ListChecks, ToggleLeft, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Field = { code: string; label: string; dataType: 'Text'|'Decimal'|'Date'|'Boolean'|'Choice'; isRequired: boolean; maxLength?: number|null; minLength?: number|null; minValue?: number|null; maxValue?: number|null; minDate?: string|null; maxDate?: string|null; placeholder?: string|null; helpText?: string|null; isMultiline?: boolean; defaultValue?: string|null; textFormat?: 'None'|'Email'|'Url'|'Phone'; sectionTitle?: string|null; options?: string[]|null; visibleWhenFieldCode?: string|null; visibleWhenValue?: string|null; requiredWhenFieldCode?: string|null; requiredWhenValue?: string|null }
export type Form = { id:string; code:string; name:string; description:string|null; version:number; status:string; fields:Field[]; createdAt:string; updatedAt:string }
export type Submission = { id:string; formId:string; formCode:string; formName:string; formVersion:number; fields:Field[]; values:Record<string,string|null>; status:string; submittedByUserId:string; submittedAt:string; decisionReason:string|null }
export type Revision = { id:string; version:number; name:string; description:string|null; fields:Field[]; changeKind:string; createdAt:string }
export type FieldTypeOption = {type:Field['dataType']; label:string; icon: LucideIcon}

function conditionMatches(sourceCode: string | null | undefined, expectedValue: string | null | undefined, values: Record<string, string | null | undefined>, fields: Field[]) {
  if (!sourceCode || expectedValue == null) return false
  const actual = values[sourceCode]
  if (actual == null) return false
  const source = fields.find((item) => item.code === sourceCode)
  if (source?.dataType === 'Decimal') {
    const normalize = (value: string) => {
      const match = value.trim().match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/)
      if (!match) return null
      const sign = match[1] === '-' ? '-' : ''
      const whole = (match[2] ?? '0').replace(/^0+(?=\d)/, '')
      const fraction = (match[3] ?? match[4] ?? '').replace(/0+$/, '')
      const isZero = /^0+$/.test(whole) && !fraction
      return `${isZero ? '' : sign}${whole}${fraction ? `.${fraction}` : ''}`
    }
    const normalizedActual = normalize(actual)
    return normalizedActual != null && normalizedActual === normalize(expectedValue)
  }
  return actual === expectedValue
}

export function isFieldVisible(field: Field, values: Record<string, string | null | undefined>, fields: Field[] = []) {
  if (!field.visibleWhenFieldCode && field.visibleWhenValue == null) return true
  return conditionMatches(field.visibleWhenFieldCode, field.visibleWhenValue, values, fields)
}

export function isFieldRequired(field: Field, values: Record<string, string | null | undefined>, fields: Field[] = []) {
  return field.isRequired || conditionMatches(field.requiredWhenFieldCode, field.requiredWhenValue, values, fields)
}

export function getDefaultFieldValues(fields: Field[]) {
  return Object.fromEntries(
    fields
      .filter((field) => field.defaultValue != null && field.defaultValue !== '')
      .map((field) => [field.code, field.defaultValue as string]),
  ) as Record<string, string>
}

export function groupFieldsBySection(fields: Field[]) {
  return fields.reduce<Array<{ title: string | null; fields: Field[] }>>((groups, field) => {
    const title = field.sectionTitle?.trim() || null
    const last = groups.at(-1)
    if (last && last.title === title) last.fields.push(field)
    else groups.push({ title, fields: [field] })
    return groups
  }, [])
}

export const fieldTypes: FieldTypeOption[] = [
  {type:'Text',label:'Metin',icon:Type},
  {type:'Decimal',label:'Sayı',icon:Hash},
  {type:'Date',label:'Tarih',icon:CalendarDays},
  {type:'Boolean',label:'Evet / Hayır',icon:ToggleLeft},
  {type:'Choice',label:'Seçim listesi',icon:ListChecks},
]
