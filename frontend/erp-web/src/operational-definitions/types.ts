export type DefinitionKind = 'Workplace' | 'Branch' | 'Factory'

export type Definition = {
  id: string
  code: string
  name: string
  kind: DefinitionKind
  isActive: boolean
  rowVersion: string
}

export type Translate = (turkish: string, english: string) => string
