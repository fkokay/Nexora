import { CalendarDays, Hash, ListChecks, ToggleLeft, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Field = { code: string; label: string; dataType: 'Text'|'Decimal'|'Date'|'Boolean'|'Choice'; isRequired: boolean; maxLength?: number|null; options?: string[]|null }
export type Form = { id:string; code:string; name:string; description:string|null; version:number; status:string; fields:Field[]; createdAt:string; updatedAt:string }
export type Submission = { id:string; formId:string; formCode:string; formName:string; formVersion:number; fields:Field[]; values:Record<string,string|null>; status:string; submittedByUserId:string; submittedAt:string; decisionReason:string|null }
export type Revision = { id:string; version:number; name:string; description:string|null; fields:Field[]; changeKind:string; createdAt:string }
export type FieldTypeOption = {type:Field['dataType']; label:string; icon: LucideIcon}

export const fieldTypes: FieldTypeOption[] = [
  {type:'Text',label:'Metin',icon:Type},
  {type:'Decimal',label:'Sayı',icon:Hash},
  {type:'Date',label:'Tarih',icon:CalendarDays},
  {type:'Boolean',label:'Evet / Hayır',icon:ToggleLeft},
  {type:'Choice',label:'Seçim listesi',icon:ListChecks},
]
